# Khaataa AI

**Live demo:** [shop-log-five.vercel.app](https://shop-log-five.vercel.app) · **Repo:** [github.com/AhmadRaza4076/ShopLog](https://github.com/AhmadRaza4076/ShopLog)

An AI bookkeeper for small shops. Type a line, say it out loud, or photograph
a receipt — it all becomes real bookkeeping: live dashboard, automatic
inventory, khaataa (customer credit) tracking with AI-drafted reminders, and
an explainable credit-readiness score. A floating voice agent lets you run
the entire app hands-free.

## Stack

TypeScript + Next.js 14 (App Router) for both frontend and backend, Postgres
on Neon for storage, the Claude API for parsing and the voice agent, and the
browser's built-in Web Speech API for voice input/output (Chrome or Edge).

## 1. Set up the database (free)

1. Create a free account and project at [neon.tech](https://neon.tech).
2. Open the SQL editor for your new project and run everything in
   `scripts/schema.sql`.
3. Copy your connection string (use the **pooled** connection string if
   given the option — it's the right one for serverless deployments).

## 2. Environment variables (secrets)

Copy the example file and fill in your values — **no spaces around `=`**:

```bash
cp .env.example .env.local
```

| Variable | Where to get it |
|----------|-----------------|
| `ANTHROPIC_API_KEY` | Hackathon organizers (LiteLLM key) |
| `ANTHROPIC_BASE_URL` | `https://litellm.rapidscreen.io` |
| `DATABASE_URL` | Neon dashboard → pooled connection string |

**Security:** `.env.local` is gitignored and must never be committed or pasted into GitHub/Discord. For Vercel, add the same variables in the project **Environment Variables** settings — never hardcode them in source files. If your database password was ever exposed, reset it in the Neon dashboard and update `DATABASE_URL`.

## 3. Run locally

```bash
npm install
npm run dev
```

`npm run dev` automatically frees ports 3000–3010 (kills stale dev servers) and always starts on **http://localhost:3000**. The terminal showing `✓ Ready` means the server is running — open that URL in your browser.

**"Load demo data"** on the dashboard seeds a realistic week of activity for three sample customers.

## 4. Deploy to Vercel (free)

1. Push this project to a GitHub repo.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. In the project's Environment Variables settings, add `ANTHROPIC_API_KEY`,
   `ANTHROPIC_BASE_URL`, and `DATABASE_URL` with your real values.
4. Deploy. Production is live at [shop-log-five.vercel.app](https://shop-log-five.vercel.app) — pushes to `main` auto-deploy via Vercel.

## Key features

- **Today's profit** — dashboard shows gross margin from today's sales using buy/sell prices already in `shop_items` and transaction rows (`lib/computed.ts` → `computeProfitSummary`). Ask by voice: *"aaj kitna munafa hua?"*
- **Credit readiness score** — per-customer 0–100 score with explainable factors on the Khaataa screen (`lib/scoring.ts`). Ask by voice: *"Ali ka credit score kya hai?"*
- **WhatsApp reminders** — AI drafts a polite Urdu/English reminder; copy or tap **Send on WhatsApp** to open `wa.me` with the customer's phone (`lib/whatsapp.ts`).

## Demo script (3 minutes)

1. **Dashboard** — Load demo data → point at *Today's profit* and *Total owed*
2. **Entry** — Type or say a credit sale → inventory and khaataa update
3. **Khaataa** — Select Ali Raza → credit score + factors → Draft reminder → **Send on WhatsApp**
4. **Voice** — *"aaj kitna munafa hua?"* and *"Ali kitna baqi hai?"*

## How it's organized

Every feature — inventory, khaataa balances, the credit score — is a
computed view over one `transactions` table. There's no separate table to
keep in sync by hand; add a row, and every screen that depends on it updates
correctly. See `lib/computed.ts` (client-side views) and `lib/scoring.ts`
(the credit score) for where that logic lives.

All three entry methods (typed, voice, photo) funnel into the same two
functions: `parseEntryText` / `parseReceiptImage` in `lib/claude.ts`, which
both return the same normalized `ParsedTransaction` shape, saved by the same
`saveParsedTransaction` helper in `lib/db.ts`.

The floating voice agent (`components/VoiceControl.tsx`) is a separate,
more powerful layer: instead of just transcribing text, it sends the
transcript to Claude with a defined set of tools (navigate, add a
transaction, mark a payment, check a balance, check a score, send a
reminder) and Claude decides which action applies — `/api/voice-command`
executes whatever it decides.

## A note on cost

Realistically $0–5 total for a hackathon-scale build, covered by the free
signup credit. Text parsing uses the cheaper Haiku model; only receipt-photo
parsing and the voice agent use the stronger (and pricier) Sonnet model,
since those are the two places accuracy matters more than cost.
