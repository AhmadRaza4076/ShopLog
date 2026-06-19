import { NextRequest, NextResponse } from 'next/server';
import { DEMO_SHOP_ID, createCustomer, ensureDemoShop, getAllCustomers } from '@/lib/db';
import type { CustomerInput } from '@/lib/types';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDemoShop();
    const customers = await getAllCustomers(DEMO_SHOP_ID);
    return NextResponse.json({ customers });
  } catch (error) {
    return apiErrorResponse(error, 'Could not load customers.');
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const body = (await req.json()) as CustomerInput;

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const customer = await createCustomer(DEMO_SHOP_ID, {
      name: body.name.trim(),
      phone: body.phone ?? null,
      notes: body.notes ?? null,
    });

    const customers = await getAllCustomers(DEMO_SHOP_ID);
    return NextResponse.json({ customer, customers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not add customer.';
    if (msg.includes('already exists')) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return apiErrorResponse(error, 'Could not add customer.');
  }
}
