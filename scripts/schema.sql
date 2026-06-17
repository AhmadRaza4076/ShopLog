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
  created_at  timestamptz not null default now(),
  unique (shop_id, name)
);

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
  created_at    timestamptz not null default now()
);

create index if not exists idx_transactions_shop on transactions(shop_id, created_at desc);
create index if not exists idx_transactions_customer on transactions(customer_id);
create index if not exists idx_customers_shop on customers(shop_id);
