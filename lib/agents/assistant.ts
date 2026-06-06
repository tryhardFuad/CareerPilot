/**
 * Assistant agent — the intent router that powers Pillar 3.
 */

import { SchemaType, type Schema } from "@google/generative-ai";
import { chatComplete } from "@/lib/ai/provider";
import {
  scoreFitScore,
  type FitScoreResult as EngineFitScore,
  type ScoredSkill,
} from "@/lib/agents/fitScore";
import { BENCHMARKS, BENCHMARK_LIST, type RoleBenchmark } from "@/lib/data/benchmarks";
import { getOrSynthesiseBenchmark } from "@/lib/data/benchmarks/dynamic";

export type AssistantIntent =
  | "readiness"
  | "gap_analysis"
  | "roadmap"
  | "cover_letter"
  | "general";

export type AssistantTone = "professional" | "friendly" | "enthusiastic";

export interface AssistantInput {
  userId: string;
  message: string;
  history?: { role: "user" | "model"; content: string }[];
  intentHint?: AssistantIntent;
  hints?: {
    benchmarkKey?: string;
    role?: string;
    benchmark?: RoleBenchmark;
    weeks?: number;
    tone?: AssistantTone;
    company?: string;
  };
}

export interface FitScoreResult {
  band: "strong" | "moderate" | "weak";
  label: string;
  score: number;
}

export type StructuredPayload =
  | {
      kind: "readiness";
      benchmarkTitle: string;
      overall: FitScoreResult;
      summary: string;
      buckets: { id: string; label: string; score: FitScoreResult; rationale: string }[];
    }
  | {
      kind: "gap_analysis";
      benchmarkTitle: string;
      overall: FitScoreResult;
      summary: string;
      missing: { skill: string; priority: 1 | 2 | 3 | 4 | 5; reason: string; evidence?: string }[];
    }
  | {
      kind: "roadmap";
      benchmarkTitle: string;
      weeks: number;
      overall: FitScoreResult;
      summary: string;
      weeks_plan: { week: number; focus: string; tasks: string[] }[];
    }
  | {
      kind: "cover_letter";
      benchmarkTitle: string;
      company?: string;
      tone: AssistantTone;
      summary: string;
      body: string;
    };

export type AssistantResponse =
  | {
      mode: "readiness";
      message: string;
      fitScore: EngineFitScore;
      structured: Extract<StructuredPayload, { kind: "readiness" }>;
    }
  | {
      mode: "gap_analysis";
      message: string;
      fitScore: EngineFitScore;
      structured: Extract<StructuredPayload, { kind: "gap_analysis" }>;
    }
  | {
      mode: "roadmap";
      message: string;
      fitScore: EngineFitScore;
      weeks: number;
      structured: Extract<StructuredPayload, { kind: "roadmap" }>;
    }
  | {
      mode: "cover_letter";
      message: string;
      fitScore: EngineFitScore;
      tone: AssistantTone;
      company?: string;
      structured: Extract<StructuredPayload, { kind: "cover_letter" }>;
    }
  | {
      mode: "general";
      message: string;
      citations: { id: string; source: string; text: string; score: number }[];
    };

function bandFromVerdict(verdict: EngineFitScore["verdict"]): FitScoreResult["band"] {
  if (verdict === "strong" || verdict === "good") return "strong";
  if (verdict === "borderline") return "moderate";
  return "weak";
}

function labelFromVerdict(verdict: EngineFitScore["verdict"], score: number): string {
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(verdict)} · ${score}/100`;
}

function projectOverall(fit: EngineFitScore): FitScoreResult {
  return {
    band: bandFromVerdict(fit.verdict),
    label: labelFromVerdict(fit.verdict, fit.score),
    score: fit.score,
  };
}

const CLASSIFY_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    intent: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["readiness", "gap_analysis", "roadmap", "cover_letter", "general"],
      description: "Classify the user's message into one of the five assistant modes.",
    },
    benchmarkKey: {
      type: SchemaType.STRING,
      description:
        "If the user names a role, return its benchmark key. If none match, return ''.",
    },
    weeks: {
      type: SchemaType.INTEGER,
      description: "For roadmap mode, weeks requested. Default 6.",
    },
    tone: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["professional", "friendly", "enthusiastic"],
      description: "Cover-letter tone. Default professional.",
    },
    company: {
      type: SchemaType.STRING,
      description: "Cover-letter company if mentioned.",
    },
  },
  required: ["intent"],
};

const BENCHMARK_HINT = BENCHMARK_LIST.map(
  (b) => `- ${b.key}: ${b.title} — ${b.summary}`,
).join("\n");

async function classifyIntent(
  message: string,
): Promise<{
  intent: AssistantIntent;
  benchmarkKey?: string;
  weeks?: number;
  tone?: AssistantTone;
  company?: string;
}> {
  const prompt =
    `Classify this message into one of the assistant modes.\n` +
    `Benchmarks available:\n${BENCHMARK_HINT}\n\n` +
    `User: ${message}\n`;
  try {
    const raw = await chatComplete([{ role: "user", parts: prompt }], {
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
        responseSchema: CLASSIFY_SCHEMA,
      },
    });
    const parsed = JSON.parse(raw) as {
      intent: AssistantIntent;
      benchmarkKey?: string;
      weeks?: number;
      tone?: AssistantTone;
      company?: string;
    };
    const benchmarkKey =
      parsed.benchmarkKey && BENCHMARKS[parsed.benchmarkKey]
        ? parsed.benchmarkKey
        : undefined;
    return {
      intent: parsed.intent ?? "general",
      ...(benchmarkKey ? { benchmarkKey } : {}),
      weeks:
        typeof parsed.weeks === "number"
          ? Math.max(1, Math.min(52, parsed.weeks))
          : undefined,
      tone: parsed.tone,
      company: parsed.company?.trim() || undefined,
    };
  } catch {
    return { intent: "general" };
  }
}

function pickBenchmarkKey(
  hint: AssistantInput["hints"] | undefined,
  classified: string | undefined,
): string | undefined {
  if (hint?.benchmarkKey && BENCHMARKS[hint.benchmarkKey]) return hint.benchmarkKey;
  if (classified && BENCHMARKS[classified]) return classified;
  return undefined;
}

async function resolveBenchmark(
  userId: string,
  hints: AssistantInput["hints"] | undefined,
  classifiedKey: string | undefined,
): Promise<RoleBenchmark | null> {
  if (hints?.benchmark) return hints.benchmark;
  const key = pickBenchmarkKey(hints, classifiedKey);
  if (key) return BENCHMARKS[key] ?? null;
  if (hints?.role && hints.role.trim().length > 0) {
    try {
      return await getOrSynthesiseBenchmark(userId, hints.role);
    } catch (err) {
      console.warn("[assistant] dynamic benchmark synthesis failed", err);
      return null;
    }
  }
  return null;
}

function summariseFitScore(fit: EngineFitScore): string {
  const matched = fit.matched.map((m) => m.skill.label).join(", ") || "none";
  const missing = fit.missing.map((m) => m.skill.label).join(", ") || "none";
  return [
    `Score: ${fit.score}/100 (${fit.verdict})`,
    `Strengths: ${matched}`,
    `Gaps: ${missing}`,
    `Experience: ${fit.experience.inferredYears}y vs ${fit.experience.requiredYears}y required`,
    `Rationale: ${fit.rationale}`,
  ].join("\n");
}

const READINESS_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    verdict: {
      type: SchemaType.STRING,
      format: "enum",
      enum: ["ready_now", "ready_in_weeks", "not_yet"],
    },
    weeksToReady: { type: SchemaType.INTEGER },
    headline: { type: SchemaType.STRING },
    nextAction: { type: SchemaType.STRING },
    buckets: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          id: { type: SchemaType.STRING },
          label: { type: SchemaType.STRING },
          verdict: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["strong", "good", "borderline", "weak"],
          },
          rationale: { type: SchemaType.STRING },
        },
        required: ["id", "label", "verdict", "rationale"],
      },
    },
  },
  required: ["verdict", "headline", "nextAction", "buckets"],
};

async function runReadiness(
  userId: string,
  benchmark: RoleBenchmark,
  message: string,
): Promise<AssistantResponse & { mode: "readiness" }> {
  const fit = await scoreFitScore({ userId, benchmark });
  const raw = await chatComplete(
    [
      {
        role: "user",
        parts:
          `The user asks: "${message}"\n\n` +
          `Role: ${benchmark.title} (${benchmark.summary})\n` +
          `Fit-score summary:\n${summariseFitScore(fit)}`,
      },
    ],
    {
      tier: "quality",
      systemInstruction:
        "You are a sharp, action-oriented career coach. " +
        "Be honest about readiness. Use the fit-score data verbatim where helpful. " +
        "If the user is not yet ready, name the top blocker and a concrete next step. " +
        "Return only the JSON described in the schema.",
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 700,
        responseMimeType: "application/json",
        responseSchema: READINESS_SCHEMA,
      },
    },
  );
  const parsed = JSON.parse(raw) as {
    verdict: "ready_now" | "ready_in_weeks" | "not_yet";
    weeksToReady?: number;
    headline: string;
    nextAction: string;
    buckets: {
      id: string;
      label: string;
      verdict: EngineFitScore["verdict"];
      rationale: string;
    }[];
  };
  const overall = projectOverall(fit);
  const messageText =
    `**${parsed.headline}**\n\n` +
    `Verdict: ${parsed.verdict.replace("_", " ")}` +
    (parsed.weeksToReady ? ` · ~${parsed.weeksToReady} weeks to ready` : "") +
    `\n\n**Next action:** ${parsed.nextAction}`;
  const buckets = (parsed.buckets ?? []).map((b) => {
    const score: number =
      b.verdict === "strong" ? 90 : b.verdict === "good" ? 75 : b.verdict === "borderline" ? 55 : 30;
    return {
      id: b.id,
      label: b.label,
      score: {
        band: bandFromVerdict(b.verdict),
        label: labelFromVerdict(b.verdict, score),
        score,
      } satisfies FitScoreResult,
      rationale: b.rationale,
    };
  });
  const structured: Extract<StructuredPayload, { kind: "readiness" }> = {
    kind: "readiness",
    benchmarkTitle: benchmark.title,
    overall,
    summary: messageText,
    buckets,
  };
  return { mode: "readiness", message: messageText, fitScore: fit, structured };
}

const GAP_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    summary: { type: SchemaType.STRING },
    topGaps: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          skill: { type: SchemaType.STRING },
          priority: { type: SchemaType.INTEGER },
          reason: { type: SchemaType.STRING },
          evidence: { type: SchemaType.STRING },
        },
        required: ["skill", "priority", "reason"],
      },
    },
  },
  required: ["summary", "topGaps"],
};

async function runGapAnalysis(
  userId: string,
  benchmark: RoleBenchmark,
  message: string,
): Promise<AssistantResponse & { mode: "gap_analysis" }> {
  const fit = await scoreFitScore({ userId, benchmark });
  const raw = await chatComplete(
    [
      {
        role: "user",
        parts:
          `The user asks: "${message}"\n\n` +
          `Role: ${benchmark.title} (${benchmark.summary})\n` +
          `Fit-score summary:\n${summariseFitScore(fit)}\n\n` +
          `Focus on the missing must-have skills. Return JSON.`,
      },
    ],
    {
      tier: "quality",
      systemInstruction:
        "You are a pragmatic career coach. " +
        "Identify the top 3-5 skills the user must close to become competitive. " +
        "For each gap, give it a priority 1-5 (1 = most important) and one-sentence reason. " +
        "If the user has evidence of being close, include a short 'evidence' string. " +
        "Return only the JSON described in the schema.",
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 700,
        responseMimeType: "application/json",
        responseSchema: GAP_SCHEMA,
      },
    },
  );
  const parsed = JSON.parse(raw) as {
    summary: string;
    topGaps: { skill: string; priority: number; reason: string; evidence?: string }[];
  };
  const overall = projectOverall(fit);
  const missing: Extract<StructuredPayload, { kind: "gap_analysis" }>["missing"] = (
    parsed.topGaps ?? []
  ).map((g) => ({
    skill: g.skill,
    priority: Math.max(1, Math.min(5, Math.round(g.priority))) as 1 | 2 | 3 | 4 | 5,
    reason: g.reason,
    ...(g.evidence ? { evidence: g.evidence } : {}),
  }));
  const text =
    `**${parsed.summary}**\n\n` +
    `**Top gaps to close:**\n` +
    missing.map((m, i) => `${i + 1}. ${m.skill}`).join("\n") +
    `\n\n*Fit score: ${fit.score}/100 — ${fit.verdict}*`;
  const structured: Extract<StructuredPayload, { kind: "gap_analysis" }> = {
    kind: "gap_analysis",
    benchmarkTitle: benchmark.title,
    overall,
    summary: parsed.summary,
    missing,
  };
  return { mode: "gap_analysis", message: text, fitScore: fit, structured };
}

const ROADMAP_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    overview: { type: SchemaType.STRING },
    weeks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          week: { type: SchemaType.INTEGER },
          theme: { type: SchemaType.STRING },
          deliverables: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
          hours: { type: SchemaType.INTEGER },
        },
        required: ["week", "theme", "deliverables", "hours"],
      },
    },
  },
  required: ["overview", "weeks"],
};

async function runRoadmap(
  userId: string,
  benchmark: RoleBenchmark,
  weeks: number,
  message: string,
): Promise<AssistantResponse & { mode: "roadmap" }> {
  const fit = await scoreFitScore({ userId, benchmark });
  const raw = await chatComplete(
    [
      {
        role: "user",
        parts:
          `The user asks: "${message}"\n\n` +
          `Role: ${benchmark.title}\n` +
          `Plan length: ${weeks} weeks\n` +
          `Missing must-haves: ${fit.missing.map((m: ScoredSkill) => m.skill.label).join(", ")}\n` +
          `Existing strengths: ${fit.matched.map((m: ScoredSkill) => m.skill.label).join(", ")}\n\n` +
          `Build a ${weeks}-week plan that closes the top gaps first, then layers on nice-to-haves.`,
      },
    ],
    {
      tier: "quality",
      systemInstruction:
        "You are a focused learning-path designer. " +
        "Front-load the highest-impact skills from the gap list. " +
        "Each week must have a clear theme, 2-3 concrete deliverables " +
        "(a project, a course module, a portfolio piece), and a realistic " +
        "weekly hours target (5-15). Return JSON.",
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 1400,
        responseMimeType: "application/json",
        responseSchema: ROADMAP_SCHEMA,
      },
    },
  );
  const parsed = JSON.parse(raw) as {
    overview: string;
    weeks: { week: number; theme: string; deliverables: string[]; hours: number }[];
  };
  const overall = projectOverall(fit);
  const weeks_plan: Extract<StructuredPayload, { kind: "roadmap" }>["weeks_plan"] = (
    parsed.weeks ?? []
  ).map((w) => ({
    week: w.week,
    focus: w.theme,
    tasks: (w.deliverables ?? []).slice(0, 3),
  }));
  const summary = parsed.overview;
  const text =
    `**${parsed.overview}**\n\n` +
    parsed.weeks
      .map(
        (w) =>
          `**Week ${w.week} — ${w.theme}** (${w.hours}h)\n` +
          w.deliverables.map((d) => `  - ${d}`).join("\n"),
      )
      .join("\n\n") +
    `\n\n*Target role: ${benchmark.title} · Starting fit: ${fit.score}/100*`;
  const structured: Extract<StructuredPayload, { kind: "roadmap" }> = {
    kind: "roadmap",
    benchmarkTitle: benchmark.title,
    weeks,
    overall,
    summary,
    weeks_plan,
  };
  return { mode: "roadmap", message: text, fitScore: fit, weeks, structured };
}

const COVER_LETTER_SCHEMA: Schema = {
  type: SchemaType.OBJECT,
  properties: {
    subject: { type: SchemaType.STRING },
    body: { type: SchemaType.STRING },
  },
  required: ["subject", "body"],
};

async function runCoverLetter(
  userId: string,
  benchmark: RoleBenchmark,
  tone: AssistantTone,
  company: string | undefined,
  message: string,
): Promise<AssistantResponse & { mode: "cover_letter" }> {
  const fit = await scoreFitScore({ userId, benchmark });
  const companyLine = company ? `Target company: ${company}\n` : "";
  const WORD_TARGET = 320;
  const raw = await chatComplete(
    [
      {
        role: "user",
        parts:
          `The user asks: "${message}"\n\n` +
          `Role: ${benchmark.title} (${benchmark.summary})\n` +
          `${companyLine}` +
          `Tone: ${tone}\n` +
          `Strengths to lead with: ${fit.matched.slice(0, 5).map((m) => m.skill.label).join(", ")}\n` +
          `Experience: ${fit.experience.inferredYears}y\n` +
          `Rationale: ${fit.rationale}\n\n` +
          `Write a ${tone} cover letter, exactly ~${WORD_TARGET} words (range 280-340). ` +
          `Open with a specific, non-generic hook tied to the role or company. ` +
          `Lead with the user's top strengths. Do NOT mention the fit score. ` +
          `End with a confident, specific sign-off.`,
      },
    ],
    {
      tier: "quality",
      systemInstruction:
        "You write cover letters that don't sound like cover letters. " +
        "Avoid clichés. Use the user's strengths as concrete evidence. " +
        `Hit approximately ${WORD_TARGET} words. Finish every sentence — never stop mid-thought.`,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1200,
        responseMimeType: "application/json",
        responseSchema: COVER_LETTER_SCHEMA,
      },
    },
  );
  const parsed = JSON.parse(raw) as { subject: string; body: string };
  const body = parsed.body?.trim() ?? "";
  const endsCleanly = /[.!?\"]\s*$/.test(body);
  const warning = endsCleanly
    ? ""
    : "\n\n*(This draft may be truncated. Click Run again to regenerate.)*";
  const overall = projectOverall(fit);
  const summary = `Tailored ${tone} cover letter for the ${benchmark.title} role${
    company ? ` at ${company}` : ""
  }.`;
  const text = `**Subject:** ${parsed.subject}\n\n${body}${warning}`;
  const structured: Extract<StructuredPayload, { kind: "cover_letter" }> = {
    kind: "cover_letter",
    benchmarkTitle: benchmark.title,
    ...(company ? { company } : {}),
    tone,
    summary,
    body,
  };
  return {
    mode: "cover_letter",
    message: text,
    fitScore: fit,
    tone,
    ...(company ? { company } : {}),
    structured,
  };
}

async function runGeneralChat(
  userId: string,
  message: string,
  history: AssistantInput["history"],
  retrieveCvChunks: (
    userId: string,
    query: string,
  ) => Promise<{ id: string; source: string; text: string; score: number }[]>,
): Promise<AssistantResponse & { mode: "general" }> {
  const citations = await retrieveCvChunks(userId, message);
  const ctxLines = citations.map((c) => `[${c.id}] ${c.source}: ${c.text}`).join("\n\n");
  const messages = [
    ...(history ?? []).map((h) => ({ role: h.role, parts: h.content })),
    {
      role: "user" as const,
      parts:
        (ctxLines ? `CV context:\n${ctxLines}\n\n` : "") +
        `User: ${message}\n\n` +
        "Reply in 200 words or fewer. Cite CV chunks as [chunk-id] where relevant.",
    },
  ];
  const reply = await chatComplete(messages, {
    systemInstruction:
      "You are a sharp, action-oriented career coach. " +
      "Stay under 200 words unless the user explicitly asks for detail. " +
      "Cite CV chunks inline as [chunk-id].",
    generationConfig: { temperature: 0.6, maxOutputTokens: 600 },
  });
  return { mode: "general", message: reply, citations };
}

type SpecialisedIntent = Exclude<AssistantIntent, "general">;

export async function runAssistant(
  input: AssistantInput,
  retrieveCvChunks: (
    userId: string,
    query: string,
  ) => Promise<{ id: string; source: string; text: string; score: number }[]>,
): Promise<AssistantResponse> {
  const { userId, message, history, intentHint, hints } = input;

  let intent: AssistantIntent = intentHint ?? "general";
  let classifiedKey: string | undefined;
  let weeks: number = hints?.weeks ?? 6;
  const tone: AssistantTone = hints?.tone ?? "professional";
  let company: string | undefined = hints?.company;

  if (!intentHint) {
    const classified = await classifyIntent(message);
    intent = classified.intent;
    classifiedKey = classified.benchmarkKey;
    if (classified.weeks) weeks = classified.weeks;
    if (classified.company) company = classified.company;
  }

  if (intent === "general") {
    return runGeneralChat(userId, message, history, retrieveCvChunks);
  }

  const benchmark = await resolveBenchmark(userId, hints, classifiedKey);
  if (!benchmark) {
    return runGeneralChat(userId, message, history, retrieveCvChunks);
  }

  const specialised: SpecialisedIntent = intent;
  switch (specialised) {
    case "roadmap":
      return runRoadmap(userId, benchmark, weeks, message);
    case "gap_analysis":
      return runGapAnalysis(userId, benchmark, message);
    case "cover_letter":
      return runCoverLetter(userId, benchmark, tone, company, message);
    case "readiness":
      return runReadiness(userId, benchmark, message);
  }
}
