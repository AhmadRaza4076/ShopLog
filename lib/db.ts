import { neon } from '@neondatabase/serverless';
import type { ParsedTransaction, Transaction, EntrySource } from './types';

// A single hardcoded shop is enough for a hackathon demo — multi-shop
// login/auth is real future work, not needed to prove the concept.
export const DEMO_SHOP_ID = '00000000-0000-0000-0000-000000000001';
export const DEMO_SHOP_NAME = 'Malik General Store';
export const DEMO_OWNER_NAME = 'Malik Sahab';

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Create a free Postgres database at neon.tech, ' +
        'run scripts/schema.sql against it, then add the connection string to .env.local.'
    );
  }
  return url;
}

// `neon()` returns a tagged-template SQL function — sql`select ...` —
// which is the simplest way to query Neon from a serverless/edge route
// without managing a persistent connection pool ourselves.
export function sql() {
  return neon(getConnectionString());
}

/**
 * Ensures the demo shop row exists. Safe to call on every request;
 * it's a no-op after the first time.
 */
export async function ensureDemoShop() {
  const db = sql();
  await db`
    insert into shops (id, name, owner_name)
    values (${DEMO_SHOP_ID}, ${DEMO_SHOP_NAME}, ${DEMO_OWNER_NAME})
    on conflict (id) do nothing
  `;
}

/**
 * Looks up a customer by name (case-insensitive) for this shop, creating
 * one if it doesn't exist yet. Centralizing this means voice, typed, and
 * photo entries all resolve "Ali" to the same customer row.
 */
export async function getOrCreateCustomer(
  shopId: string,
  name: string
): Promise<{ id: string; name: string }> {
  const db = sql();
  const trimmed = name.trim();

  const existing = await db`
    select id, name from customers
    where shop_id = ${shopId} and lower(name) = lower(${trimmed})
    limit 1
  `;
  if (existing.length > 0) {
    return existing[0] as { id: string; name: string };
  }

  const inserted = await db`
    insert into customers (shop_id, name)
    values (${shopId}, ${trimmed})
    returning id, name
  `;
  return inserted[0] as { id: string; name: string };
}

/**
 * Saves a ParsedTransaction (the normalized shape produced by typed,
 * voice, or photo parsing) into the ledger, resolving or creating the
 * customer row as needed. This is the single write path every input
 * method funnels through.
 */
export async function saveParsedTransaction(
  shopId: string,
  parsed: ParsedTransaction,
  source: EntrySource,
  rawInput: string | null
): Promise<Transaction> {
  const db = sql();

  let customerId: string | null = null;
  let customerName: string | null = null;
  if (parsed.customer_name) {
    const customer = await getOrCreateCustomer(shopId, parsed.customer_name);
    customerId = customer.id;
    customerName = customer.name;
  }

  const rows = await db`
    insert into transactions
      (shop_id, type, item_name, quantity, unit_price, total_amount, customer_id, is_credit, source, raw_input)
    values
      (${shopId}, ${parsed.type}, ${parsed.item_name}, ${parsed.quantity}, ${parsed.unit_price},
       ${parsed.total_amount}, ${customerId}, ${parsed.is_credit}, ${source}, ${rawInput})
    returning *
  `;

  const row = rows[0] as Transaction;
  return { ...row, customer_name: customerName };
}

/**
 * Records a payment against a named customer — used by the manual
 * "mark as paid" action and by the voice agent's mark_payment tool.
 */
export async function recordPayment(
  shopId: string,
  customerName: string,
  amount: number
): Promise<Transaction> {
  const customer = await getOrCreateCustomer(shopId, customerName);
  const db = sql();
  const rows = await db`
    insert into transactions
      (shop_id, type, total_amount, customer_id, is_credit, source)
    values
      (${shopId}, 'payment', ${amount}, ${customer.id}, false, 'system')
    returning *
  `;
  const row = rows[0] as Transaction;
  return { ...row, customer_name: customer.name };
}

export async function getAllTransactions(shopId: string): Promise<Transaction[]> {
  const db = sql();
  const rows = await db`
    select t.*, c.name as customer_name
    from transactions t
    left join customers c on c.id = t.customer_id
    where t.shop_id = ${shopId}
    order by t.created_at desc
  `;
  return rows as Transaction[];
}

export async function getCustomerBalance(
  shopId: string,
  customerName: string
): Promise<{ customer_id: string; name: string; balance: number } | null> {
  const db = sql();
  const rows = await db`
    select
      c.id as customer_id,
      c.name,
      coalesce(sum(case when t.is_credit and t.type != 'payment' then t.total_amount else 0 end), 0)
        - coalesce(sum(case when t.type = 'payment' then t.total_amount else 0 end), 0) as balance
    from customers c
    left join transactions t on t.customer_id = c.id
    where c.shop_id = ${shopId} and lower(c.name) = lower(${customerName})
    group by c.id, c.name
    limit 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0] as { customer_id: string; name: string; balance: string };
  return { customer_id: row.customer_id, name: row.name, balance: Number(row.balance) };
}
