import { getAllCustomers, getAllTransactions, getShop, getShopItems } from './db';
import { computeInventoryMerged, getItemAliases } from './item-names';

export { getItemAliases };

/** Business-specific hints injected into Claude system prompts (not model training). */
export async function buildShopContextBlock(shopId: string): Promise<string> {
  const shop = await getShop(shopId);
  const [customers, transactions, catalog] = await Promise.all([
    getAllCustomers(shopId),
    getAllTransactions(shopId),
    getShopItems(shopId),
  ]);
  const inventory = computeInventoryMerged(transactions, catalog);

  const customerNames = customers.map((c) => c.name).slice(0, 40);
  const itemNames = inventory.map((i) => i.item_name).slice(0, 40);
  const aliasLines = Object.entries(getItemAliases()).map(([k, v]) => `"${k}" → "${v}"`);

  const parts: string[] = ['Shop context for this ledger:'];
  if (shop) parts.push(`Store name: ${shop.name}. Owner: ${shop.owner_name}.`);
  if (customerNames.length > 0) {
    parts.push(`Known customers (use exact spelling when matched): ${customerNames.join(', ')}.`);
  }
  if (itemNames.length > 0) {
    parts.push(`Known inventory items: ${itemNames.join(', ')}.`);
  }
  if (aliasLines.length > 0) {
    parts.push(`Item aliases: ${aliasLines.join('; ')}.`);
  }

  return parts.join('\n') + '\n\n';
}
