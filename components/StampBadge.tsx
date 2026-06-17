type StampVariant = 'due' | 'paid' | 'score' | 'neutral';

export function StampBadge({ variant, children }: { variant: StampVariant; children: React.ReactNode }) {
  return <span className={`stamp stamp-${variant}`}>{children}</span>;
}
