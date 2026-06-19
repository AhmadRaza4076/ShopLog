-- Run once on Neon after deploying case-insensitive shop item matching.
-- Merges duplicate shop_items rows that differ only by casing, then adds a case-insensitive unique index.

-- Pick one canonical casing per lower(item_name) group (prefer the name used most in transactions).
with canonical as (
  select distinct on (shop_id, lower(item_name))
    shop_id,
    item_name as canonical_name,
    lower(item_name) as name_key
  from shop_items
  order by shop_id, lower(item_name), updated_at desc
),
dupes as (
  select si.id, si.shop_id, si.item_name, c.canonical_name
  from shop_items si
  join canonical c
    on c.shop_id = si.shop_id and c.name_key = lower(si.item_name)
  where si.item_name is distinct from c.canonical_name
)
update transactions t
set item_name = d.canonical_name
from dupes d
where t.shop_id = d.shop_id and t.item_name = d.item_name;

delete from shop_items si
using shop_items si2
where si.shop_id = si2.shop_id
  and lower(si.item_name) = lower(si2.item_name)
  and si.id > si2.id;

drop index if exists idx_shop_items_shop_name_lower;
create unique index if not exists idx_shop_items_shop_name_lower
  on shop_items (shop_id, lower(item_name));
