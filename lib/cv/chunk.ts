/**
 * CV chunker — turns a parsed CV into the chunks the RAG layer
 * embeds and stores in `cv_chunks`.
 *
 * Design
 * ------
 *  - Section-aware: we never split a chunk across two sections. The DB
 *    `cv_chunks` index is `(cv_id, section, ordinality)`, so cross-
 *    section splits would force a synthetic section. Cleaner to keep
 *    splits within a section.
 *  - Per-section chunks: the consumer (fit-score agent, job hunter,
 *    chat assistant) retrieves by section, so one chunk per section
 *    gives the cleanest "Education is here, Skills are there" layout.
 *  - Sub-splitting for long sections: a single Experience block can
 *    easily run 2-4k tokens. We sub-split when a section exceeds
 *    `TARGET_WORDS` (default 700) words, with `OVERLAP_WORDS` (default
 *    80) of overlap between adjacent sub-chunks to preserve context
 *    across the split boundary.
 *  - The section heading is prepended to each sub-chunk's `content`
 *    so the embedding captures the topic even if the sub-chunk is a
 *    fragment. The richer `section_label` (heading + first
 *    distinguishing line) and `breadcrumb` (CV name + label) are
 *    surfaced by the UI for human context.
 *  - Hard cap: we never let a chunk exceed `HARD_CAP_WORDS` (default
 *    1500) regardless of the soft split, as a safety net.
 *  - Tokenizer: simple whitespace split. Gemini's embedding endpoint
 *    doesn't expose a tokenizer; 700 words ≈ 1k tokens which fits the
 *    `gemini-embedding-2` input limit with plenty of headroom.
 *  - Filter: chunks under 30 chars are dropped (likely whitespace,
 *    a stray section header, or an OCR artifact).
 *  - Stable chunk id: every chunk is assigned a logical id of the
 *    form `${slug}#${n}` where `slug` is the canonical section
 *    slug (e.g. `edu`, `exp`, `header`) and `n` is the ordinal of
 *    that section within the document. Two CVs with the same
 *    structure will produce the same ids in the same order, which
 *    makes diffing and re-ingest idempotency tractable.
 *  - Contact / header block: the very first non-empty block of a
 *    CV (name, email, phone, LinkedIn, GitHub, location) is
 *    detected and split off as a `header` chunk. This prevents it
 *    from being mis-bucketed into `experience` when the first
 *    real heading happens to be `EXPERIENCE` close to the contact
 *    line.
 *
 * Output
 * ------
 *  `CvChunk[]` matches the column shape of `cv_chunks` minus the
 *  `id`, `embedding`, and `created_at` columns (the ingester fills
 *  those at insert time).
 */

export interface CvChunk {
  /** Stable logical id, e.g. "edu#1", "exp#2", "header#1". */
  id: string;
  /** Canonical section enum. */
  section: string; // header | summary | experience | education | ...
  /** Human label, e.g. "Education > RV College of Engineering (B.E. 2024)". */
  section_label: string;
  /** Full breadcrumb for the UI, e.g. "marcus_elliso > Education (1/2)". */
  breadcrumb: string;
  /** Text to embed. Always starts with the section heading on its own line. */
  content: string;
  /** Position across the whole document (0-based). */
  ordinality: number;
  /** Whitespace-separated words, for the inspector UI. */
  token_count: number;
}

interface RawSection {
  section: string;
  sectionLabel: string; // the heading line itself, if any
  body: string; // remaining content under that heading
  /** Ordinal of this raw section within its kind (1-based). */
  ordinalInKind: number;
  /** The canonical slug used for chunk ids. */
  slug: string;
}

interface ChunkOptions {
  /** CV name used in the breadcrumb. Optional. */
  cvName?: string;
}

// ---------- Section detection ----------

interface SectionRule {
  pattern: RegExp;
  section: string; // canonical section name
  slug: string; // short slug for chunk ids
}

const SECTION_RULES: SectionRule[] = [
  { pattern: /^professional experience/i, section: "experience", slug: "exp" },
  { pattern: /^work experience/i,        section: "experience", slug: "exp" },
  { pattern: /^research experience/i,    section: "experience", slug: "exp" },
  { pattern: /^teaching experience/i,    section: "experience", slug: "exp" },
  { pattern: /^experience/i,             section: "experience", slug: "exp" },
  { pattern: /^internship/i,             section: "experience", slug: "exp" },
  { pattern: /^education/i,              section: "education",  slug: "edu" },
  { pattern: /^skills/i,                 section: "technical_skills", slug: "skills" },
  { pattern: /^technical skills/i,       section: "technical_skills", slug: "skills" },
  { pattern: /^projects/i,               section: "projects",   slug: "proj" },
  { pattern: /^publications/i,           section: "publications", slug: "pub" },
  { pattern: /^patents/i,                section: "publications", slug: "pub" },
  { pattern: /^publications and patents/i, section: "publications", slug: "pub" },
  { pattern: /^scholastic achievements/i, section: "awards",    slug: "awards" },
  { pattern: /^achievements/i,           section: "awards",     slug: "awards" },
  { pattern: /^awards/i,                 section: "awards",     slug: "awards" },
  { pattern: /^certifications/i,         section: "certifications", slug: "cert" },
  { pattern: /^positions of responsibility/i, section: "other", slug: "other" },
  { pattern: /^extra curricular/i,       section: "other",      slug: "other" },
  { pattern: /^courses/i,                section: "other",      slug: "other" },
  { pattern: /^summary/i,                section: "summary",    slug: "summary" },
  { pattern: /^objective/i,              section: "summary",    slug: "summary" },
  { pattern: /^languages/i,              section: "technical_skills", slug: "skills" },
];

const SUMMARY_SECTION = "summary";
const SUMMARY_SLUG = "summary";
const HEADER_SECTION = "header";
const HEADER_SLUG = "header";

/**
 * Walk the lines of the parsed CV and bucket them into sections.
 * The first block (everything before the first recognised heading)
 * is split off: if it looks like a contact-info block, it becomes
 * a `header` section; otherwise it stays a `summary` section.
 */
function splitIntoRawSections(rawText: string): RawSection[] {
  const lines = rawText.split(/\r?\n/);
  const out: RawSection[] = [];
  // Provisional first section; we'll reclassify it to `header` if it
  // matches the contact-info heuristic below.
  const first: RawSection = {
    section: SUMMARY_SECTION,
    sectionLabel: "",
    body: "",
    ordinalInKind: 1,
    slug: SUMMARY_SLUG,
  };
  let current: RawSection = first;
  out.push(current);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Preserve blank lines as paragraph breaks inside the current
      // section; the sub-splitter collapses them.
      current.body = current.body ? current.body + "\n" : current.body;
      continue;
    }
    const matched =
      trimmed.length < 60
        ? SECTION_RULES.find((r) => r.pattern.test(trimmed))
        : undefined;

    if (matched) {
      current = {
        section: matched.section,
        sectionLabel: trimmed,
        body: "",
        ordinalInKind: out.filter((s) => s.section === matched.section).length + 1,
        slug: matched.slug,
      };
      out.push(current);
    } else {
      current.body = current.body ? current.body + "\n" + line : line;
    }
  }

  // Reclassify the first section if it looks like a contact block.
  if (first === out[0] && looksLikeContactBlock(first.body)) {
    first.section = HEADER_SECTION;
    first.slug = HEADER_SLUG;
    // Derive a friendly label from the first non-empty line of the
    // block (typically the candidate's name).
    const firstLine = first.body.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
    first.sectionLabel = firstLine ? `${firstLine} (contact)` : "Contact";
  }

  return out;
}

// ---------- Contact / header detection ----------

/**
 * Heuristics for the contact-info block at the top of a CV:
 *  - contains an `@` (email)
 *  - contains a phone-shaped token (`+<digits>` or 10+ digits)
 *  - contains a `linkedin.com/`, `github.com/`, or `behance.net/` URL
 *  - is short (≤ 6 non-empty lines) and not a sentence
 *
 * The block is required to be small and at the top of the document
 * (we only call this on the first raw section, so the position
 * check is implicit).
 */
function looksLikeContactBlock(body: string): boolean {
  if (!body || !body.trim()) return false;
  const nonEmptyLines = body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (nonEmptyLines.length === 0 || nonEmptyLines.length > 6) return false;

  const joined = nonEmptyLines.join(" | ");
  const hasEmail = /@/.test(joined);
  const hasPhone = /(\+\d{1,3}[\s-]?\d|\b\d{10,}\b)/.test(joined);
  const hasUrl =
    /(linkedin\.com|github\.com|behance\.net|dribbble\.com|gitlab\.com)\//i.test(joined);
  return hasEmail || hasPhone || hasUrl;
}

// ---------- Inline header recovery ----------

/**
 * When a PDF comes out of the parser as one continuous string (the
 * common case with `pdf-parse` on multi-column or text-as-shape PDFs),
 * the per-line section detector in `splitIntoRawSections` never fires
 * — every "line" is a 5000-char blob. We work around this by scanning
 * the raw text for the same header words we'd accept as standalone
 * headings, and inserting a paragraph break (`\n\n`) before each
 * match. The downstream splitter then sees them as their own short
 * lines and buckets them correctly.
 *
 * Constraints:
 *   - We only split on header *words* that are *already* canonical
 *     section headers (the regex set below is the same vocabulary as
 *     `SECTION_RULES`). This means we don't invent sections; we just
 *     give the existing detector something to grab onto.
 *   - We require a word boundary on the left, so "Achievements"
 *     inside a bullet point like "Received 3 achievements awards" is
 *     NOT promoted to a heading.
 *   - Case-insensitive.
 *   - The header must be followed by a non-letter character (or end
 *     of string) so we don't split inside e.g. "Educational" — which
 *     is a real concern because a summary paragraph can easily
 *     contain the word "education" mid-sentence.
 *   - **New**: the header must be preceded by a paragraph break
 *     (string start, `\n\n`, or `\n> ` for bulleted lists). This
 *     prevents mid-paragraph splits that used to leak contact-info
 *     lines into the `experience` bucket.
 */
export function splitInlineHeaders(rawText: string): string {
  // Header vocabulary mirrors `SECTION_RULES`. Order matters only
  // for the *longest-match wins* property: we put multi-word headers
  // first so "Professional Experience" is preferred over either
  // word alone. The `\b` left boundary prevents "Pre-Professional
  // Experience" from being split on the inner "Professional".
  const inlineHeaders: readonly { pattern: string; canonical: string }[] = [
    { pattern: "Professional Experience", canonical: "Professional Experience" },
    { pattern: "Work Experience",         canonical: "Work Experience" },
    { pattern: "Research Experience",     canonical: "Research Experience" },
    { pattern: "Teaching Experience",     canonical: "Teaching Experience" },
    { pattern: "Technical Skills",        canonical: "Technical Skills" },
    { pattern: "Positions of Responsibility", canonical: "Positions of Responsibility" },
    { pattern: "Extra Curricular Activities", canonical: "Extra Curricular Activities" },
    { pattern: "Publications and Patents", canonical: "Publications and Patents" },
    { pattern: "Scholastic Achievements",  canonical: "Scholastic Achievements" },
    { pattern: "Education",                canonical: "Education" },
    { pattern: "Experience",               canonical: "Experience" },
    { pattern: "Internship",               canonical: "Internship" },
    { pattern: "Projects",                 canonical: "Projects" },
    { pattern: "Publications",             canonical: "Publications" },
    { pattern: "Patents",                  canonical: "Patents" },
    { pattern: "Achievements",             canonical: "Achievements" },
    { pattern: "Certifications",           canonical: "Certifications" },
    { pattern: "Skills",                   canonical: "Skills" },
    { pattern: "Courses",                  canonical: "Courses" },
    { pattern: "Summary",                  canonical: "Summary" },
    { pattern: "Objective",                canonical: "Objective" },
    { pattern: "Languages",                canonical: "Languages" },
  ];

  let out = rawText;
  for (const { pattern } of inlineHeaders) {
    // Escape regex metachars in the pattern.
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Left boundary: start-of-string OR `\n\n` (paragraph break) OR
    // `\n` followed by a list marker. Right boundary: not followed
    // by another letter or hyphen-letter (so "Educational" doesn't
    // split on "Education").
    const re = new RegExp(
      `(?:^|(?:\\r?\\n){2,})\\s*(?:[-*•]\\s+)?${escaped}\\b(?![A-Za-z-])`,
      "gi",
    );
    out = out.replace(re, (m) => `\n\n${pattern}\n\n`);
  }
  // Collapse 3+ consecutive newlines into exactly two (one blank
  // line between sections), so downstream word counts aren't inflated
  // by padding.
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

// ---------- Sub-splitting ----------

const TARGET_WORDS = 700;
const OVERLAP_WORDS = 80;
const HARD_CAP_WORDS = 1500;
const MIN_CONTENT_CHARS = 30;

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Split a section's body into 1..N sub-chunks, each at most
 * TARGET_WORDS words, with OVERLAP_WORDS of overlap between adjacent
 * sub-chunks. If the body is short, returns one chunk. Hard cap
 * protects against pathological input.
 */
function subSplitBody(body: string): string[] {
  const words = body.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= TARGET_WORDS) return [body.trim()];

  const chunks: string[] = [];
  let start = 0;
  // Safety: hard-cap loop guard. If overlap >= target we still make
  // progress because start advances by (target - overlap).
  let guard = 0;
  while (start < words.length && guard < 1000) {
    guard++;
    const end = Math.min(words.length, start + TARGET_WORDS);
    const slice = words.slice(start, end).join(" ");
    chunks.push(slice);

    if (end >= words.length) break;
    // Advance with overlap. Make sure we always move forward.
    const advance = Math.max(1, TARGET_WORDS - OVERLAP_WORDS);
    start += advance;
    // Hard cap: if a single slice somehow grew past HARD_CAP_WORDS
    // (shouldn't happen with TARGET_WORDS), break the loop.
    if (end - start > HARD_CAP_WORDS) break;
  }
  return chunks;
}

// ---------- Label enrichment ----------

/**
 * Build a richer `section_label` from the section's body by taking
 * the first non-empty, non-bullet line. This is the line that
 * typically identifies the section's sub-unit (e.g. "B.E. Computer
 * Science, RV College of Engineering (2020-2024)" under an
 * `Education` heading, or "Senior Engineer, Acme Corp (2022-2024)"
 * under `Experience`).
 *
 * Falls back to the raw heading if no clean line is found.
 */
function enrichSectionLabel(raw: RawSection): string {
  const heading = raw.sectionLabel || humanizeSection(raw.section);
  if (!raw.body || !raw.body.trim()) return heading;

  const firstLine = raw.body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !/^[-*•·]/.test(l));

  if (!firstLine) return heading;
  if (firstLine.toLowerCase() === heading.toLowerCase()) return heading;
  // Cap the distinguishing line at 80 chars so the label stays
  // single-line in the UI.
  const trimmed = firstLine.length > 80 ? firstLine.slice(0, 77) + "…" : firstLine;
  return `${heading} > ${trimmed}`;
}

function humanizeSection(section: string): string {
  return section
    .split("_")
    .map((w) => (w && w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function cvNameForBreadcrumb(cvName: string | undefined): string {
  if (!cvName) return "";
  // Strip path + extension for cleanliness.
  const base = cvName.split(/[\\/]/).pop() ?? cvName;
  return base.replace(/\.(pdf|docx|doc)$/i, "");
}

// ---------- Public API ----------

/**
 * Chunk a parsed CV into per-section chunks, sub-splitting long
 * sections with overlap. The output is suitable for direct insertion
 * into `cv_chunks` after embedding.
 *
 * @param rawText  Parsed CV text (output of `parseCv`).
 * @param options  Optional: pass `cvName` to populate the per-chunk
 *                 `breadcrumb`. The CV's name (or filename) is what
 *                 the user sees in the CV management list.
 */
export function chunkCv(rawText: string, options: ChunkOptions = {}): CvChunk[] {
  if (!rawText || !rawText.trim()) return [];

  // Pre-pass: if the PDF parser returned a single blob with no line
  // breaks, splice in paragraph breaks before any known header word
  // so the line-based section detector has something to grab onto.
  // This is a no-op for DOCX and for PDFs that already preserved
  // structure (the boundary checks mean we won't re-insert on lines
  // that are already correctly broken).
  const preprocessed = splitInlineHeaders(rawText);

  const rawSections = splitIntoRawSections(preprocessed);
  const out: CvChunk[] = [];
  let ordinality = 0;
  const cvName = cvNameForBreadcrumb(options.cvName);

  for (const raw of rawSections) {
    const body = raw.body.trim();
    if (!body || body.length < MIN_CONTENT_CHARS) continue;

    const subBodies = subSplitBody(body);
    if (subBodies.length === 0) continue;

    const total = subBodies.length;
    const baseLabel = enrichSectionLabel(raw);

    subBodies.forEach((subContent, i) => {
      // For sub-split chunks, the per-chunk label keeps the same
      // first-line disambiguator and adds an "(i/N)" suffix so two
      // education chunks are visually distinct even when their
      // first lines are similar.
      const label = total > 1 ? `${baseLabel} (${i + 1}/${total})` : baseLabel;
      const breadcrumb = cvName
        ? `${cvName} > ${total > 1 ? `${humanizeSection(raw.section)} (${i + 1}/${total})` : baseLabel}`
        : label;
      // Prepend the section heading to the content so the embedded
      // text and the displayed text both reflect the topic, even
      // when the sub-chunk is a fragment.
      const headingLine = raw.sectionLabel || humanizeSection(raw.section);
      const content = `${headingLine}\n${subContent}`;
      out.push({
        id: `${raw.slug}#${raw.ordinalInKind}`,
        section: raw.section,
        section_label: label,
        breadcrumb,
        content,
        ordinality,
        token_count: wordCount(content),
      });
      ordinality++;
    });
  }

  return out;
}
