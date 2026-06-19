-- Khaataa AI schema
-- Run this once against your Neon Postgres database before first use.
-- Everything in the app (inventory, khaataa balances, credit score) is a
-- computed view over the single `transactions` table — there is no
-- separate "inventory" or "balance" table to keep in sync by hand.

create extension if not exists "pgcrypto";

create table if not exists shops (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  owner_name  text not null,
  created_at  timestamptz not null default now()
);

create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  phone       text,
  notes       text,
  created_at  timestamptz not null default now()
);

create unique index if not exists idx_customers_shop_name_lower
  on customers (shop_id, lower(name));

create table if not exists transactions (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  type          text not null check (type in ('sale', 'purchase', 'payment', 'credit_given')),
  item_name     text,
  quantity      numeric,
  unit_price    numeric,
  total_amount  numeric not null,
  customer_id   uuid references customers(id) on delete set null,
  is_credit     boolean not null default false,
  source        text not null check (source in ('typed', 'voice', 'photo', 'system')),
  raw_input     text,
  sale_id       uuid,
  sale_notes    text,
  created_at    timestamptz not null default now()
);

create table if not exists shop_items (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  item_name     text not null,
  buy_price     numeric,
  sell_price    numeric,
  low_stock_at  numeric not null default 5,
  updated_at    timestamptz not null default now(),
  unique (shop_id, item_name)
);

create index if not exists idx_transactions_shop on transactions(shop_id, created_at desc);
create index if not exists idx_transactions_sale on transactions(shop_id, sale_id);
create index if not exists idx_transactions_customer on transactions(customer_id);
create index if not exists idx_customers_shop on customers(shop_id);
create index if not exists idx_shop_items_shop on shop_items(shop_id);
