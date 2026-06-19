import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { neon } from '@neondatabase/serverless';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
const env = fs.readFileSync(envPath, 'utf8');
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
if (!url) {
  console.error('DATABASE_URL not found in .env.local');
  process.exit(1);
}

const sql = neon(url);

await sql`
  create table if not exists shop_items (
    id            uuid primary key default gen_random_uuid(),
    shop_id       uuid not null references shops(id) on delete cascade,
    item_name     text not null,
    buy_price     numeric,
    sell_price    numeric,
    low_stock_at  numeric not null default 5,
    updated_at    timestamptz not null default now(),
    unique (shop_id, item_name)
  )
`;
await sql`create index if not exists idx_shop_items_shop on shop_items(shop_id)`;
console.log('shop_items migration OK');
