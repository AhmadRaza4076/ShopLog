-- Run once in Neon SQL editor if shop_items does not exist yet.
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

create index if not exists idx_shop_items_shop on shop_items(shop_id);
