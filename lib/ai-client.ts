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

/** Hackathon LiteLLM gateway — Sonnet for speed/quota, Opus when Sonnet isn't enough. */
export const MODEL_SONNET = 'claude-sonnet-4-6';
export const MODEL_OPUS = 'claude-opus-4-6';

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

type MessageParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>;

export async function createMessage(
  params: MessageParams,
  model: string
): Promise<Anthropic.Message> {
  return createAiClient().messages.create({ ...params, model });
}

/** Try Sonnet first; on any failure, retry once with Opus. */
export async function createMessageWithFallback(params: MessageParams): Promise<Anthropic.Message> {
  try {
    return await createMessage(params, MODEL_SONNET);
  } catch {
    return createMessage(params, MODEL_OPUS);
  }
}

export function textFromMessage(response: Anthropic.Message): string {
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude did not return a text response.');
  }
  return textBlock.text;
}
