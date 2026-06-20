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
  create table if not exists catalog_hidden_items (
    shop_id       uuid not null references shops(id) on delete cascade,
    item_name_key text not null,
    hidden_at     timestamptz not null default now(),
    primary key (shop_id, item_name_key)
  )
`;
console.log('catalog_hidden_items migration OK');
