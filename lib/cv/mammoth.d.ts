/**
 * Minimal local type declaration for `mammoth`.
 *
 * `mammoth` does NOT ship its own `.d.ts` files and there is no
 * `@types/mammoth` package on npm, so importing it from a strict
 * TypeScript project fails on `Cannot find module 'mammoth'`. We
 * declare only the surface we use (`extractRawText`); if you need
 * the converter API, extend this file rather than pulling a
 * hand-maintained full shim.
 *
 * Why a local `.d.ts` and not `// @ts-ignore`:
 *   - Keeps the route's `mammoth.extractRawText({ buffer })` call
 *     type-checked.
 *   - Scoped to `lib/cv/` so it doesn't pollute the global type
 *     namespace.
 */
declare module "mammoth" {
  export interface ExtractRawTextOptions {
    buffer: Buffer | Uint8Array;
  }

  export interface ExtractRawTextResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  export function extractRawText(
    options: ExtractRawTextOptions,
  ): Promise<ExtractRawTextResult>;
}

/**
 * (Reserved for future asset-query type declarations.)
 *
 * The history of pdfjs worker resolution in `lib/cv/parse.ts`:
 *   1. `import workerUrl from "pdfjs-dist/.../pdf.worker.mjs?url"`
 *      - failed: "does not contain a default export" (it is a
 *        real ESM module, not an asset).
 *   2. `createRequire(import.meta.url).resolve(...)`
 *      - failed: webpack's `importESMExternals` plugin refuses
 *        the subpath because `pdfjs-dist` is ESM-only and the
 *        subpath is not in its `exports` field; at runtime
 *        webpack rewrites the call to a no-op `({}).resolve(...)`.
 *   3. `import.meta.resolve(...)`
 *      - failed: webpack rewrites it to `undefined(...)` and it
 *        throws at runtime.
 *   4. `new Function("return import.meta.resolve(...)")`
 *      - failed: Node 22+ no longer exposes `import.meta` in
 *        classic-script contexts (eval, Function constructor).
 *   5. (current) `path.join(process.cwd(), "node_modules", ...) +
 *       pathToFileURL(workerPath).href`
 *      - works: webpack's static analyzer cannot follow
 *        `process.cwd()`, so the literal subpath is hidden
 *        from the ESM-externals check, and at runtime the
 *        function's CWD is the project root where
 *        `node_modules/` lives.
 *
 * No asset-query types are needed here today. This block is
 * kept as a placeholder if the project later picks up `?url`,
 * `?raw`, `?worker`, etc.
 */
