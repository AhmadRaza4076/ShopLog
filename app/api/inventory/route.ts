import { NextRequest, NextResponse } from 'next/server';
import {
  DEMO_SHOP_ID,
  createShopItem,
  ensureDemoShop,
  getAllTransactions,
  getShopItems,
  saveParsedTransaction,
} from '@/lib/db';
import { computeInventory } from '@/lib/computed';
import { canonicalItemName, collectKnownItemNames } from '@/lib/item-names';
import type { ShopItemInput } from '@/lib/types';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

async function loadInventory() {
  await ensureDemoShop();
  const [transactions, catalog] = await Promise.all([
    getAllTransactions(DEMO_SHOP_ID),
    getShopItems(DEMO_SHOP_ID),
  ]);
  return computeInventory(transactions, catalog);
}

export async function GET() {
  try {
    const items = await loadInventory();
    return NextResponse.json({ items });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load inventory.');
  }
}

/** Add a new product to the catalog; optional opening_qty creates an opening purchase. */
export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = (await req.json()) as ShopItemInput;

    if (!body.item_name?.trim()) {
      return NextResponse.json({ error: 'item_name is required' }, { status: 400 });
    }

    const existing = await getAllTransactions(DEMO_SHOP_ID);
    const known = collectKnownItemNames(existing);
    const canonical = canonicalItemName(body.item_name, known);

    const input: ShopItemInput = {
      item_name: canonical,
      buy_price: body.buy_price ?? null,
      sell_price: body.sell_price ?? null,
      low_stock_at: Math.round(body.low_stock_at ?? 5),
    };

    await createShopItem(DEMO_SHOP_ID, input);

    const openingQty = Math.round(body.quantity_on_hand ?? body.opening_qty ?? 0);
    if (openingQty > 0) {
      const unitPrice = input.buy_price;
      const total = unitPrice != null ? unitPrice * openingQty : openingQty;
      await saveParsedTransaction(
        DEMO_SHOP_ID,
        {
          type: 'purchase',
          item_name: canonical,
          quantity: openingQty,
          unit_price: unitPrice,
          total_amount: total,
          customer_name: null,
          is_credit: false,
          confidence: 'high',
          note: 'Opening stock',
        },
        'system',
        '[Opening stock on product add]'
      );
    }

    const items = await loadInventory();
    return NextResponse.json({ items, item_name: canonical });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not add product.';
    if (msg.includes('already exists')) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return apiErrorResponse(error, 'Could not add product.');
  }
}
