import Anthropic from '@anthropic-ai/sdk';

/** Trim env vars — spaces after = in .env.local break everything silently. */
export function aiApiKey(): string {
  return (process.env.ANTHROPIC_API_KEY ?? process.env.AI_API_KEY ?? '').trim();
}

/** Hackathon keys usually need a custom gateway URL, not api.anthropic.com directly. */
export function aiBaseUrl(): string | undefined {
  const url = (process.env.ANTHROPIC_BASE_URL ?? process.env.AI_BASE_URL ?? '').trim();
  return url || undefined;
}

export function createAiClient(): Anthropic {
  const apiKey = aiApiKey();
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add your hackathon API key to .env.local (no spaces around =).'
    );
  }

  return new Anthropic({
    apiKey,
    baseURL: aiBaseUrl(),
  });
}
