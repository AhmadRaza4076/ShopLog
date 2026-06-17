import Anthropic from '@anthropic-ai/sdk';
import type { ParsedTransaction } from './types';
import {
  MODEL_OPUS,
  MODEL_SONNET,
  createMessage,
  textFromMessage,
} from './ai-client';

const PARSE_SYSTEM_PROMPT = `You convert a shopkeeper's informal note into a single structured ledger transaction.

Respond with ONLY a JSON object, no other text, matching exactly this shape:
{
  "type": "sale" | "purchase" | "payment" | "credit_given",
  "item_name": string | null,
  "quantity": number | null,
  "unit_price": number | null,
  "total_amount": number,
  "customer_name": string | null,
  "is_credit": boolean,
  "confidence": "high" | "medium" | "low",
  "note": string | null
}

Rules:
- "sale" = shop sold something to a customer. "purchase" = shop bought stock from a supplier.
  "payment" = a customer is paying off existing credit. "credit_given" = goods given on credit with no payment yet.
- is_credit is true whenever money is owed and not yet paid (e.g. "500 owed", "udhaar", "khaata pe", "baad mein de dena").
- The input may mix English, Urdu, and Roman-Urdu (e.g. "udhaar", "bik gaya", "diya"). Understand all of these.
- If a number isn't stated explicitly, infer it only if unambiguous; otherwise set it to null and lower confidence.
- Never invent a customer name. If none is mentioned, set customer_name to null.
- total_amount is required and must be your best numeric estimate even if confidence is "low".`;

function extractJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
  return JSON.parse(cleaned) as T;
}

async function parseStructuredTransaction(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>
): Promise<ParsedTransaction> {
  try {
    const response = await createMessage(params, MODEL_SONNET);
    return extractJson<ParsedTransaction>(textFromMessage(response));
  } catch {
    const response = await createMessage(params, MODEL_OPUS);
    return extractJson<ParsedTransaction>(textFromMessage(response));
  }
}

export async function parseEntryText(rawText: string): Promise<ParsedTransaction> {
  return parseStructuredTransaction({
    max_tokens: 400,
    system: PARSE_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: rawText }],
  });
}

export async function parseReceiptImage(
  base64Data: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<ParsedTransaction> {
  const params = {
    max_tokens: 500,
    system: PARSE_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: mediaType, data: base64Data },
          },
          {
            type: 'text' as const,
            text:
              'This is a photo of a handwritten or printed receipt / notebook page from a small shop. ' +
              'Extract the single most prominent transaction it represents, following the JSON schema exactly.',
          },
        ],
      },
    ],
  };

  try {
    const response = await createMessage(params, MODEL_SONNET);
    const parsed = extractJson<ParsedTransaction>(textFromMessage(response));
    if (parsed.confidence !== 'low') return parsed;
  } catch {
    // fall through to Opus — hard task (messy handwriting / unclear photo)
  }

  const response = await createMessage(params, MODEL_OPUS);
  return extractJson<ParsedTransaction>(textFromMessage(response));
}

export async function draftReminder(
  customerName: string,
  amountOwed: number,
  daysSinceLastPayment: number | null
): Promise<string> {
  const response = await createMessage(
    {
      max_tokens: 200,
      system:
        'You write a short, polite, respectful payment reminder message in plain English a shopkeeper ' +
        'can copy and send over WhatsApp to a customer. Keep it under 40 words. No subject line, no signature block. ' +
        'Be warm, not accusatory — this is an ongoing customer relationship, not a debt collection notice.',
      messages: [
        {
          role: 'user',
          content: `Customer name: ${customerName}. Amount owed: Rs. ${amountOwed}. ${
            daysSinceLastPayment
              ? `Days since their last payment: ${daysSinceLastPayment}.`
              : 'No prior payment on record.'
          }`,
        },
      ],
    },
    MODEL_SONNET
  );

  return textFromMessage(response).trim();
}

// ---- Voice agent: Claude decides which app action a spoken command maps to ----

export type VoiceAgentAction =
  | { tool: 'navigate_to'; page: 'dashboard' | 'inventory' | 'khaataa' | 'entry' | 'history' }
  | { tool: 'add_transaction'; parsed: ParsedTransaction }
  | { tool: 'mark_payment'; customer_name: string; amount: number }
  | { tool: 'get_balance'; customer_name: string }
  | { tool: 'get_credit_score'; customer_name: string }
  | { tool: 'send_reminder'; customer_name: string }
  | { tool: 'unclear'; reason: string };

const VOICE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'navigate_to',
    description: 'Switch the screen the shopkeeper is looking at.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: ['dashboard', 'inventory', 'khaataa', 'entry', 'history'] },
      },
      required: ['page'],
    },
  },
  {
    name: 'add_transaction',
    description:
      'Record a new sale, purchase, payment, or credit transaction described in the spoken command.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['sale', 'purchase', 'payment', 'credit_given'] },
        item_name: { type: ['string', 'null'] },
        quantity: { type: ['number', 'null'] },
        unit_price: { type: ['number', 'null'] },
        total_amount: { type: 'number' },
        customer_name: { type: ['string', 'null'] },
        is_credit: { type: 'boolean' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      },
      required: ['type', 'total_amount', 'is_credit', 'confidence'],
    },
  },
  {
    name: 'mark_payment',
    description: 'Record that a named customer has just paid off some or all of what they owe.',
    input_schema: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        amount: { type: 'number' },
      },
      required: ['customer_name', 'amount'],
    },
  },
  {
    name: 'get_balance',
    description: 'Answer "how much does X owe me" for a named customer.',
    input_schema: {
      type: 'object',
      properties: { customer_name: { type: 'string' } },
      required: ['customer_name'],
    },
  },
  {
    name: 'get_credit_score',
    description: 'Answer "what is X\'s credit score / credit-readiness" for a named customer.',
    input_schema: {
      type: 'object',
      properties: { customer_name: { type: 'string' } },
      required: ['customer_name'],
    },
  },
  {
    name: 'send_reminder',
    description: 'Draft and queue a payment reminder message for a named customer.',
    input_schema: {
      type: 'object',
      properties: { customer_name: { type: 'string' } },
      required: ['customer_name'],
    },
  },
];

function voiceActionFromResponse(response: Anthropic.Message): VoiceAgentAction {
  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    const textBlock = response.content.find((b) => b.type === 'text');
    const reason =
      textBlock && textBlock.type === 'text' ? textBlock.text : "Couldn't understand that command.";
    return { tool: 'unclear', reason };
  }

  const input = toolUse.input as Record<string, unknown>;

  switch (toolUse.name) {
    case 'navigate_to':
      return {
        tool: 'navigate_to',
        page: input.page as 'dashboard' | 'inventory' | 'khaataa' | 'entry' | 'history',
      };
    case 'add_transaction':
      return { tool: 'add_transaction', parsed: input as unknown as ParsedTransaction };
    case 'mark_payment':
      return {
        tool: 'mark_payment',
        customer_name: input.customer_name as string,
        amount: input.amount as number,
      };
    case 'get_balance':
      return { tool: 'get_balance', customer_name: input.customer_name as string };
    case 'get_credit_score':
      return { tool: 'get_credit_score', customer_name: input.customer_name as string };
    case 'send_reminder':
      return { tool: 'send_reminder', customer_name: input.customer_name as string };
    default:
      return { tool: 'unclear', reason: `Unrecognized tool: ${toolUse.name}` };
  }
}

export async function runVoiceCommand(transcript: string): Promise<VoiceAgentAction> {
  const params = {
    max_tokens: 400,
    system:
      "You control a small shop's bookkeeping app by mapping the shopkeeper's spoken command to exactly " +
      "one tool call. Commands may mix English, Urdu, and Roman-Urdu. If the command is too ambiguous to " +
      'act on safely, call no tool and explain why in plain text instead.',
    tools: VOICE_TOOLS,
    messages: [{ role: 'user' as const, content: transcript }],
  };

  try {
    const sonnetResponse = await createMessage(params, MODEL_SONNET);
    const action = voiceActionFromResponse(sonnetResponse);
    if (action.tool !== 'unclear') return action;
  } catch {
    // API error on Sonnet — try Opus below
  }

  const opusResponse = await createMessage(params, MODEL_OPUS);
  return voiceActionFromResponse(opusResponse);
}
