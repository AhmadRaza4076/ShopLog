# Khaataa AI

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

## 2. Get a Claude API key

1. Go to [console.anthropic.com](https://console.anthropic.com) and create
   an API key. New accounts get $5 in free credits, no card required.
2. **Keep this key private.** Never commit it, paste it into chat, or share
   it with anyone — treat it like a password.

## 3. Run locally

```bash
npm install
cp .env.example .env.local
# now edit .env.local and paste in your real ANTHROPIC_API_KEY and DATABASE_URL

npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On first load, hit
**"Load demo data"** on the dashboard to seed a realistic week of activity
for three sample customers — useful for demos so the app isn't empty.

## 4. Deploy to Vercel (free)

1. Push this project to a GitHub repo.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. In the project's Environment Variables settings, add `ANTHROPIC_API_KEY`
   and `DATABASE_URL` with your real values.
4. Deploy. You'll get a public `yourproject.vercel.app` URL to submit.

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
