import { StampBadge } from '@/components/StampBadge';
import type { CreditScore } from '@/lib/scoring';

const IMPACT_COLOR: Record<CreditScore['factors'][number]['impact'], string> = {
  positive: 'var(--leaf)',
  neutral: 'var(--ink-soft)',
  negative: 'var(--stamp-red)',
};

interface CreditScoreCardProps {
  customerName: string;
  score: CreditScore;
}

export function CreditScoreCard({ customerName, score }: CreditScoreCardProps) {
  return (
    <div className="inv-banner" style={{ marginBottom: 16, border: '1px solid var(--rule-line)' }}>
      <p className="page-eyebrow" style={{ marginBottom: 12 }}>
        Credit readiness — {customerName}
      </p>
      <div className="score-ring-wrap">
        <div>
          <span className="stat-value" style={{ fontSize: 36 }}>
            {score.score}
          </span>
          <span style={{ fontSize: 14, color: 'var(--ink-soft)', marginLeft: 6 }}>/ 100</span>
          <div style={{ marginTop: 8 }}>
            <StampBadge variant="score">{score.tier}</StampBadge>
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
