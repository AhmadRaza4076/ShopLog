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
await sql`alter table transactions add column if not exists sale_id uuid`;
await sql`alter table transactions add column if not exists sale_notes text`;
await sql`create index if not exists idx_transactions_sale on transactions(shop_id, sale_id)`;
console.log('sale_id migration OK');
