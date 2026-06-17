import { NextRequest, NextResponse } from 'next/server';
import { draftReminder, runVoiceCommand } from '@/lib/claude';
import {
  DEMO_SHOP_ID,
  ensureDemoShop,
  getCustomerBalance,
  getAllTransactions,
  recordPayment,
  saveParsedTransaction,
} from '@/lib/db';
import { computeCreditScore } from '@/lib/scoring';
import { daysSinceLastPayment } from '@/lib/computed';
import { apiErrorResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

interface VoiceResponse {
  speech: string;
  navigate?: 'dashboard' | 'inventory' | 'khaataa' | 'entry' | 'history';
  navigateQuery?: Record<string, string>;
  data?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    await ensureDemoShop();
    const { transcript } = (await req.json()) as { transcript: string };

    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const action = await runVoiceCommand(transcript);
    let result: VoiceResponse;

    switch (action.tool) {
      case 'navigate_to': {
        result = { speech: `Opening ${action.page}.`, navigate: action.page };
        break;
      }

      case 'add_transaction': {
        const transaction = await saveParsedTransaction(DEMO_SHOP_ID, action.parsed, 'voice', transcript);
        const amount = transaction.total_amount;
        const who = transaction.customer_name ? ` for ${transaction.customer_name}` : '';
        result = {
          speech: `Recorded${who}: Rs. ${amount}.`,
          navigate: 'dashboard',
          data: transaction,
        };
        break;
      }

      case 'mark_payment': {
        const transaction = await recordPayment(DEMO_SHOP_ID, action.customer_name, action.amount);
        result = {
          speech: `Recorded a payment of Rs. ${action.amount} from ${action.customer_name}.`,
          navigate: 'khaataa',
          navigateQuery: { customer: action.customer_name },
          data: transaction,
        };
        break;
      }

      case 'get_balance': {
        const balance = await getCustomerBalance(DEMO_SHOP_ID, action.customer_name);
        if (!balance) {
          result = { speech: `I couldn't find a customer named ${action.customer_name}.` };
        } else if (balance.balance <= 0) {
          result = { speech: `${balance.name} owes nothing right now.`, data: balance };
        } else {
          result = { speech: `${balance.name} owes Rs. ${balance.balance}.`, data: balance };
        }
        break;
      }

      case 'get_credit_score': {
        const balance = await getCustomerBalance(DEMO_SHOP_ID, action.customer_name);
        if (!balance) {
          result = { speech: `I couldn't find a customer named ${action.customer_name}.` };
          break;
        }
        const allTransactions = await getAllTransactions(DEMO_SHOP_ID);
        const score = computeCreditScore(balance.customer_id, balance.name, allTransactions);
        result = {
          speech: `${score.customer_name}'s credit score is ${score.score} out of 100 — ${score.band}.`,
          data: score,
        };
        break;
      }

      case 'send_reminder': {
        const balance = await getCustomerBalance(DEMO_SHOP_ID, action.customer_name);
        if (!balance || balance.balance <= 0) {
          result = { speech: `${action.customer_name} has no outstanding balance to remind them about.` };
          break;
        }
        const allTransactions = await getAllTransactions(DEMO_SHOP_ID);
        const daysSince = daysSinceLastPayment(balance.customer_id, allTransactions);
        const message = await draftReminder(balance.name, balance.balance, daysSince);
        const preview = message.length > 80 ? `${message.slice(0, 80)}…` : message;
        result = {
          speech: `Reminder for ${balance.name}: ${preview}`,
          navigate: 'khaataa',
          navigateQuery: { customer: balance.name },
          data: { message, customer_name: balance.name, amount_owed: balance.balance },
        };
        break;
      }

      case 'unclear':
      default: {
        result = { speech: action.tool === 'unclear' ? action.reason : "Sorry, I didn't catch that." };
        break;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return apiErrorResponse(error, 'Voice command failed.');
  }
}
