import type { CreditScoreResult } from '@/lib/types';

const BAND_COLOR: Record<CreditScoreResult['band'], string> = {
  Strong: 'var(--leaf)',
  Fair: 'var(--brass)',
  Risky: 'var(--stamp-red)',
  'Insufficient history': 'var(--ink-soft)',
};

function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width="100" height="100" viewBox="0 0 100 100" style={{ flexShrink: 0 }}>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--rule-line)" strokeWidth="8" />
      <circle
        cx="50"
        cy="50"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
      />
      <text
        x="50"
        y="55"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="24"
        fontWeight="600"
        fill="var(--ink)"
      >
        {score}
      </text>
    </svg>
  );
}

export function CreditScoreCard({ result }: { result: CreditScoreResult }) {
  const color = BAND_COLOR[result.band];

  return (
    <div>
      <div className="score-ring-wrap">
        <ScoreRing score={result.score} color={color} />
        <div>
          <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink-soft)' }}>Credit-readiness</p>
          <p style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color }}>
            {result.band}
          </p>
        </div>
      </div>

      <p className="page-eyebrow">Why this score</p>
      <div className="factor-list">
        {result.factors.map((f, i) => (
          <div className="factor-row" key={i}>
            <span
              className="factor-dot"
              style={{
                background:
                  f.weight === 'positive' ? 'var(--leaf)' : f.weight === 'negative' ? 'var(--stamp-red)' : 'var(--brass)',
              }}
            />
            <div className="factor-text">
              <strong>{f.label}</strong>
              <span>{f.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
