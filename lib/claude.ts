import Anthropic from '@anthropic-ai/sdk';
import type { ParsedTransaction, InventorySheetRow, EntryIntent } from './types';
import {
  MODEL_OPUS,
  MODEL_SONNET,
  createMessage,
  isModelAccessError,
  textFromMessage,
} from './ai-client';
import { DEMO_SHOP_ID } from './db';
import { buildShopContextBlock } from './shop-context';

const BASE_PARSE_SYSTEM_PROMPT = `You convert a shopkeeper's informal note into a single structured ledger transaction.

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
- When quantity is known but price is not stated, look up sell_price (sales/credit) or buy_price (purchases) from known inventory and set unit_price and total_amount = quantity × unit_price.
- Never invent a customer name. If none is mentioned, set customer_name to null.
- Match customer names to the shop's known customer list when clearly the same person.
- Use exact item names from the shop's known inventory list when possible.
- total_amount is required. Use quantity × catalog unit price when price is not spoken; otherwise your best numeric estimate with confidence "low".`;

const VOICE_TOOL_GUIDANCE = `
Tool selection rules (pick exactly ONE tool):
- "open / go to / show" a screen → navigate_to (optional query for search on inventory or khaataa)
- "how much / stock of X" → lookup_inventory
- "what's in stock / list inventory" → list_inventory
- "find / search" a customer → lookup_customer
- "how much does X owe" → get_balance
- "profit today / today's profit / margin today" → get_today_profit
- "credit score / credit rating for X" → get_credit_score
- "add X bags/units to inventory / stock in / bought stock" → add_stock (NOT add_transaction)
- "set X to N bags / I have N X now / update stock to N" → set_stock
- "add customer / register X phone …" → add_customer
- sale, purchase with customer, payment, credit, reminder → existing tools (add_transaction, mark_payment, send_reminder)

Examples:
- "add 50 cement bags to inventory" → add_stock { item_name: "Cement (bag)", quantity: 50 }
- "how much cement do we have" → lookup_inventory { query: "cement" }
- "find Ali in khaataa" → lookup_customer { query: "Ali" }
- "open inventory" → navigate_to { page: "inventory" }
- "add customer Sara phone 03001234567" → add_customer { name: "Sara", phone: "03001234567" }
`;

async function parseSystemPrompt(intentHint?: string): Promise<string> {
  const context = await buildShopContextBlock(DEMO_SHOP_ID);
  const hint = intentHint ? `\nUser intent for this entry: ${intentHint}\n` : '';
  return context + hint + BASE_PARSE_SYSTEM_PROMPT;
}

const INVENTORY_SHEET_PROMPT = `You extract a stock inventory list from a shopkeeper's notebook page, typed list, or supplier sheet.

Respond with ONLY a JSON array, no other text. Each element:
{
  "item_name": string,
  "quantity": number,
  "unit_price": number | null
}

Rules:
- quantity is units on hand or quantity purchased — must be a positive number.
- unit_price per unit in rupees if stated; null if unknown.
- Use exact item names from the shop's known inventory when clearly the same product.
- Skip header rows, totals-only lines, and blank lines.
- Return an empty array [] if no items found.`;

async function inventorySheetSystemPrompt(): Promise<string> {
  const context = await buildShopContextBlock(DEMO_SHOP_ID);
  return context + INVENTORY_SHEET_PROMPT;
}

async function voiceSystemPrompt(): Promise<string> {
  const context = await buildShopContextBlock(DEMO_SHOP_ID);
  return (
    context +
    "You control a small shop's bookkeeping app by mapping the shopkeeper's spoken command to exactly " +
    'one tool call. Commands are in English. If the command is too ambiguous to act on safely, call no tool ' +
    'and explain why in plain English (for text-to-speech readout — never use Urdu script).' +
    VOICE_TOOL_GUIDANCE
  );
}

function extractJson<T>(text: string): T {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '');
  return JSON.parse(cleaned) as T;
}

function isJsonParseError(err: unknown): boolean {
  return err instanceof SyntaxError;
}

async function parseStructuredTransaction(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>
): Promise<ParsedTransaction> {
  try {
    const response = await createMessage(params, MODEL_SONNET);
    return extractJson<ParsedTransaction>(textFromMessage(response));
  } catch (err) {
    if (isModelAccessError(err)) {
      const response = await createMessage(params, MODEL_OPUS);
      return extractJson<ParsedTransaction>(textFromMessage(response));
    }
    if (isJsonParseError(err)) {
      const response = await createMessage(params, MODEL_SONNET);
      return extractJson<ParsedTransaction>(textFromMessage(response));
    }
    throw err;
  }
}

export async function parseEntryText(rawText: string, intent?: EntryIntent): Promise<ParsedTransaction> {
  const intentLabels: Record<EntryIntent, string> = {
    sale: 'sale to a customer',
    purchase: 'stock-in / purchase from supplier (updates inventory)',
    payment: 'customer payment against credit',
    credit_given: 'credit given to customer',
  };
  const hint = intent ? `Prefer transaction type "${intent}" (${intentLabels[intent]}).` : undefined;
  const system = await parseSystemPrompt(hint);
  return parseStructuredTransaction({
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: rawText }],
  });
}

export async function parseReceiptImage(
  base64Data: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp',
  intent?: EntryIntent
): Promise<ParsedTransaction> {
  const intentLabels: Record<EntryIntent, string> = {
    sale: 'sale to a customer',
    purchase: 'stock-in / purchase from supplier',
    payment: 'customer payment',
    credit_given: 'credit given',
  };
  const hint = intent ? `Prefer type "${intent}" (${intentLabels[intent]}).` : undefined;
  const system = await parseSystemPrompt(hint);
  const params = {
    max_tokens: 500,
    system,
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
  } catch (err) {
    if (isModelAccessError(err)) {
      const response = await createMessage(params, MODEL_OPUS);
      return extractJson<ParsedTransaction>(textFromMessage(response));
    }
    if (isJsonParseError(err)) {
      const response = await createMessage(params, MODEL_SONNET);
      return extractJson<ParsedTransaction>(textFromMessage(response));
    }
    throw err;
  }

  const response = await createMessage(params, MODEL_SONNET);
  return extractJson<ParsedTransaction>(textFromMessage(response));
}

async function parseInventorySheetJson(
  params: Omit<Anthropic.MessageCreateParamsNonStreaming, 'model'>
): Promise<InventorySheetRow[]> {
  try {
    const response = await createMessage(params, MODEL_SONNET);
    const rows = extractJson<InventorySheetRow[]>(textFromMessage(response));
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    if (isModelAccessError(err)) {
      const response = await createMessage(params, MODEL_OPUS);
      const rows = extractJson<InventorySheetRow[]>(textFromMessage(response));
      return Array.isArray(rows) ? rows : [];
    }
    if (isJsonParseError(err)) {
      const response = await createMessage(params, MODEL_SONNET);
      const rows = extractJson<InventorySheetRow[]>(textFromMessage(response));
      return Array.isArray(rows) ? rows : [];
    }
    throw err;
  }
}

export async function parseInventorySheetText(rawText: string): Promise<InventorySheetRow[]> {
  const system = await inventorySheetSystemPrompt();
  return parseInventorySheetJson({
    max_tokens: 2000,
    system,
    messages: [{ role: 'user', content: rawText }],
  });
}

export async function parseInventorySheetImage(
  base64Data: string,
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'
): Promise<InventorySheetRow[]> {
  const system = await inventorySheetSystemPrompt();
  return parseInventorySheetJson({
    max_tokens: 2000,
    system,
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
              'This photo shows a stock inventory list (notebook, supplier sheet, or shelf count). ' +
              'Extract every item row with quantity and unit price if visible.',
          },
        ],
      },
    ],
  });
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
  | { tool: 'navigate_to'; page: 'dashboard' | 'sales' | 'inventory' | 'khaataa' | 'entry' | 'history'; query?: string | null }
  | { tool: 'lookup_inventory'; query: string }
  | { tool: 'list_inventory' }
  | { tool: 'lookup_customer'; query: string }
  | { tool: 'add_stock'; item_name: string; quantity: number; unit_price?: number | null }
  | { tool: 'set_stock'; item_name: string; target_quantity: number; unit_price?: number | null }
  | { tool: 'add_customer'; name: string; phone?: string | null }
  | { tool: 'add_transaction'; parsed: ParsedTransaction }
  | { tool: 'mark_payment'; customer_name: string; amount: number }
  | { tool: 'get_balance'; customer_name: string }
  | { tool: 'get_today_profit' }
  | { tool: 'get_credit_score'; customer_name: string }
  | { tool: 'send_reminder'; customer_name: string }
  | { tool: 'unclear'; reason: string };

const VOICE_TOOLS: Anthropic.Tool[] = [
  {
    name: 'navigate_to',
    description: 'Switch the screen the shopkeeper is looking at. Optionally pass query to filter inventory or khaataa.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', enum: ['dashboard', 'sales', 'inventory', 'khaataa', 'entry', 'history'] },
        query: { type: ['string', 'null'], description: 'Optional search filter when opening inventory or khaataa' },
      },
      required: ['page'],
    },
  },
  {
    name: 'lookup_inventory',
    description: 'Look up how much of an item is in stock (partial name match).',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Item name or keyword e.g. cement' } },
      required: ['query'],
    },
  },
  {
    name: 'list_inventory',
    description: 'List all items currently tracked in inventory.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'lookup_customer',
    description: 'Find a customer in the khaataa by partial name and show their balance.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Customer name or partial name' } },
      required: ['query'],
    },
  },
  {
    name: 'add_stock',
    description: 'Add quantity to inventory (stock-in / purchase). Use for "add X bags to inventory".',
    input_schema: {
      type: 'object',
      properties: {
        item_name: { type: 'string' },
        quantity: { type: 'number' },
        unit_price: { type: ['number', 'null'] },
      },
      required: ['item_name', 'quantity'],
    },
  },
  {
    name: 'set_stock',
    description: 'Set absolute on-hand quantity for an item ("set cement to 50 bags", "I have 50 cement now").',
    input_schema: {
      type: 'object',
      properties: {
        item_name: { type: 'string' },
        target_quantity: { type: 'number' },
        unit_price: { type: ['number', 'null'] },
      },
      required: ['item_name', 'target_quantity'],
    },
  },
  {
    name: 'add_customer',
    description: 'Register a new customer with name and optional phone number (no transaction).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: ['string', 'null'] },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_transaction',
    description:
      'Record a sale, purchase with customer, payment, or credit transaction — not for simple stock-in.',
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
    name: 'get_today_profit',
    description: 'Answer how much gross profit the shop made today from sales (sell minus buy price).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_credit_score',
    description: 'Show credit readiness score and rating for a named customer.',
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
        page: input.page as 'dashboard' | 'sales' | 'inventory' | 'khaataa' | 'entry' | 'history',
        query: (input.query as string | null) ?? null,
      };
    case 'lookup_inventory':
      return { tool: 'lookup_inventory', query: input.query as string };
    case 'list_inventory':
      return { tool: 'list_inventory' };
    case 'lookup_customer':
      return { tool: 'lookup_customer', query: input.query as string };
    case 'add_stock':
      return {
        tool: 'add_stock',
        item_name: input.item_name as string,
        quantity: input.quantity as number,
        unit_price: (input.unit_price as number | null) ?? null,
      };
    case 'set_stock':
      return {
        tool: 'set_stock',
        item_name: input.item_name as string,
        target_quantity: input.target_quantity as number,
        unit_price: (input.unit_price as number | null) ?? null,
      };
    case 'add_customer':
      return {
        tool: 'add_customer',
        name: input.name as string,
        phone: (input.phone as string | null) ?? null,
      };
    case 'add_transaction': {
      const raw = input as Record<string, unknown>;
      if (typeof raw.total_amount !== 'number') {
        return { tool: 'unclear', reason: 'Could not parse the amount.' };
      }
      const parsed: ParsedTransaction = {
        type: raw.type as ParsedTransaction['type'],
        item_name: (raw.item_name as string | null) ?? null,
        quantity: (raw.quantity as number | null) ?? null,
        unit_price: (raw.unit_price as number | null) ?? null,
        total_amount: raw.total_amount,
        customer_name: (raw.customer_name as string | null) ?? null,
        is_credit: Boolean(raw.is_credit),
        confidence: (raw.confidence as ParsedTransaction['confidence']) ?? 'medium',
      };
      return { tool: 'add_transaction', parsed };
    }
    case 'mark_payment':
      return {
        tool: 'mark_payment',
        customer_name: input.customer_name as string,
        amount: input.amount as number,
      };
    case 'get_balance':
      return { tool: 'get_balance', customer_name: input.customer_name as string };
    case 'get_today_profit':
      return { tool: 'get_today_profit' };
    case 'get_credit_score':
      return { tool: 'get_credit_score', customer_name: input.customer_name as string };
    case 'send_reminder':
      return { tool: 'send_reminder', customer_name: input.customer_name as string };
    default:
      return { tool: 'unclear', reason: `Unrecognized tool: ${toolUse.name}` };
  }
}

export async function runVoiceCommand(transcript: string): Promise<VoiceAgentAction> {
  const system = await voiceSystemPrompt();
  const params = {
    max_tokens: 400,
    system,
    tools: VOICE_TOOLS,
    messages: [{ role: 'user' as const, content: transcript }],
  };

  let sonnetUnclear: VoiceAgentAction | null = null;

  try {
    const sonnetResponse = await createMessage(params, MODEL_SONNET);
    const action = voiceActionFromResponse(sonnetResponse);
    if (action.tool !== 'unclear') return action;
    sonnetUnclear = action;
  } catch (err) {
    if (isModelAccessError(err)) {
      const opusResponse = await createMessage(params, MODEL_OPUS);
      return voiceActionFromResponse(opusResponse);
    }
    throw err;
  }

  try {
    const opusResponse = await createMessage(params, MODEL_OPUS);
    return voiceActionFromResponse(opusResponse);
  } catch (err) {
    if (sonnetUnclear) return sonnetUnclear;
    throw err;
  }
}
