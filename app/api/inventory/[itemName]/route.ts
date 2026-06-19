import { NextRequest, NextResponse } from 'next/server';
import {
  DEMO_SHOP_ID,
  countItemTransactions,
  deleteShopItem,
  ensureDemoShop,
  getAllTransactions,
  getShopItems,
  saveParsedTransaction,
  updateShopItem,
} from '@/lib/db';
import { computeInventory } from '@/lib/computed';
import { buildSetStockParsed } from '@/lib/voice-lookup';
import type { ShopItemInput } from '@/lib/types';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { itemName: string } };

async function loadInventory() {
  const [transactions, catalog] = await Promise.all([
    getAllTransactions(DEMO_SHOP_ID),
    getShopItems(DEMO_SHOP_ID),
  ]);
  return computeInventory(transactions, catalog);
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    await ensureDemoShop();
    const oldName = decodeURIComponent(params.itemName);
    const body = (await req.json()) as ShopItemInput;

    if (!body.item_name?.trim()) {
      return NextResponse.json({ error: 'item_name is required' }, { status: 400 });
    }

    const [transactionsBefore, catalogBefore] = await Promise.all([
      getAllTransactions(DEMO_SHOP_ID),
      getShopItems(DEMO_SHOP_ID),
    ]);
    const currentRow = computeInventory(transactionsBefore, catalogBefore).find(
      (r) => r.item_name === oldName
    );
    const currentQty = currentRow?.quantity_on_hand ?? 0;

    const newName = body.item_name.trim();
    await updateShopItem(DEMO_SHOP_ID, oldName, {
      item_name: newName,
      buy_price: body.buy_price ?? null,
      sell_price: body.sell_price ?? null,
      low_stock_at: Math.round(body.low_stock_at ?? 5),
    });

    const targetQty =
      body.quantity_on_hand != null ? Math.round(body.quantity_on_hand) : undefined;
    if (targetQty != null && targetQty !== currentQty) {
      const [transactionsAfter, catalogAfter] = await Promise.all([
        getAllTransactions(DEMO_SHOP_ID),
        getShopItems(DEMO_SHOP_ID),
      ]);
      const parsed = buildSetStockParsed(
        transactionsAfter,
        newName,
        targetQty,
        body.buy_price,
        catalogAfter
      );
      if (parsed.quantity !== 0) {
        await saveParsedTransaction(
          DEMO_SHOP_ID,
          parsed,
          'system',
          '[Stock count adjustment from inventory edit]'
        );
      }
    }

    const items = await loadInventory();
    return NextResponse.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not update product.';
    if (msg.includes('not found') || msg.includes('already exists')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return apiErrorResponse(error, 'Could not update product.');
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    await ensureDemoShop();
    const itemName = decodeURIComponent(params.itemName);
    const txnCount = await countItemTransactions(DEMO_SHOP_ID, itemName);

    await deleteShopItem(DEMO_SHOP_ID, itemName);

    const items = await loadInventory();
    return NextResponse.json({
      items,
      removed: itemName,
      had_transaction_history: txnCount > 0,
    });
  } catch (error) {
    return apiErrorResponse(error, 'Could not delete product.');
  }
}
