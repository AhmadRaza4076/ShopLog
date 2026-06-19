import { countsTowardCustomerBalance, daysSinceLastPayment } from './computed';
import type { Transaction } from './types';

export interface CreditScoreFactor {
  label: string;
  detail: string;
  impact: 'positive' | 'neutral' | 'negative';
}

export interface CreditScore {
  score: number;
  tier: 'Good' | 'Fair' | 'At risk';
  factors: CreditScoreFactor[];
}

function tierFromScore(score: number): CreditScore['tier'] {
  if (score >= 70) return 'Good';
  if (score >= 40) return 'Fair';
  return 'At risk';
}

export function computeCreditScore(customerId: string, transactions: Transaction[]): CreditScore {
  const customerTxns = transactions.filter((t) => t.customer_id === customerId);

  let totalCredit = 0;
  let totalPayments = 0;
  let paymentCount = 0;
  let currentBalance = 0;

  for (const t of customerTxns) {
    if (t.type === 'payment') {
      totalPayments += Number(t.total_amount);
      paymentCount += 1;
      currentBalance -= Number(t.total_amount);
    } else if (countsTowardCustomerBalance(t)) {
      totalCredit += Number(t.total_amount);
      currentBalance += Number(t.total_amount);
    }
  }

  currentBalance = Math.max(0, currentBalance);
  const daysSince = daysSinceLastPayment(customerId, transactions);

  const factors: CreditScoreFactor[] = [];
  let score = 0;

  // Payment recency (~30 pts)
  if (daysSince == null) {
    score += 5;
    factors.push({
      label: 'Payment recency',
      detail: 'No payment recorded yet on this khaataa.',
      impact: 'negative',
    });
  } else if (daysSince <= 7) {
    score += 30;
    factors.push({
      label: 'Payment recency',
      detail: `Last payment ${daysSince} day${daysSince === 1 ? '' : 's'} ago — very recent.`,
      impact: 'positive',
    });
  } else if (daysSince <= 30) {
    score += 18;
    factors.push({
      label: 'Payment recency',
      detail: `Last payment ${daysSince} days ago — within a month.`,
      impact: 'neutral',
    });
  } else {
    score += 5;
    factors.push({
      label: 'Payment recency',
      detail: `Last payment ${daysSince} days ago — overdue pattern.`,
      impact: 'negative',
    });
  }

  // Pay-down ratio (~25 pts)
  if (totalCredit <= 0) {
    score += 12;
    factors.push({
      label: 'Pay-down history',
      detail: 'No credit sales on record yet.',
      impact: 'neutral',
    });
  } else {
    const ratio = Math.min(1, totalPayments / totalCredit);
    score += Math.round(ratio * 25);
    const pct = Math.round(ratio * 100);
    factors.push({
      label: 'Pay-down history',
      detail: `Paid back ${pct}% of lifetime credit (Rs. ${Math.round(totalPayments)} of Rs. ${Math.round(totalCredit)}).`,
      impact: ratio >= 0.6 ? 'positive' : ratio >= 0.3 ? 'neutral' : 'negative',
    });
  }

  // Current balance vs lifetime credit (~25 pts)
  if (totalCredit <= 0 && currentBalance <= 0) {
    score += 20;
    factors.push({
      label: 'Outstanding balance',
      detail: 'No outstanding udhaar right now.',
      impact: 'positive',
    });
  } else if (totalCredit > 0) {
    const owedRatio = currentBalance / totalCredit;
    const balancePts = Math.round((1 - Math.min(1, owedRatio)) * 25);
    score += balancePts;
    factors.push({
      label: 'Outstanding balance',
      detail:
        currentBalance > 0
          ? `Rs. ${Math.round(currentBalance)} still owed (${Math.round(owedRatio * 100)}% of lifetime credit).`
          : 'Fully cleared — nothing outstanding.',
      impact: owedRatio <= 0.25 ? 'positive' : owedRatio <= 0.6 ? 'neutral' : 'negative',
    });
  } else {
    score += 10;
    factors.push({
      label: 'Outstanding balance',
      detail: `Rs. ${Math.round(currentBalance)} currently owed.`,
      impact: currentBalance > 0 ? 'negative' : 'neutral',
    });
  }

  // Relationship depth (~20 pts)
  if (paymentCount >= 3) {
    score += 20;
    factors.push({
      label: 'Relationship depth',
      detail: `${paymentCount} payments on record — established customer.`,
      impact: 'positive',
    });
  } else if (paymentCount >= 1) {
    score += 12;
    factors.push({
      label: 'Relationship depth',
      detail: `${paymentCount} payment${paymentCount === 1 ? '' : 's'} on record — building history.`,
      impact: 'neutral',
    });
  } else {
    score += 8;
    factors.push({
      label: 'Relationship depth',
      detail: 'New or infrequent payer — limited payment history.',
      impact: 'neutral',
    });
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    score: finalScore,
    tier: tierFromScore(finalScore),
    factors,
  };
}
