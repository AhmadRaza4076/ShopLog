import { draftReminder, type VoiceAgentAction } from './claude';
import {
  DEMO_SHOP_ID,
  getAllCustomers,
  getAllTransactions,
  getCustomerBalance,
  getOrCreateCustomer,
  getShopItems,
  recordPayment,
  saveParsedTransaction,
} from './db';
import { computeInventory, computeProfitSummary, daysSinceLastPayment, formatQty, formatRupees } from './computed';
import { computeCreditScore } from './scoring';
import {
  buildAddStockParsed,
  buildSetStockParsed,
  findCustomers,
  findInventoryItems,
} from './voice-lookup';
import type { VoiceActionPayload } from './voice-preview';

export interface VoiceExecuteResult {
  speech: string;
  navigate?: 'dashboard' | 'sales' | 'inventory' | 'khaataa' | 'entry' | 'history';
  navigateQuery?: Record<string, string>;
  data?: unknown;
}

export async function executeVoiceAction(payload: VoiceActionPayload): Promise<VoiceExecuteResult> {
  const { transcript, ...action } = payload;

  switch (action.tool) {
    case 'navigate_to': {
      const navigateQuery: Record<string, string> = {};
      if (action.query) {
        if (action.page === 'inventory' || action.page === 'khaataa') {
          navigateQuery.q = action.query;
          if (action.page === 'khaataa') navigateQuery.customer = action.query;
        }
      }
      return {
        speech: `Opening ${action.page}.`,
        navigate: action.page,
        navigateQuery: Object.keys(navigateQuery).length ? navigateQuery : undefined,
      };
    }

    case 'lookup_inventory': {
      const [transactions, catalog] = await Promise.all([
        getAllTransactions(DEMO_SHOP_ID),
        getShopItems(DEMO_SHOP_ID),
      ]);
      const { best, matches } = findInventoryItems(transactions, action.query, catalog);
      if (!best) {
        if (matches.length > 1) {
          return {
            speech: `I found ${matches.length} items: ${matches.map((m) => m.item_name).join(', ')}.`,
            navigate: 'inventory',
            navigateQuery: { q: action.query },
          };
        }
        return { speech: `I couldn't find "${action.query}" in inventory.` };
      }
      const statusPart = best.status === 'Low stock' ? ' Low stock.' : '';
      return {
        speech: `${best.item_name}: ${formatQty(best.quantity_on_hand)} on hand.${statusPart}`,
        navigate: 'inventory',
        navigateQuery: { q: best.item_name },
      };
    }

    case 'list_inventory': {
      const [transactions, catalog] = await Promise.all([
        getAllTransactions(DEMO_SHOP_ID),
        getShopItems(DEMO_SHOP_ID),
      ]);
      const items = computeInventory(transactions, catalog);
      if (items.length === 0) {
        return { speech: 'No items tracked in inventory yet.', navigate: 'inventory' };
      }
      const low = items.filter((i) => i.status === 'Low stock' || i.status === 'Oversold');
      if (items.length <= 8) {
        const summary = items.map((i) => `${i.item_name}, ${formatQty(i.quantity_on_hand)}`).join('. ');
        const lowPart = low.length ? ` ${low.length} items are low or oversold.` : '';
        return { speech: summary + lowPart, navigate: 'inventory' };
      }
      const lowPart = low.length ? ` ${low.length} are low or oversold.` : '';
      return {
        speech: `${items.length} items in stock.${lowPart} Opening inventory.`,
        navigate: 'inventory',
      };
    }

    case 'lookup_customer': {
      const [transactions, customers] = await Promise.all([
        getAllTransactions(DEMO_SHOP_ID),
        getAllCustomers(DEMO_SHOP_ID),
      ]);
      const { best, matches } = findCustomers(customers, transactions, action.query);
      if (!best) {
        if (matches.length > 1) {
          return {
            speech: `I found ${matches.length} customers: ${matches.map((m) => m.name).join(', ')}.`,
            navigate: 'khaataa',
            navigateQuery: { q: action.query },
          };
        }
        return { speech: `I couldn't find anyone named "${action.query}".` };
      }
      const owed =
        best.balance > 0
          ? `${best.name} owes ${formatRupees(best.balance)}.`
          : `${best.name} has no outstanding balance.`;
      const phonePart = best.phone ? ` Phone: ${best.phone}.` : '';
      return {
        speech: owed + phonePart,
        navigate: 'khaataa',
        navigateQuery: { customer: best.name },
      };
    }

    case 'add_stock': {
      const [transactions, catalog] = await Promise.all([
        getAllTransactions(DEMO_SHOP_ID),
        getShopItems(DEMO_SHOP_ID),
      ]);
      const parsed = buildAddStockParsed(
        transactions,
        action.item_name,
        action.quantity,
        action.unit_price,
        catalog
      );
      await saveParsedTransaction(DEMO_SHOP_ID, parsed, 'voice', transcript);
      const projected = computeInventory(await getAllTransactions(DEMO_SHOP_ID), catalog).find(
        (r) => r.item_name === parsed.item_name
      );
      return {
        speech: `Added ${action.quantity} ${parsed.item_name}. Now ${formatQty(projected?.quantity_on_hand ?? action.quantity)} on hand.`,
        navigate: 'inventory',
        navigateQuery: { q: parsed.item_name! },
      };
    }

    case 'set_stock': {
      const [transactions, catalog] = await Promise.all([
        getAllTransactions(DEMO_SHOP_ID),
        getShopItems(DEMO_SHOP_ID),
      ]);
      const parsed = buildSetStockParsed(
        transactions,
        action.item_name,
        action.target_quantity,
        action.unit_price,
        catalog
      );
      if (parsed.quantity === 0) {
        return {
          speech: `${parsed.item_name} is already at ${action.target_quantity} on hand.`,
          navigate: 'inventory',
          navigateQuery: { q: parsed.item_name! },
        };
      }
      await saveParsedTransaction(DEMO_SHOP_ID, parsed, 'voice', transcript);
      return {
        speech: `Updated ${parsed.item_name} to ${action.target_quantity} on hand.`,
        navigate: 'inventory',
        navigateQuery: { q: parsed.item_name! },
      };
    }

    case 'add_customer': {
      const customer = await getOrCreateCustomer(DEMO_SHOP_ID, action.name, action.phone ?? null);
      const phonePart = customer.phone ? ` Phone saved: ${customer.phone}.` : '';
      return {
        speech: `Registered ${customer.name}.${phonePart}`,
        navigate: 'khaataa',
        navigateQuery: { customer: customer.name },
        data: customer,
      };
    }

    case 'add_transaction': {
      const transaction = await saveParsedTransaction(
        DEMO_SHOP_ID,
        action.parsed,
        'voice',
        transcript
      );
      const who = transaction.customer_name ? ` for ${transaction.customer_name}` : '';
      return {
        speech: `Recorded${who}: ${transaction.total_amount} rupees.`,
        navigate: 'dashboard',
        data: transaction,
      };
    }

    case 'mark_payment': {
      const balance = await getCustomerBalance(DEMO_SHOP_ID, action.customer_name);
      if (!balance) {
        return {
          speech: `I don't have a customer named ${action.customer_name} in the ledger.`,
        };
      }
      if (balance.balance <= 0) {
        return {
          speech: `${balance.name} has no outstanding balance.`,
        };
      }
      const transaction = await recordPayment(DEMO_SHOP_ID, action.customer_name, action.amount);
      let speech = `Recorded a payment of ${action.amount} rupees from ${balance.name}.`;
      if (action.amount > balance.balance) {
        speech += ` Note: this exceeds their balance of ${formatRupees(balance.balance)}.`;
      }
      return {
        speech,
        navigate: 'khaataa',
        navigateQuery: { customer: balance.name },
        data: transaction,
      };
    }

    case 'get_balance': {
      const balance = await getCustomerBalance(DEMO_SHOP_ID, action.customer_name);
      if (!balance) {
        return { speech: `I couldn't find a customer named ${action.customer_name}.` };
      }
      if (balance.balance <= 0) {
        return {
          speech: `${balance.name} owes nothing right now.`,
          navigate: 'khaataa',
          navigateQuery: { customer: balance.name },
          data: balance,
        };
      }
      return {
        speech: `${balance.name} owes ${balance.balance} rupees.`,
        navigate: 'khaataa',
        navigateQuery: { customer: balance.name },
        data: balance,
      };
    }

    case 'get_today_profit': {
      const [transactions, catalog] = await Promise.all([
        getAllTransactions(DEMO_SHOP_ID),
        getShopItems(DEMO_SHOP_ID),
      ]);
      const profit = computeProfitSummary(transactions, catalog);
      let speech = `Today's estimated profit is ${formatRupees(profit.todayGrossProfit)}.`;
      if (profit.todaySalesMissingCost > 0) {
        speech += ` ${profit.todaySalesMissingCost} sale${profit.todaySalesMissingCost === 1 ? '' : 's'} could not be included because buy price is missing.`;
      }
      return {
        speech,
        navigate: 'dashboard',
        data: profit,
      };
    }

    case 'get_credit_score': {
      const balance = await getCustomerBalance(DEMO_SHOP_ID, action.customer_name);
      if (!balance) {
        return { speech: `I couldn't find a customer named ${action.customer_name}.` };
      }
      const transactions = await getAllTransactions(DEMO_SHOP_ID);
      const creditScore = computeCreditScore(balance.customer_id, transactions);
      const topFactor = creditScore.factors[0];
      const factorPart = topFactor ? ` ${topFactor.label}: ${topFactor.detail}` : '';
      return {
        speech: `${balance.name}'s credit score is ${creditScore.score} out of 100 — ${creditScore.tier}.${factorPart}`,
        navigate: 'khaataa',
        navigateQuery: { customer: balance.name },
        data: { ...balance, creditScore },
      };
    }

    case 'send_reminder': {
      const balance = await getCustomerBalance(DEMO_SHOP_ID, action.customer_name);
      if (!balance || balance.balance <= 0) {
        return {
          speech: `${action.customer_name} has no outstanding balance to remind them about.`,
        };
      }
      const allTransactions = await getAllTransactions(DEMO_SHOP_ID);
      const daysSince = daysSinceLastPayment(balance.customer_id, allTransactions);
      const message = await draftReminder(balance.name, balance.balance, daysSince);
      const preview = message.length > 80 ? `${message.slice(0, 80)}…` : message;
      const phoneHint = balance.phone ? ' Tap Send on WhatsApp on the Khaataa screen.' : '';
      return {
        speech: `Reminder for ${balance.name}: ${preview}${phoneHint}`,
        navigate: 'khaataa',
        navigateQuery: { customer: balance.name },
        data: { message, customer_name: balance.name, amount_owed: balance.balance },
      };
    }

    case 'unclear':
      return { speech: action.reason };

    default:
      return { speech: "Sorry, I didn't catch that." };
  }
}

const READ_ONLY_TOOLS = new Set<VoiceAgentAction['tool']>([
  'navigate_to',
  'lookup_inventory',
  'list_inventory',
  'lookup_customer',
  'get_balance',
  'get_today_profit',
  'get_credit_score',
  'unclear',
]);

export async function executeReadOnlyVoiceAction(
  action: VoiceAgentAction
): Promise<VoiceExecuteResult | null> {
  if (!READ_ONLY_TOOLS.has(action.tool)) return null;
  return executeVoiceAction({ ...action, transcript: '' });
}
