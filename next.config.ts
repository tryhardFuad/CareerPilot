import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  // `pdf-parse` v2 wraps `pdfjs-dist`, which in Node tries to
  // dynamic-import a worker file at runtime. If Turbopack bundles
  // these, the relative `./pdf.worker.mjs` path that pdfjs defaults
  // to no longer points anywhere real, and you get
  //   "Setting up fake worker failed: Cannot find module
  //    './pdf.worker.mjs'"
  // at the first PDF parse. `lib/cv/parse.ts` overrides `workerSrc`
  // to a `file://` URL of the installed worker, but we still need
  // Turbopack to leave the packages alone so that override wins.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  // Vercel's output trace is the source of truth for which files end
  // up in the deployed function bundle. The pdfjs legacy worker is
  // referenced at runtime via `createRequire(...).resolve(...)`, so
  // the static graph doesn't see it; without this include, Vercel
  // prunes `pdfjs-dist/legacy/build/pdf.worker.mjs` and the first
  // PDF parse fails with "Cannot find module './pdf.worker.mjs'".
  // Glob is relative to the repo root.
  outputFileTracingIncludes: {
    "/api/cv/upload": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
};

export default nextConfig;
