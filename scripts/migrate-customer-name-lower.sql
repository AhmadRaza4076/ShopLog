alter table customers drop constraint if exists customers_shop_id_name_key;

create unique index if not exists idx_customers_shop_name_lower
  on customers (shop_id, lower(name));
