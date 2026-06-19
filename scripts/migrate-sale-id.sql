alter table transactions add column if not exists sale_id uuid;
alter table transactions add column if not exists sale_notes text;
create index if not exists idx_transactions_sale on transactions(shop_id, sale_id);
