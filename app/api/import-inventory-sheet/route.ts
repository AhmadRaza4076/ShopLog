import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SHOP_ID, ensureDemoShop, getAllTransactions, saveParsedTransaction } from '@/lib/db';
import { canonicalItemName, collectKnownItemNames } from '@/lib/item-names';
import type { InventorySheetRow, ParsedTransaction } from '@/lib/types';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

/** Confirm and save bulk inventory rows as purchase transactions. */
export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = (await req.json()) as {
      rows: InventorySheetRow[];
      source?: 'typed' | 'photo';
      raw_input?: string | null;
    };

    if (!body.rows?.length) {
      return NextResponse.json({ error: 'rows array is required' }, { status: 400 });
    }

    const existing = await getAllTransactions(DEMO_SHOP_ID);
    const known = collectKnownItemNames(existing);
    const source = body.source ?? 'typed';
    const rawInput = body.raw_input ?? '[Bulk inventory import]';

    const transactions = [];
    for (const row of body.rows) {
      if (!row.item_name?.trim() || !row.quantity || row.quantity <= 0) continue;

      const itemName = canonicalItemName(row.item_name, known);
      if (!known.includes(itemName)) known.push(itemName);

      const unitPrice = row.unit_price ?? null;
      const total = unitPrice != null ? unitPrice * row.quantity : row.quantity;

      const parsed: ParsedTransaction = {
        type: 'purchase',
        item_name: itemName,
        quantity: row.quantity,
        unit_price: unitPrice,
        total_amount: total,
        customer_name: null,
        is_credit: false,
        confidence: 'high',
        note: 'Bulk inventory import',
      };

      const txn = await saveParsedTransaction(DEMO_SHOP_ID, parsed, source, rawInput);
      transactions.push(txn);
    }

    return NextResponse.json({
      imported: transactions.length,
      transactions,
    });
  } catch (error) {
    return apiErrorResponse(error, 'Could not import inventory.');
  }
}
