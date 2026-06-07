// Smoke test for parse.ts worker fix (plain JS, no tsx).
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// 1) Show what the static import gives us (mirrors what the bundled
//    function will see after webpack preserves the require()).
let staticImportValue = "(threw)";
try {
  const mod = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  staticImportValue = "default=" + String(mod.default) + " keys=" + Object.keys(mod).join(",");
} catch (e) {
  staticImportValue = "THREW: " + e.message;
}
console.log("[1] static import of worker .mjs ->", staticImportValue);

// 2) Show what require.resolve gives us.
let resolved = null;
try {
  resolved = createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
  console.log("[2] require.resolve ->", resolved);
} catch (e) {
  console.log("[2] require.resolve THREW:", e.message);
}

// 3) Now actually parse a PDF using the require.resolve path
//    (this is what the createRequire trick in the original parse.ts
//    was doing) — proves the worker file is on disk and works.
if (!resolved) process.exit(1);

const { PDFParse } = await import("pdf-parse");
PDFParse.setWorker(pathToFileURL(resolved).href);

const file = process.argv[2] ?? "evals/demo_cvs/cv.pdf";
const buf = await readFile(resolve(root, file));
console.log(`[3] file=${file} bytes=${buf.length}`);

try {
  const t0 = Date.now();
  const parser = new PDFParse({ data: buf });
  const { text } = await parser.getText();
  await parser.destroy();
  console.log(`[3] OK in ${Date.now() - t0}ms, text length=${text.length}`);
  console.log("[3] first 200 chars:\n" + text.slice(0, 200));
} catch (e) {
  console.error("[3] FAIL:", e?.stack ?? e);
  process.exit(1);
}
