// CareerPilot — Job Hunter Agent (Pillar 1).
//
// Flow:
//   1. Build a CV-grounded search prompt from the user's query + CV chunks.
//   2. Ask Gemini (with the Google Search tool) for live postings.
//   3. Ask Gemini again to (a) score fit 0-100 against the CV, and
//      (b) structure the response into a JobCard[] with reasoning.
//   4. Return the cards. The route handler persists + caches them.
//
// Notes:
//   * We deliberately do NOT call the chat completion function from
//     lib/ai/provider.ts — that one is for multi-turn chat. The hunter
//     needs tool-calling + structured output, so it talks to the SDK
//     directly.
//   * The structured step uses a responseSchema so Gemini cannot
//     drift from the JobCard shape. This is the Gemini equivalent of
//     OpenAI's JSON mode.

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { retrieveCvChunks } from "@/lib/rag/retrieve-cv";

const MODEL = "gemini-2.5-flash";

export type JobCard = {
  id: string;            // local stable id, derived from url hash
  title: string;
  company: string;
  location: string | null;
  salary: string | null;
  deadline: string | null; // ISO yyyy-mm-dd or "unknown"
  url: string;
  snippet: string;
  jobType: string;       // "internship" | "full-time" | "contract" | "research" | "other"
  fitScore: number;      // 0..100
  fitReason: string;     // 1-2 sentence justification grounded in CV
  matchHighlights: string[]; // bullet-list of CV attributes that matched
  concerns: string[];        // bullet-list of CV-vs-job mismatches
};

export type HunterResult = {
  query: string;
  jobs: JobCard[];
  reasoning: string;     // 1-2 sentence overall narrative
  model: string;
  retrievedAt: string;
};

const HUNTER_OUTPUT_SCHEMA: import("@google/generative-ai").Schema = {
  type: SchemaType.OBJECT,
  properties: {
    reasoning: {
      type: SchemaType.STRING,
      description:
        "One or two sentences summarising the search strategy and the overall quality of the matches for this user.",
    },
    jobs: {
      type: SchemaType.OBJECT,
      properties: {
        items: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              title:            { type: SchemaType.STRING },
              company:          { type: SchemaType.STRING },
              location:         { type: SchemaType.STRING,  nullable: true },
              salary:           { type: SchemaType.STRING,  nullable: true },
              deadline:         { type: SchemaType.STRING,  nullable: true },
              url:              { type: SchemaType.STRING },
              snippet:          { type: SchemaType.STRING, description: "2-3 sentence teaser copied/paraphrased from the listing." },
              jobType:          { type: SchemaType.STRING },
              fitScore:         { type: SchemaType.INTEGER, description: "0-100 integer." },
              fitReason:        { type: SchemaType.STRING },
              matchHighlights:  { type: SchemaType.ARRAY, items: { type: SchemaType.STRING, nullable: true } },
              concerns:         { type: SchemaType.ARRAY, items: { type: SchemaType.STRING, nullable: true } },
            },
            required: ["title", "company", "url", "snippet", "jobType", "fitScore", "fitReason", "matchHighlights", "concerns"],
          },
        },
      },
      required: ["items"],
    },
  },
  required: ["reasoning", "jobs"],
};

// ---------- helpers ----------

function stableId(input: string): string {
  // Tiny non-cryptographic hash for stable client-side keys.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `job-${h.toString(16)}`;
}

function normalise(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s\n\t]+/g, " ")
    .replace(/[^a-z0-9 .,?!\-+&]/g, "")
    .trim();
}

async function getClient(): Promise<GoogleGenerativeAI> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return new GoogleGenerativeAI(key);
}

function buildSearchPrompt(query: string, cvContext: string): string {
  return [
    "You are a research assistant for a job-hunter agent.",
    "Use Google Search to find 5-10 real, currently-posted job or internship",
    "listings that match the USER QUERY.",
    "",
    "USER QUERY:",
    query.trim(),
    "",
    cvContext
      ? "USER CV HIGHLIGHTS (use this to bias the search toward roles the user is actually qualified for):\n" + cvContext
      : "USER CV HIGHLIGHTS: none available — search broadly for the role/location/seniority stated in the query.",
    "",
    "Return ONLY the 5-10 most relevant listings. For each, include the canonical",
    "job-posting URL (not a search-aggregator URL unless that is the actual posting).",
    "Prefer postings that still have a deadline in the future.",
  ].join("\n");
}

function buildStructurePrompt(query: string, rawListings: string, cvContext: string): string {
  return [
    "You are the Job Hunter agent for CareerPilot.",
    "",
    "USER QUERY:",
    query.trim(),
    "",
    cvContext
      ? "USER CV HIGHLIGHTS:\n" + cvContext
      : "USER CV HIGHLIGHTS: none available.",
    "",
    "RAW JOB LISTINGS (each one was found by a web search):",
    "<<<",
    rawListings,
    ">>>",
    "",
    "Your job is to:",
    "  1. Pick the 5-10 best-matching listings from the RAW block above.",
    "  2. For each, score fit (0-100) AGAINST THE USER CV.",
    "  3. Explain WHY in 1-2 sentences, citing specific CV evidence.",
    "  4. Flag concrete concerns (skill gap, seniority, location, etc.).",
    "",
    "Rules:",
    "  - jobType must be one of: internship, full-time, contract, research, other.",
    "  - deadline must be an ISO date (yyyy-mm-dd) or null if the listing does not state one.",
    "  - fitScore is an INTEGER in [0, 100].",
    "  - matchHighlights and concerns are arrays of short strings (1 sentence each).",
    "  - Drop duplicate URLs. Drop obvious non-job results.",
    "  - Do not invent URLs. If a URL is missing, set url to the most plausible",
    "    application page or the company careers URL you can infer from the listing.",
    "",
    "Respond with a single JSON object matching the required schema. No prose outside JSON.",
  ].join("\n");
}

function summariseCv(chunks: Awaited<ReturnType<typeof retrieveCvChunks>>): string {
  if (chunks.length === 0) return "";
  return chunks
    .slice(0, 6)
    .map((c, i) => `[${i + 1}] ${c.text}`)
    .join("\n\n");
}

// ---------- main entrypoint ----------

export async function runHunter(userId: string, query: string): Promise<HunterResult> {
  if (!query.trim()) throw new Error("Query is empty");

  const cvChunks = await retrieveCvChunks(userId, query);
  const cvContext = summariseCv(cvChunks);

  const genai = await getClient();
  const model = genai.getGenerativeModel({
    model: MODEL,
    tools: [{ googleSearch: {} } as unknown as Record<string, never>],
  });

  // Stage 1: live search.
  const searchRes = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: buildSearchPrompt(query, cvContext) }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
  });
  const rawListings = searchRes.response.text();

  // Stage 2: structure + score, with responseSchema enforcement.
  const structModel = genai.getGenerativeModel({
    model: MODEL,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 3072,
      responseMimeType: "application/json",
      responseSchema: HUNTER_OUTPUT_SCHEMA,
    },
  });
  const structRes = await structModel.generateContent({
    contents: [{ role: "user", parts: [{ text: buildStructurePrompt(query, rawListings, cvContext) }] }],
  });

  // The schema guarantees JSON; we still defend with a try/catch in case
  // Gemini returns an empty / partial body.
  let parsed: { reasoning: string; jobs: { items: JobCard[] } };
  try {
    parsed = JSON.parse(structRes.response.text());
  } catch (err) {
    throw new Error(`Hunter: failed to parse structured response (${(err as Error).message})`);
  }

  const jobs: JobCard[] = (parsed.jobs?.items ?? []).map((j) => ({
    id: stableId(j.url || `${j.title}-${j.company}`),
    title: j.title,
    company: j.company,
    location: j.location ?? null,
    salary: j.salary ?? null,
    deadline: j.deadline ?? null,
    url: j.url,
    snippet: j.snippet,
    jobType: j.jobType,
    fitScore: Math.max(0, Math.min(100, Math.round(j.fitScore))),
    fitReason: j.fitReason,
    matchHighlights: j.matchHighlights ?? [],
    concerns: j.concerns ?? [],
  }));

  return {
    query,
    jobs,
    reasoning: parsed.reasoning ?? "Here are the closest matches I could find.",
    model: MODEL,
    retrievedAt: new Date().toISOString(),
  };
}

export { normalise as normaliseQuery };
