import type { CreditScore } from '@/lib/scoring';

const IMPACT_COLOR: Record<CreditScore['factors'][number]['impact'], string> = {
  positive: 'var(--leaf)',
  neutral: 'var(--brass)',
  negative: 'var(--stamp-red)',
};

const TIER_CLASS: Record<CreditScore['tier'], string> = {
  Good: 'stamp-tier-good',
  Fair: 'stamp-tier-fair',
  'At risk': 'stamp-tier-risk',
};

interface CreditScoreCardProps {
  customerName: string;
  score: CreditScore;
}

export function CreditScoreCard({ customerName, score }: CreditScoreCardProps) {
  return (
    <div className="credit-score-card">
      <p className="page-eyebrow" style={{ marginBottom: 12 }}>
        Credit readiness — {customerName}
      </p>
      <div className="score-ring-wrap">
        <div>
          <span className="stat-value" style={{ fontSize: 36 }}>
            {score.score}
          </span>
          <span className="credit-score-denom">/ 100</span>
          <div style={{ marginTop: 8 }}>
            <span className={`stamp ${TIER_CLASS[score.tier]}`}>{score.tier}</span>
          </div>
        </div>
        <div className="factor-list" style={{ flex: 1 }}>
          {score.factors.map((factor) => (
            <div key={factor.label} className="factor-row">
              <span
                className="factor-dot"
                style={{ background: IMPACT_COLOR[factor.impact] }}
                aria-hidden
              />
              <div className="factor-text">
                <strong>{factor.label}</strong>
                <span>{factor.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
