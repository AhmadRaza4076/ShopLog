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
await sql`alter table customers drop constraint if exists customers_shop_id_name_key`;
await sql`create unique index if not exists idx_customers_shop_name_lower on customers (shop_id, lower(name))`;
console.log('customer name lower unique index migration OK');
