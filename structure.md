careerpilot/
├── app/
│   ├── layout.tsx                    # Root: Inter + Roboto, ClerkProvider, QueryProvider
│   ├── globals.css                   # Tailwind v4 + brand tokens
│   ├── page.tsx                      # Marketing landing (hero w/ brand-dna headlines)
│   ├── (marketing)/
│   │   ├── pricing/page.tsx
│   │   └── about/page.tsx
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/page.tsx
│   │   └── sign-up/[[...sign-up]]/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                # Auth-gated shell: Sidebar + Topbar
│   │   ├── dashboard/page.tsx        # Pillar 8: real-data progress dashboard
│   │   ├── cv/page.tsx               # Pillar 2: upload + manage CVs
│   │   ├── hunter/page.tsx           # Pillar 3: Job Hunter Agent + cards
│   │   ├── fit-score/page.tsx        # Pillar 4: compute % match
│   │   ├── chat/page.tsx             # Pillar 5: RAG Assistant
│   │   ├── tracker/page.tsx          # Pillar 7: Kanban (Applied/Interview/Offer/Rejected)
│   │   ├── calendar/page.tsx         # Pillar 6: Calendar + to-do + goal deadlines
│   │   └── settings/page.tsx
│   └── api/
│       ├── chat/route.ts             # Streaming AI SDK endpoint
│       ├── cv/upload/route.ts        # POST → Supabase Storage + Inngest event
│       ├── cv/process/route.ts       # Worker: parse → chunk → embed → upsert
│       ├── hunter/search/route.ts    # Agent: tool-calling search
│       ├── fit-score/route.ts        # Compute + explain
│       └── webhooks/clerk/route.ts   # Sync Clerk user → Supabase profile
├── components/
│   ├── ui/                           # Button, Card, Input, Badge, Sheet (shadcn-style)
│   ├── marketing/                    # Hero, Features, CTA, Footer
│   ├── dashboard/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   ├── StatsCard.tsx
│   │   ├── ApplicationTrendChart.tsx
│   │   └── SkillRadar.tsx
│   ├── cv/{Uploader,CVList,CVPreview}.tsx
│   ├── hunter/{SearchBar,JobCard,FilterPanel}.tsx
│   ├── fit-score/{JobInput,ScoreGauge,ExplanationList}.tsx
│   ├── chat/{ChatWindow,MessageBubble,SourceCitations,ToolBadge}.tsx
│   ├── tracker/{KanbanBoard,KanbanColumn,ApplicationCard}.tsx
│   └── calendar/{MonthCalendar,TodoPanel,GoalDeadlineDialog}.tsx
├── lib/
│   ├── ai/
│   │   ├── embeddings.ts             # OpenAI text-embedding-3-small
│   │   ├── rag.ts                    # retrieve(userId, query) → top-k chunks
│   │   ├── prompts/                  # system prompts per agent
│   │   └── tools/
│   │       ├── webSearch.ts          # Tavily
│   │       └── jobBoards.ts          # Adzuna / Jooble
│   ├── agents/
│   │   ├── hunter.ts                 # Job Hunter Agent (tool-calling)
│   │   ├── assistant.ts              # Chat agent (RAG + memory)
│   │   └── fitScore.ts               # Skill overlap + semantic + experience
│   ├── cv/
│   │   ├── parser.ts                 # pdf-parse + mammoth
│   │   ├── chunker.ts                # 500-token sliding window
│   │   └── ingester.ts               # Orchestrates parse → chunk → embed → upsert
│   ├── supabase/{client,server,admin,middleware}.ts
│   ├── clerk/{currentUser,auth}.ts
│   ├── memory/sessionStore.ts        # Persist chat history
│   └── utils/{date,scoring,format}.ts
├── hooks/{useChat,useApplications,useCalendar,useCV,useFitScore}.ts
├── types/{database,application,job,cv,chat}.ts
├── db/
│   ├── schema.sql                    # Tables + pgvector + RLS policies
│   ├── migrations/
│   └── seed.sql
├── inngest/
│   ├── client.ts
│   └── functions/process-cv.ts       # Background CV ingestion
├── public/                           # Logo, OG image
├── middleware.ts                     # Clerk protect (dashboard) routes
├── tailwind.config.ts                # Brand tokens: primary #003893, secondary #2D2D2D
├── next.config.ts
├── package.json
└── .env.local                        # OPENAI_API_KEY, CLERK_*, SUPABASE_*, TAVILY_*, ADZUNA_*