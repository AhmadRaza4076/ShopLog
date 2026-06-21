import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';
import type {
  ParsedTransaction,
  Transaction,
  EntrySource,
  ShopItem,
  ShopItemInput,
  CustomerInput,
  CustomerRecord,
  SaleInput,
  SaveTransactionOptions,
} from './types';
import {
  canonicalItemName,
  collectKnownItemNames,
  itemNameClusters,
} from './item-names';
import { computeSalesGrouped, computeCustomerBalances, enrichParsedTransactionAmounts, normalizeParsedTransaction, STOCK_ADJUSTMENT_MARKER } from './computed';
import { findCustomers } from './voice-lookup';
import { assertValidParsedTransaction } from './validate-transaction';

// A single hardcoded shop is enough for a hackathon demo — multi-shop
// login/auth is real future work, not needed to prove the concept.
export const DEMO_SHOP_ID = '00000000-0000-0000-0000-000000000001';
export const DEMO_SHOP_NAME = 'ShopLog';
export const DEMO_OWNER_NAME = 'Owner';

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
let sqlClient: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!sqlClient) {
    sqlClient = neon(getConnectionString());
  }
  return sqlClient;
}

/**
 * Ensures the demo shop row exists. Memoized per process — safe to call on every request.
 */
let demoShopReady = false;

export async function ensureDemoShop() {
  const db = sql();
  if (!demoShopReady) {
    await db`
      insert into shops (id, name, owner_name)
      values (${DEMO_SHOP_ID}, ${DEMO_SHOP_NAME}, ${DEMO_OWNER_NAME})
      on conflict (id) do nothing
    `;
    demoShopReady = true;
  }
  await ensureAliasCatalogItems(DEMO_SHOP_ID);
  // #region agent log
  fetch('http://127.0.0.1:7529/ingest/2b3e9191-6f23-4f1c-9132-c4bd485c14ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ca096'},body:JSON.stringify({sessionId:'4ca096',location:'db.ts:ensureDemoShop',message:'Demo shop ensured with alias catalog',data:{shopId:DEMO_SHOP_ID},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion
}

const ALIAS_CATALOG_DEFAULTS: ShopItemInput[] = [
  { item_name: 'Cement (bag)', buy_price: 950, sell_price: 1100, low_stock_at: 5 },
  { item_name: 'Rice (50kg bag)', buy_price: 5200, sell_price: 5800, low_stock_at: 5 },
];

/** Demo alias targets (cement, rice) need catalog prices for qty-only voice entries. */
export async function ensureAliasCatalogItems(shopId: string): Promise<void> {
  for (const input of ALIAS_CATALOG_DEFAULTS) {
    const existing = await getShopItemByName(shopId, input.item_name);
    if (!existing) {
      await createShopItem(shopId, input);
    }
  }
}

export async function getShop(shopId: string): Promise<{ id: string; name: string; owner_name: string } | null> {
  const db = sql();
  const rows = await db`select id, name, owner_name from shops where id = ${shopId} limit 1`;
  if (rows.length === 0) return null;
  return rows[0] as { id: string; name: string; owner_name: string };
}

/**
 * Looks up a customer by name (case-insensitive) for this shop, creating
 * one if it doesn't exist yet. Centralizing this means voice, typed, and
 * photo entries all resolve "Ali" to the same customer row.
 * Uses a single upsert query to avoid SELECT-then-INSERT races.
 */
export async function getOrCreateCustomer(
  shopId: string,
  name: string,
  phone?: string | null
): Promise<CustomerRecord> {
  const db = sql();
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Customer name is required.');
  }

  const existing = await db`
    select id, name, phone, notes from customers
    where shop_id = ${shopId} and lower(name) = lower(${trimmed})
    limit 1
  `;
  if (existing.length > 0) {
    const row = existing[0] as CustomerRecord;
    if (phone?.trim() && !row.phone) {
      await db`update customers set phone = ${phone.trim()} where id = ${row.id}`;
      return { ...row, phone: phone.trim() };
    }
    return row;
  }

  try {
    const inserted = await db`
      insert into customers (shop_id, name, phone)
      values (${shopId}, ${trimmed}, ${phone?.trim() || null})
      returning id, name, phone, notes
    `;
    return inserted[0] as CustomerRecord;
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (!/unique|duplicate/i.test(msg)) throw err;
    const retry = await db`
      select id, name, phone, notes from customers
      where shop_id = ${shopId} and lower(name) = lower(${trimmed})
      limit 1
    `;
    if (retry.length === 0) throw err;
    const row = retry[0] as CustomerRecord;
    if (phone?.trim() && !row.phone) {
      await db`update customers set phone = ${phone.trim()} where id = ${row.id}`;
      return { ...row, phone: phone.trim() };
    }
    return row;
  }
}

function mapCustomer(row: Record<string, unknown>): CustomerRecord {
  return {
    id: row.id as string,
    name: row.name as string,
    phone: (row.phone as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
  };
}

export async function getAllCustomers(shopId: string): Promise<CustomerRecord[]> {
  const db = sql();
  const rows = await db`
    select id, name, phone, notes from customers
    where shop_id = ${shopId}
    order by name asc
  `;
  return (rows as Record<string, unknown>[]).map(mapCustomer);
}

export async function getCustomerById(shopId: string, customerId: string): Promise<CustomerRecord | null> {
  const db = sql();
  const rows = await db`
    select id, name, phone, notes from customers
    where shop_id = ${shopId} and id = ${customerId}
    limit 1
  `;
  if (rows.length === 0) return null;
  return mapCustomer(rows[0] as Record<string, unknown>);
}

export async function createCustomer(shopId: string, input: CustomerInput): Promise<CustomerRecord> {
  const db = sql();
  const name = input.name.trim();
  if (!name) throw new Error('Customer name is required.');

  const existing = await db`
    select id from customers
    where shop_id = ${shopId} and lower(name) = lower(${name})
    limit 1
  `;
  if (existing.length > 0) {
    throw new Error(`Customer "${name}" already exists.`);
  }

  const rows = await db`
    insert into customers (shop_id, name, phone, notes)
    values (${shopId}, ${name}, ${input.phone?.trim() || null}, ${input.notes?.trim() || null})
    returning id, name, phone, notes
  `;
  return mapCustomer(rows[0] as Record<string, unknown>);
}

export async function updateCustomer(
  shopId: string,
  customerId: string,
  input: CustomerInput
): Promise<CustomerRecord> {
  const db = sql();
  const existing = await getCustomerById(shopId, customerId);
  if (!existing) throw new Error('Customer not found.');

  const name = input.name.trim();
  if (!name) throw new Error('Customer name is required.');

  if (name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await db`
      select id from customers
      where shop_id = ${shopId} and lower(name) = lower(${name}) and id != ${customerId}
      limit 1
    `;
    if (clash.length > 0) throw new Error(`Customer "${name}" already exists.`);
  }

  const rows = await db`
    update customers
    set
      name = ${name},
      phone = ${input.phone?.trim() || null},
      notes = ${input.notes?.trim() || null}
    where id = ${customerId} and shop_id = ${shopId}
    returning id, name, phone, notes
  `;
  return mapCustomer(rows[0] as Record<string, unknown>);
}

export async function countCustomerTransactions(shopId: string, customerId: string): Promise<number> {
  const db = sql();
  const rows = await db`
    select count(*)::int as cnt from transactions
    where shop_id = ${shopId} and customer_id = ${customerId}
  `;
  return Number((rows[0] as { cnt: number }).cnt);
}

export async function deleteCustomer(shopId: string, customerId: string): Promise<void> {
  const transactions = await getAllTransactions(shopId);
  const balances = computeCustomerBalances(transactions);
  const balance = balances[customerId]?.balance ?? 0;
  if (balance > 0) {
    throw new Error('Cannot delete — customer still owes money. Record payment first.');
  }

  const db = sql();
  await db`delete from customers where id = ${customerId} and shop_id = ${shopId}`;
}

/** @deprecated Substring item-name merging was removed. No-op kept for compatibility. */
export async function normalizeShopItemNames(_shopId: string): Promise<number> {
  return 0;
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
  rawInput: string | null,
  options?: SaveTransactionOptions
): Promise<Transaction> {
  const db = sql();

  let knownNames = options?.knownNames;
  const existing = knownNames ? null : await getAllTransactions(shopId);
  if (!knownNames) {
    knownNames = collectKnownItemNames(existing ?? []);
  }
  const catalog = await getShopItems(shopId);
  const enriched = enrichParsedTransactionAmounts(parsed, {
    catalog,
    transactions: existing ?? undefined,
    knownNames,
  });
  // #region agent log
  fetch('http://127.0.0.1:7529/ingest/2b3e9191-6f23-4f1c-9132-c4bd485c14ab',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4ca096'},body:JSON.stringify({sessionId:'4ca096',location:'db.ts:saveParsedTransaction',message:'Enrich amounts',data:{type:parsed.type,item:parsed.item_name,inTotal:parsed.total_amount,inQty:parsed.quantity,outTotal:enriched.total_amount,outUnit:enriched.unit_price,catalogCount:catalog.length,hasCement:catalog.some(c=>c.item_name.toLowerCase().includes('cement'))},timestamp:Date.now(),hypothesisId:'B'})}).catch(()=>{});
  // #endregion

  let normalized: ParsedTransaction;
  try {
    normalized = assertValidParsedTransaction(normalizeParsedTransaction(enriched));
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (
      msg.includes('total_amount') &&
      (parsed.type === 'sale' || parsed.type === 'purchase' || parsed.type === 'credit_given')
    ) {
      throw new Error(
        'Could not determine a price for this entry. Say the total or unit price (e.g. "2 cement bags at 1100 each"), or add the product to inventory with a sell price first.'
      );
    }
    throw err;
  }

  let customerId: string | null = null;
  let customerName: string | null = null;
  if (normalized.customer_name) {
    const customer = await getOrCreateCustomer(shopId, normalized.customer_name);
    customerId = customer.id;
    customerName = customer.name;
  }

  let itemName = normalized.item_name;
  if (itemName?.trim()) {
    itemName = canonicalItemName(itemName, knownNames);
  }

  const saleId = options?.sale_id ?? null;
  const adjustmentNote =
    normalized.note?.includes(STOCK_ADJUSTMENT_MARKER) ? normalized.note : null;
  const saleNotes = options?.sale_notes ?? adjustmentNote ?? null;

  const rows = await db`
    insert into transactions
      (shop_id, type, item_name, quantity, unit_price, total_amount, customer_id, is_credit, source, raw_input, sale_id, sale_notes)
    values
      (${shopId}, ${normalized.type}, ${itemName}, ${normalized.quantity}, ${normalized.unit_price},
       ${normalized.total_amount}, ${customerId}, ${normalized.is_credit}, ${source}, ${rawInput}, ${saleId}, ${saleNotes})
    returning *
  `;

  const row = rows[0] as Transaction;
  const saved = { ...row, customer_name: customerName };

  if (itemName?.trim() && !options?.skipShopItemUpsert) {
    await upsertShopItemFromTransaction(shopId, itemName, normalized.type, normalized.unit_price);
  }

  return saved;
}

/** Record a multi-line sale (POS) as grouped transaction rows sharing sale_id. */
export async function saveSale(
  shopId: string,
  input: SaleInput,
  source: EntrySource = 'typed'
): Promise<{ sale_id: string; transactions: Transaction[]; sale_number: number }> {
  if (!input.lines?.length) {
    throw new Error('At least one line item is required.');
  }
  if (input.payment === 'credit' && !input.customer_name?.trim()) {
    throw new Error('Customer is required for credit sales.');
  }

  const saleId = randomUUID();
  const isCredit = input.payment === 'credit';
  const customerName = input.customer_name?.trim() || null;
  const notes = input.notes?.trim() || null;
  const rawBase = notes ? `[POS sale] ${notes}` : '[POS sale]';

  const existing = await getAllTransactions(shopId);
  const known = collectKnownItemNames(existing);
  const transactions: Transaction[] = [];

  for (let i = 0; i < input.lines.length; i++) {
    const line = input.lines[i];
    if (!line.item_name?.trim() || !line.quantity || line.quantity <= 0) continue;

    const itemName = canonicalItemName(line.item_name, known);
    if (!known.includes(itemName)) known.push(itemName);

    const unitPrice = line.unit_price ?? null;
    const total = unitPrice != null ? unitPrice * line.quantity : line.quantity;

    const parsed: ParsedTransaction = {
      type: 'sale',
      item_name: itemName,
      quantity: line.quantity,
      unit_price: unitPrice,
      total_amount: total,
      customer_name: customerName,
      is_credit: isCredit,
      confidence: 'high',
    };

    const txn = await saveParsedTransaction(shopId, parsed, source, rawBase, {
      sale_id: saleId,
      sale_notes: i === 0 ? notes : null,
      knownNames: known,
    });
    transactions.push(txn);
  }

  if (transactions.length === 0) {
    throw new Error('At least one valid line item is required.');
  }

  const all = await getAllTransactions(shopId);
  const sales = computeSalesGrouped(all);
  const saleNumber = sales.find((s) => s.sale_id === saleId)?.sale_number ?? sales.length;

  return { sale_id: saleId, transactions, sale_number: saleNumber };
}

/**
 * Records a payment against a named customer — used by the manual
 * "mark as paid" action and by the voice agent's mark_payment tool.
 * Does not create customers; the customer must already exist in the ledger.
 */
export async function recordPayment(
  shopId: string,
  customerName: string,
  amount: number
): Promise<Transaction> {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('amount must be a positive number.');
  }

  const balance = await getCustomerBalance(shopId, customerName);
  if (!balance) {
    throw new Error(`No customer named "${customerName.trim()}" found in the ledger.`);
  }

  const db = sql();
  const rows = await db`
    insert into transactions
      (shop_id, type, total_amount, customer_id, is_credit, source)
    values
      (${shopId}, 'payment', ${amount}, ${balance.customer_id}, false, 'system')
    returning *
  `;
  const row = rows[0] as Transaction;
  return { ...row, customer_name: balance.name };
}

export async function getAllTransactions(shopId: string): Promise<Transaction[]> {
  const db = sql();
  const rows = await db`
    select t.*, c.name as customer_name, c.phone as customer_phone
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
): Promise<{ customer_id: string; name: string; balance: number; phone: string | null } | null> {
  const trimmed = customerName.trim();
  const [customers, transactions] = await Promise.all([
    getAllCustomers(shopId),
    getAllTransactions(shopId),
  ]);

  const { best } = findCustomers(customers, transactions, trimmed);
  if (!best) return null;

  return {
    customer_id: best.id,
    name: best.name,
    balance: best.balance,
    phone: best.phone,
  };
}

function mapShopItem(row: Record<string, unknown>): ShopItem {
  return {
    id: row.id as string,
    shop_id: row.shop_id as string,
    item_name: row.item_name as string,
    buy_price: row.buy_price != null ? Number(row.buy_price) : null,
    sell_price: row.sell_price != null ? Number(row.sell_price) : null,
    low_stock_at: Number(row.low_stock_at) || 5,
    updated_at: row.updated_at as string,
  };
}

export async function getShopItems(shopId: string): Promise<ShopItem[]> {
  const db = sql();
  const rows = await db`
    select * from shop_items
    where shop_id = ${shopId}
    order by item_name asc
  `;
  return (rows as Record<string, unknown>[]).map(mapShopItem);
}

export async function getShopItemByName(
  shopId: string,
  itemName: string
): Promise<ShopItem | null> {
  const db = sql();
  const rows = await db`
    select * from shop_items
    where shop_id = ${shopId} and lower(item_name) = lower(${itemName.trim()})
    limit 1
  `;
  if (rows.length === 0) return null;
  return mapShopItem(rows[0] as Record<string, unknown>);
}

export async function createShopItem(
  shopId: string,
  input: ShopItemInput
): Promise<ShopItem> {
  const db = sql();
  const name = input.item_name.trim();
  const existing = await getShopItemByName(shopId, name);
  if (existing) {
    throw new Error(`Product "${name}" already exists.`);
  }

  const rows = await db`
    insert into shop_items (shop_id, item_name, buy_price, sell_price, low_stock_at)
    values (
      ${shopId},
      ${name},
      ${input.buy_price},
      ${input.sell_price},
      ${input.low_stock_at ?? 5}
    )
    returning *
  `;
  await clearHiddenCatalogItem(shopId, name);
  return mapShopItem(rows[0] as Record<string, unknown>);
}

export async function updateShopItem(
  shopId: string,
  oldName: string,
  input: ShopItemInput
): Promise<ShopItem> {
  const db = sql();
  const existing = await getShopItemByName(shopId, oldName);
  if (!existing) {
    throw new Error(`Product "${oldName}" not found.`);
  }

  const newName = input.item_name.trim();
  if (newName !== oldName) {
    const clash = await getShopItemByName(shopId, newName);
    if (clash) {
      throw new Error(`Product "${newName}" already exists.`);
    }
    await db`
      update transactions
      set item_name = ${newName}
      where shop_id = ${shopId} and item_name = ${oldName}
    `;
  }

  const rows = await db`
    update shop_items
    set
      item_name = ${newName},
      buy_price = ${input.buy_price},
      sell_price = ${input.sell_price},
      low_stock_at = ${input.low_stock_at ?? 5},
      updated_at = now()
    where id = ${existing.id}
    returning *
  `;
  return mapShopItem(rows[0] as Record<string, unknown>);
}

export async function deleteShopItem(shopId: string, itemName: string): Promise<void> {
  const db = sql();
  await db`
    delete from shop_items
    where shop_id = ${shopId} and lower(item_name) = lower(${itemName.trim()})
  `;
  await hideCatalogItem(shopId, itemName);
}

function catalogItemKey(itemName: string): string {
  return itemName.trim().toLowerCase();
}

export async function getHiddenCatalogKeys(shopId: string): Promise<Set<string>> {
  const db = sql();
  const rows = await db`
    select item_name_key from catalog_hidden_items where shop_id = ${shopId}
  `;
  return new Set((rows as { item_name_key: string }[]).map((r) => r.item_name_key));
}

export async function hideCatalogItem(shopId: string, itemName: string): Promise<void> {
  const db = sql();
  await db`
    insert into catalog_hidden_items (shop_id, item_name_key)
    values (${shopId}, ${catalogItemKey(itemName)})
    on conflict (shop_id, item_name_key) do nothing
  `;
}

export async function clearHiddenCatalogItem(shopId: string, itemName: string): Promise<void> {
  const db = sql();
  await db`
    delete from catalog_hidden_items
    where shop_id = ${shopId} and item_name_key = ${catalogItemKey(itemName)}
  `;
}

export async function upsertShopItemFromTransaction(
  shopId: string,
  itemName: string,
  txnType: string,
  unitPrice: number | null
): Promise<void> {
  const db = sql();
  const name = itemName.trim();
  const existing = await getShopItemByName(shopId, name);

  if (existing) {
    if (txnType === 'purchase' && unitPrice != null && existing.buy_price == null) {
      await db`
        update shop_items set buy_price = ${unitPrice}, updated_at = now()
        where id = ${existing.id}
      `;
    }
    if (txnType === 'sale' && unitPrice != null && existing.sell_price == null) {
      await db`
        update shop_items set sell_price = ${unitPrice}, updated_at = now()
        where id = ${existing.id}
      `;
    }
    return;
  }

  await db`
    insert into shop_items (shop_id, item_name, buy_price, sell_price, low_stock_at)
    values (
      ${shopId},
      ${name},
      ${txnType === 'purchase' ? unitPrice : null},
      ${txnType === 'sale' ? unitPrice : null},
      5
    )
  `;
}

export async function backfillShopItemsFromTransactions(shopId: string): Promise<number> {
  const transactions = await getAllTransactions(shopId);
  const existing = await getShopItems(shopId);
  const existingNames = new Set(existing.map((e) => e.item_name));
  const names = collectKnownItemNames(transactions);
  const clusters = itemNameClusters(names);
  const canonicalNames = [...new Set(clusters.values())];

  let created = 0;
  for (const name of canonicalNames) {
    if (existingNames.has(name)) continue;

    let buyPrice: number | null = null;
    let sellPrice: number | null = null;
    for (const t of transactions) {
      if (!t.item_name) continue;
      const canonical = clusters.get(t.item_name.trim()) ?? t.item_name.trim();
      if (canonical !== name) continue;
      if (t.type === 'purchase' && t.unit_price != null) buyPrice = Number(t.unit_price);
      if (t.type === 'sale' && t.unit_price != null) sellPrice = Number(t.unit_price);
    }

    await createShopItem(shopId, {
      item_name: name,
      buy_price: buyPrice,
      sell_price: sellPrice,
      low_stock_at: 5,
    });
    created += 1;
  }
  return created;
}

export async function countItemTransactions(shopId: string, itemName: string): Promise<number> {
  const db = sql();
  const rows = await db`
    select count(*)::int as cnt from transactions
    where shop_id = ${shopId} and item_name = ${itemName.trim()}
  `;
  return Number((rows[0] as { cnt: number }).cnt);
}
