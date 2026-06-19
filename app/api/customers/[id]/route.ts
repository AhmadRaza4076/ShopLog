import { NextRequest, NextResponse } from 'next/server';
import { validate as isUuid } from 'uuid';
import {
  DEMO_SHOP_ID,
  deleteCustomer,
  ensureDemoShop,
  getAllCustomers,
  updateCustomer,
} from '@/lib/db';
import type { CustomerInput } from '@/lib/types';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

type RouteContext = { params: { id: string } };

function assertValidCustomerId(id: string): NextResponse | null {
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid customer ID.' }, { status: 400 });
  }
  return null;
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const idError = assertValidCustomerId(params.id);
    if (idError) return idError;

    await ensureDemoShop();
    const body = (await req.json()) as CustomerInput;

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    const customer = await updateCustomer(DEMO_SHOP_ID, params.id, {
      name: body.name.trim(),
      phone: body.phone ?? null,
      notes: body.notes ?? null,
    });

    const customers = await getAllCustomers(DEMO_SHOP_ID);
    return NextResponse.json({ customer, customers });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not update customer.';
    if (msg.includes('not found') || msg.includes('already exists')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return apiErrorResponse(error, 'Could not update customer.');
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  try {
    const idError = assertValidCustomerId(params.id);
    if (idError) return idError;

    await ensureDemoShop();
    await deleteCustomer(DEMO_SHOP_ID, params.id);
    const customers = await getAllCustomers(DEMO_SHOP_ID);
    return NextResponse.json({ customers, removed: params.id });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not delete customer.';
    if (msg.includes('Cannot delete')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return apiErrorResponse(error, 'Could not delete customer.');
  }
}
