# CareerPilot

Put your job search on autopilot. CareerPilot is a Next.js 16 SaaS that reads your CV, hunts live roles, scores every match, and tracks every application.

## Stack

- **Next.js 16** (App Router, TypeScript strict)
- **Tailwind CSS** with brand tokens from `brand-dna.md`
- **Lucide React** icons
- **Clerk** (auth), **Supabase** (data + pgvector), **OpenAI** (RAG + agents), **Tavily / Adzuna** (live job data), **Inngest** (background CV ingestion)

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev
```

## Brand DNA

- Primary: `#003893` (Brand Blue)
- Secondary: `#2D2D2D` (Dark Charcoal)
- Background: `#FFFFFF`
- Headings: Inter / Body: Roboto
- Tone: action-oriented, direct, empowering

See `brand-dna.md` and `structure.md` for the full plan.
