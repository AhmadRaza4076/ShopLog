-- One-time migration: hide deleted catalog items from Inventory while keeping ledger history.
create table if not exists catalog_hidden_items (
  shop_id       uuid not null references shops(id) on delete cascade,
  item_name_key text not null,
  hidden_at     timestamptz not null default now(),
  primary key (shop_id, item_name_key)
);
