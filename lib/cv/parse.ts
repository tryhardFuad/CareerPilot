import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Parse a CV file (PDF or DOCX) into raw plain text.
 *
 * - PDF:  `pdf-parse` v2 (the `PDFParse` class). We use this in
 *         preference to `unpdf`/`pdfjs` for one specific reason:
 *         pdf-parse preserves the line breaks that the PDF's text
 *         drawing operators emit, so headers like "Education" stay
 *         on their own line. `unpdf`'s `mergePages` join collapses
 *         those line breaks, which left the chunker with a single
 *         long string and no detectable section boundaries.
 *         (This module is `runtime = "nodejs"`, so the v2 class
 *         which uses pdfjs under the hood is fine - see
 *         `next.config.ts`.)
 * - DOCX: `mammoth.extractRawText` -> plain text. DOCX is a ZIP of
 *         XML, so the result is already UTF-8.
 *
 * Throws on:
 *   - Unknown extension
 *   - Malformed PDF/DOCX bytes
 *   - Empty buffer
 */

// pdf-parse v2 uses pdfjs-dist under the hood. In Node.js, pdfjs's
// fake-worker bootstrap tries to `import(this.workerSrc)` and throws
// "Setting up fake worker failed: Cannot find module
// './pdf.worker.mjs'" if workerSrc is left as its relative default -
// because in a Next.js server bundle there is no `pdf.worker.mjs`
// sitting next to the chunk. We need the absolute file:// URL of the
// installed worker.
//
// Why this is awkward: `pdfjs-dist` is an ESM-only package
// (`serverExternalPackages: ["pdf-parse", "pdfjs-dist"]` in
// `next.config.ts`), and the subpath `legacy/build/pdf.worker.mjs`
// is not declared in its `exports` field. That rules out:
//   - `import "pdfjs-dist/legacy/build/pdf.worker.mjs"` ->
//     "Module not found: ESM packages need to be imported" from
//     webpack's `importESMExternals` plugin.
//   - `import workerUrl from "...?url"` -> "does not contain a
//     default export" because the file is a real ESM module, not
//     an asset.
//   - `import.meta.resolve(...)` -> "Accessing import.meta
//     directly is unsupported"; webpack rewrites the call to
//     `undefined(...)` in the bundle and it throws at runtime.
//   - `new Function("return import.meta.resolve(...)")` -> classic-
//     script context, `import.meta` is undefined.
//   - `createRequire(import.meta.url).resolve(...)` -> same ESM-
//     externals error as the static `import`.
//
// What DOES work: build the absolute path at runtime with
// `path.join(process.cwd(), "node_modules", ...)` and convert to a
// `file://` URL. Webpack's static analyzer can't follow
// `process.cwd()` so it never flags the subpath. At runtime the
// function's CWD is the project root where `node_modules/` lives,
// so the path resolves correctly.
let workerConfigured = false;
function resolveWorkerUrl(): string {
  const workerPath = join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs",
  );
  return pathToFileURL(workerPath).href;
}

function ensureWorkerConfigured(): void {
  if (workerConfigured) return;
  PDFParse.setWorker(resolveWorkerUrl());
  workerConfigured = true;
}

export async function parseCv(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    ensureWorkerConfigured();
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }

  if (ext === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  throw new Error(`Unsupported file type: ${ext ?? "(none)"}`);
}