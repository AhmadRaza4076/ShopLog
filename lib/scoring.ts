import type { CreditScoreResult, Transaction } from './types';

/**
 * Computes a 0–100 credit-readiness score from a customer's transaction
 * history. This is intentionally a transparent, explainable rule-based
 * score rather than a black-box model — a shopkeeper (or a loan officer)
 * should be able to see exactly why a customer scored the way they did.
 */
export function computeCreditScore(
  customerId: string,
  customerName: string,
  transactions: Transaction[]
): CreditScoreResult {
  const relevant = transactions.filter((t) => t.customer_id === customerId);

  if (relevant.length === 0) {
    return {
      customer_id: customerId,
      customer_name: customerName,
      score: 0,
      band: 'Insufficient history',
      factors: [
        {
          label: 'No transaction history',
          detail: 'This customer has no recorded sales, credit, or payments yet.',
          weight: 'neutral',
        },
      ],
    };
  }

  const creditGiven = relevant.filter((t) => t.is_credit && t.type !== 'payment');
  const payments = relevant.filter((t) => t.type === 'payment');

  const totalCreditAmount = creditGiven.reduce((sum, t) => sum + Number(t.total_amount), 0);
  const totalPaidAmount = payments.reduce((sum, t) => sum + Number(t.total_amount), 0);
  const currentlyOwed = Math.max(totalCreditAmount - totalPaidAmount, 0);

  const factors: CreditScoreResult['factors'] = [];
  let score = 50; // start neutral, adjust from real behavior

  // Factor 1: repayment ratio — how much of what they've owed has been paid back
  const repaymentRatio = totalCreditAmount > 0 ? totalPaidAmount / totalCreditAmount : 1;
  if (totalCreditAmount > 0) {
    const points = Math.round(repaymentRatio * 30) - 15; // -15 to +15
    score += points;
    factors.push({
      label: 'Repayment ratio',
      detail: `Has repaid ${Math.round(repaymentRatio * 100)}% of all credit ever extended (Rs. ${totalPaidAmount.toLocaleString()} of Rs. ${totalCreditAmount.toLocaleString()}).`,
      weight: points >= 0 ? 'positive' : 'negative',
    });
  }

  // Factor 2: current overdue ratio — how much is outstanding right now relative to history
  const overdueRatio = totalCreditAmount > 0 ? currentlyOwed / totalCreditAmount : 0;
  if (totalCreditAmount > 0) {
    const points = -Math.round(overdueRatio * 20); // 0 to -20
    score += points;
    factors.push({
      label: 'Current outstanding balance',
      detail:
        currentlyOwed > 0
          ? `Currently owes Rs. ${currentlyOwed.toLocaleString()}, which is ${Math.round(overdueRatio * 100)}% of all credit ever given.`
          : 'Currently owes nothing — fully settled.',
      weight: points < 0 ? 'negative' : 'positive',
    });
  }

  // Factor 3: payment frequency — has this customer paid more than once?
  if (payments.length >= 2) {
    score += 10;
    factors.push({
      label: 'Repeat payments',
      detail: `Has made ${payments.length} separate payments — a pattern, not a one-off.`,
      weight: 'positive',
    });
  } else if (payments.length === 1) {
    factors.push({
      label: 'Limited payment history',
      detail: 'Only one payment on record so far.',
      weight: 'neutral',
    });
  } else if (totalCreditAmount > 0) {
    score -= 10;
    factors.push({
      label: 'No payments yet',
      detail: 'Has received credit but made no payments toward it yet.',
      weight: 'negative',
    });
  }

  // Factor 4: relationship length — number of total transactions as a proxy for tenure
  if (relevant.length >= 10) {
    score += 10;
    factors.push({
      label: 'Long-standing customer',
      detail: `${relevant.length} recorded transactions with this shop.`,
      weight: 'positive',
    });
  } else if (relevant.length < 3) {
    factors.push({
      label: 'New relationship',
      detail: `Only ${relevant.length} recorded transaction(s) — too early to be fully confident.`,
      weight: 'neutral',
    });
  }

  score = Math.max(0, Math.min(100, score));

  let band: CreditScoreResult['band'];
  if (relevant.length < 3) band = 'Insufficient history';
  else if (score >= 70) band = 'Strong';
  else if (score >= 45) band = 'Fair';
  else band = 'Risky';

  return { customer_id: customerId, customer_name: customerName, score, band, factors };
}
