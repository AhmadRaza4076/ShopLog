import type { VoiceAgentAction } from './claude';
import type { ShopItem, Transaction } from './types';
import {
  computeCustomerBalances,
  computeInventory,
  computeProfitSummary,
  formatRupees,
  projectStockLevel,
  stockWarningForParsed,
} from './computed';
import {
  buildAddStockParsed,
  buildSetStockParsed,
  findCustomers,
  findInventoryItems,
} from './voice-lookup';

export type VoiceActionPayload = VoiceAgentAction & { transcript: string };

export interface VoicePreviewResult {
  preview: string;
  requires_confirm: boolean;
  action: VoiceAgentAction;
  stock_warning?: string | null;
}

export function actionRequiresConfirm(action: VoiceAgentAction): boolean {
  return (
    action.tool === 'add_transaction' ||
    action.tool === 'mark_payment' ||
    action.tool === 'send_reminder' ||
    action.tool === 'add_stock' ||
    action.tool === 'set_stock' ||
    action.tool === 'add_customer'
  );
}

export function buildVoicePreview(
  action: VoiceAgentAction,
  transactions: Transaction[],
  customers: { id: string; name: string; phone: string | null }[] = [],
  catalog: ShopItem[] = []
): VoicePreviewResult {
  const requires_confirm = actionRequiresConfirm(action);
  let preview = '';
  let stock_warning: string | null = null;
  let needsConfirm = requires_confirm;

  switch (action.tool) {
    case 'navigate_to': {
      preview = `Open the ${action.page} screen.`;
      if (action.query) preview += ` · search "${action.query}"`;
      break;
    }
    case 'lookup_inventory': {
      const { best, matches } = findInventoryItems(transactions, action.query, catalog);
      if (best) {
        preview = `${best.item_name}: ${best.quantity_on_hand} on hand`;
        if (best.status === 'Low stock') preview += ' · low stock';
        preview += '.';
      } else if (matches.length > 1) {
        preview = `Multiple matches: ${matches.map((m) => m.item_name).join(', ')}.`;
      } else {
        preview = `Look up "${action.query}" in inventory.`;
      }
      break;
    }
    case 'list_inventory': {
      const items = computeInventory(transactions, catalog);
      const low = items.filter((i) => i.status === 'Low stock' || i.status === 'Oversold');
      preview =
        items.length === 0
          ? 'No items in inventory yet.'
          : items.length <= 8
            ? items.map((i) => `${i.item_name}: ${i.quantity_on_hand}`).join(' · ')
            : `${items.length} items in stock.`;
      if (low.length > 0 && items.length > 0) {
        preview += ` · ${low.length} low or oversold`;
      }
      break;
    }
    case 'lookup_customer': {
      const { best, matches } = findCustomers(customers, transactions, action.query);
      if (best) {
        preview = `${best.name}: ${formatRupees(Math.max(0, best.balance))} owed`;
        if (best.phone) preview += ` · ${best.phone}`;
      } else if (matches.length > 1) {
        preview = `Multiple customers: ${matches.map((m) => m.name).join(', ')}.`;
      } else {
        preview = `Find "${action.query}" in khaataa.`;
      }
      break;
    }
    case 'add_stock': {
      const parsed = buildAddStockParsed(
        transactions,
        action.item_name,
        action.quantity,
        action.unit_price,
        catalog
      );
      preview = `Add ${action.quantity}× ${parsed.item_name} to inventory`;
      const projected = projectStockLevel(transactions, parsed.item_name!, {
        type: 'purchase',
        quantity: action.quantity,
      });
      preview += ` · after: ${projected} on hand`;
      break;
    }
    case 'set_stock': {
      const parsed = buildSetStockParsed(
        transactions,
        action.item_name,
        action.target_quantity,
        action.unit_price,
        catalog
      );
      if (parsed.quantity === 0) {
        preview = `${parsed.item_name} is already at ${action.target_quantity} on hand.`;
        needsConfirm = false;
      } else if (parsed.type === 'purchase') {
        preview = `Set ${parsed.item_name} to ${action.target_quantity} · add ${parsed.quantity} (purchase)`;
      } else {
        preview = `Set ${parsed.item_name} to ${action.target_quantity} · reduce by ${parsed.quantity}`;
        stock_warning = stockWarningForParsed(transactions, parsed);
      }
      break;
    }
    case 'add_customer':
      preview = `Register customer ${action.name}`;
      if (action.phone) preview += ` · ${action.phone}`;
      break;
    case 'add_transaction': {
      const p = action.parsed;
      const typeLabel =
        p.type === 'sale' ? 'Sale' : p.type === 'purchase' ? 'Purchase' : p.type === 'payment' ? 'Payment' : 'Credit given';
      preview = `Record ${typeLabel.toLowerCase()}: ${formatRupees(p.total_amount)}`;
      if (p.item_name && p.quantity != null) preview += ` · ${p.quantity}× ${p.item_name}`;
      if (p.customer_name) preview += ` · ${p.customer_name}`;
      if (p.is_credit && p.type !== 'payment') preview += ' · on credit (adds to khaataa)';
      stock_warning = stockWarningForParsed(transactions, p);
      if (p.type === 'sale' && p.item_name && p.quantity != null) {
        const projected = projectStockLevel(transactions, p.item_name, {
          type: 'sale',
          quantity: Number(p.quantity),
        });
        preview += ` · inventory after: ${projected} on hand`;
      }
      if (p.type === 'purchase' && p.item_name && p.quantity != null) {
        const projected = projectStockLevel(transactions, p.item_name, {
          type: 'purchase',
          quantity: Number(p.quantity),
        });
        preview += ` · inventory after: ${projected} on hand`;
      }
      if (p.is_credit && p.customer_name) {
        const balances = computeCustomerBalances(transactions);
        const match = Object.values(balances).find(
          (c) => c.name.toLowerCase() === p.customer_name!.toLowerCase()
        );
        const current = match?.balance ?? 0;
        preview += ` · ${p.customer_name}'s khaataa after: ${formatRupees(current + p.total_amount)}`;
      }
      break;
    }
    case 'mark_payment': {
      preview = `Record payment of ${formatRupees(action.amount)} from ${action.customer_name}`;
      const balances = computeCustomerBalances(transactions);
      const match = Object.values(balances).find(
        (c) => c.name.toLowerCase() === action.customer_name.toLowerCase()
      );
      if (match) {
        preview += ` · khaataa after: ${formatRupees(Math.max(0, match.balance - action.amount))}`;
      }
      break;
    }
    case 'get_balance': {
      const balances = computeCustomerBalances(transactions);
      const match = Object.values(balances).find(
        (c) => c.name.toLowerCase().includes(action.customer_name.toLowerCase())
      );
      preview = match
        ? `${match.name} owes ${formatRupees(Math.max(0, match.balance))}.`
        : `Look up balance for ${action.customer_name}.`;
      break;
    }
    case 'get_today_profit': {
      const profit = computeProfitSummary(transactions, catalog);
      preview = `Today's estimated profit: ${formatRupees(profit.todayGrossProfit)}.`;
      if (profit.todaySalesMissingCost > 0) {
        preview += ` (${profit.todaySalesMissingCost} sale${profit.todaySalesMissingCost === 1 ? '' : 's'} missing buy price)`;
      }
      break;
    }
    case 'get_credit_score': {
      preview = `Look up credit readiness score for ${action.customer_name}.`;
      break;
    }
    case 'send_reminder':
      preview = `Draft a payment reminder for ${action.customer_name}.`;
      break;
    case 'unclear':
      preview = action.reason;
      break;
    default:
      preview = "Couldn't understand that command.";
  }

  return { preview, requires_confirm: needsConfirm, action, stock_warning };
}

export function serializeAction(action: VoiceAgentAction, transcript: string): VoiceActionPayload {
  return { ...action, transcript };
}

export function isVoiceActionPayload(value: unknown): value is VoiceActionPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.tool === 'string' && typeof v.transcript === 'string';
}
