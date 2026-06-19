/**
 * Verifies balance-rule unification, is_credit normalization, and customer matching.
 * Run: npx tsx scripts/verify-bugfixes.ts
 */
import { appendFileSync } from 'fs';
import { join } from 'path';
import {
  computeCustomerBalances,
  customerBalanceDelta,
  normalizeIsCredit,
  normalizeParsedTransaction,
} from '../lib/computed';
import { customerNameMatchScore } from '../lib/customer-match';
import { findCustomers } from '../lib/voice-lookup';
import type { Transaction } from '../lib/types';

const LOG = join(process.cwd(), 'debug-4ca096.log');

function log(hypothesisId: string, message: string, data: Record<string, unknown>) {
  const line = JSON.stringify({
    sessionId: '4ca096',
    hypothesisId,
    location: 'scripts/verify-bugfixes.ts',
    message,
    data,
    timestamp: Date.now(),
    runId: 'verify',
  });
  appendFileSync(LOG, line + '\n');
  console.log(message, data);
}

/** Old SQL balance rule from db.ts before fix */
function legacySqlBalance(transactions: Transaction[], customerId: string): number {
  let balance = 0;
  for (const t of transactions) {
    if (t.customer_id !== customerId) continue;
    if (t.is_credit && t.type !== 'payment') balance += Number(t.total_amount);
    if (t.type === 'payment') balance -= Number(t.total_amount);
  }
  return balance;
}

const customerId = 'cust-1';
const baseTxn = {
  id: 't1',
  shop_id: 'shop',
  item_name: null,
  quantity: null,
  unit_price: null,
  customer_id: customerId,
  customer_name: 'Ali Raza',
  source: 'typed' as const,
  raw_input: null,
  sale_id: null,
  sale_notes: null,
  created_at: new Date().toISOString(),
};

// Hypothesis A: credit_given with is_credit=false diverges between SQL and JS paths
const badCreditGiven: Transaction = {
  ...baseTxn,
  type: 'credit_given',
  total_amount: 500,
  is_credit: false,
};

const jsBalance = computeCustomerBalances([badCreditGiven])[customerId]?.balance ?? 0;
const sqlBalance = legacySqlBalance([badCreditGiven], customerId);
const unifiedDelta = customerBalanceDelta(badCreditGiven);

log('A', 'balance divergence on credit_given + is_credit=false', {
  jsBalance,
  sqlBalance,
  unifiedDelta,
  diverged: jsBalance !== sqlBalance,
});

// Hypothesis B: normalizeIsCredit fixes write boundary
const raw = {
  type: 'credit_given' as const,
  item_name: null,
  quantity: null,
  unit_price: null,
  total_amount: 500,
  customer_name: 'Ali',
  is_credit: false,
  confidence: 'high' as const,
};
const normalized = normalizeParsedTransaction(raw);
log('B', 'is_credit normalized for credit_given', {
  rawIsCredit: raw.is_credit,
  normalizedIsCredit: normalized.is_credit,
  fixed: normalized.is_credit === true,
});

// Hypothesis C: fuzzy match "Ali" prefers Ali Raza over Wali Khan
const customers = [
  { id: '1', name: 'Wali Khan', phone: null },
  { id: '2', name: 'Ali Raza', phone: null },
];
const waliScore = customerNameMatchScore('Wali Khan', 'Ali');
const aliScore = customerNameMatchScore('Ali Raza', 'Ali');
const { best } = findCustomers(customers, [], 'Ali');
log('C', 'customer name match for Ali', {
  waliScore,
  aliScore,
  correctBest: best?.name === 'Ali Raza',
  bestName: best?.name ?? null,
});

// After normalization, unified path agrees for new writes
const normalizedTxn: Transaction = {
  ...badCreditGiven,
  is_credit: normalizeIsCredit('credit_given', false),
};
const postFixSql = legacySqlBalance([normalizedTxn], customerId);
const postFixJs = computeCustomerBalances([normalizedTxn])[customerId]?.balance ?? 0;
log('A', 'post-normalization balance agreement', {
  postFixSql,
  postFixJs,
  agree: postFixSql === postFixJs,
});

const ok =
  jsBalance !== sqlBalance &&
  normalized.is_credit === true &&
  best?.name === 'Ali Raza' &&
  postFixSql === postFixJs;

if (!ok) {
  console.error('Verification failed');
  process.exit(1);
}
console.log('All verifications passed');
