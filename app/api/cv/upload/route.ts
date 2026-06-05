/**
 * POST /api/cv/upload
 *
 * Upload a CV file (PDF or DOCX), persist it to Supabase
 * Storage, and DISPATCH the ingester to a Netlify background
 * function. The route returns within ~2s with the new CV id
 * in `processing` state; the heavy lifting (parse + chunk +
 * embed) happens out-of-band with a 15-minute budget. The
 * client polls the CV row and sees the status flip to
 * `ready` (then flips to `is_active=true`) or `failed`
 * naturally.
 *
 * Why a background function
 * -------------------------
 * The synchronous CV ingestion pipeline routinely takes
 * 15-30s for a typical CV (storage download + unpdf parse +
 * chunker + Gemini batch-embed 5-10s alone + Supabase RPC).
 * Netlify's *sync* function ceiling is 10s (free) / 26s (Pro)
 * — when that hits the platform returns
 * `502 FUNCTION_INVOCATION_TIMEOUT` with an EMPTY body. The
 * client saw that empty 5xx as
 * "Upload failed (500 no response body)" — confusing.
 *
 * On top of that, when the project-level Gemini quota is
 * exhausted mid-ingestion, `withBackoff` may need to wait
 * 60s+ for the window to refill. That can never fit inside
 * a 26s sync budget.
 *
 * Moving the work to a background function (15-min budget)
 * eliminates both problems.
 *
 * Body: multipart/form-data with a `file` field. Optional
 *       `setActive: "true" | "false"` (default true).
 *
 * Response (200):
 *   { cv: CvSummary, dispatched: true }
 *
 * Response (4xx):
 *   { error: string, code: "no_file" | "bad_mime" | "too_big" | "dispatch_failed" }
 *
 * Auth: Clerk (requireUserId).
 * Runtime: nodejs — the parser uses Buffer and pdf-parse needs
 *          Node, not the Edge runtime.
 */

import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { sniffMime } from "@/lib/cv/parser";

export const runtime = "nodejs";
export const maxDuration = 10; // seconds; only validate + store + dispatch
// 10s is plenty now: we only validate + store + dispatch the
// background function. The slow work (parse + embed) runs in
// `netlify/functions/process-cv-background.ts` with a 15-min
// budget.

// ---------- Limits ----------

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

// ---------- Types ----------

interface CvSummary {
  id: string;
  status: string;
  is_active: boolean;
  version: number;
}

// ---------- Route ----------

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (r) {
    return r as Response;
  }

  // Outer safety net: any unhandled throw inside the upload
  // pipeline (transitive module-init failure on the serverless
  // function, missing env var, Supabase/Gemini outage, etc.)
  // used to bubble up as Next.js's default 500 HTML page, which
  // the client tried to `res.json()` and surfaced as
  // `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
  // Catch it here, log the real cause, and return a parseable
  // JSON 500 so the client can show a useful error and the
  // function logs get the actual stack trace.
  try {
    return await handleUpload(req, userId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/cv/upload] unhandled:", err);
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json(
      {
        error: message,
        code: "upload_failed",
        ...(process.env.NODE_ENV !== "production" ? { stack } : {}),
      },
      { status: 500 },
    );
  }
}

async function handleUpload(req: Request, userId: string) {
  // 1. Parse multipart.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart/form-data.", code: "bad_form" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Missing 'file' field.", code: "no_file" },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "Uploaded file is empty.", code: "empty_file" },
      { status: 400 },
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; max is 20 MB.`,
        code: "too_big",
      },
      { status: 413 },
    );
  }

  // 2. Validate mime. The browser's content-type is NOT
  //    trustworthy; we sniff the bytes.
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(buf);
  if (!mime || !ALLOWED_MIMES.has(mime)) {
    return NextResponse.json(
      { error: "Only PDF and DOCX files are supported.", code: "bad_mime" },
      { status: 415 },
    );
  }
  const ext = EXT_BY_MIME[mime] ?? "bin";

  // 3. Compute storage path. Per-user folder keeps the bucket
  //    tidy and lets us list a user's files cheaply.
  //    The CV id is generated up front so we can upload before
  //    we insert the row (avoids a race where the upload
  //    succeeds but the insert fails, leaving an orphan).
  const cvId = crypto.randomUUID();
  const storagePath = `${userId}/${cvId}.${ext}`;

  // 4. Upload to storage.
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("cvs")
    .upload(storagePath, buf, {
      contentType: mime,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}`, code: "storage_failed" },
      { status: 500 },
    );
  }

  // 5. Insert the cvs row in `processing` state and NOT
  //    active. We flip active=true at the end on success;
  //    a failed upload leaves the previous active CV intact.
  //    The partial unique index `cvs_one_active_per_user`
  //    means at most one active row per user — a new
  //    inactive row is fine.
  // Strip the extension from the original filename so the list view
  // shows "John_Doe_Resume" instead of "John_Doe_Resume.pdf".
  const defaultName = file.name.replace(/\.[^./]+$/, "").slice(0, 200) || null;

  const { data: cvRow, error: insertErr } = await supabaseAdmin
    .from("cvs")
    .insert({
      id: cvId,
      user_id: userId,
      file_url: storagePath,
      source: "upload",
      status: "processing",
      is_active: false,
      name: defaultName,
    })
    .select("id, status, is_active, version, name")
    .single();
  if (insertErr || !cvRow) {
    // Roll back the storage upload so we don't leak orphan files.
    await supabaseAdmin.storage.from("cvs").remove([storagePath]);
    return NextResponse.json(
      { error: `DB insert failed: ${insertErr?.message ?? "unknown"}`, code: "db_failed" },
      { status: 500 },
    );
  }

  // 6. Dispatch the ingester to the Netlify background
  //    function. This is fire-and-forget: we don't await
  //    the actual ingestion result (15-30s typical, up to
  //    several minutes if the project-level Gemini quota
  //    forces 60s+ backoff). The route returns within ~2s.
  //
  //    The background function:
  //      - re-verifies ownership
  //      - runs runIngestion(cvId) (parse + chunk + embed)
  //      - flips is_active=true on success when setActive=true
  //      - writes status='failed' + error_message on any throw
  //
  //    The client polls the cvs row to see the status flip.
  const setActive = (form.get("setActive") ?? "true") === "true";
  const origin = new URL(req.url).origin;
  const bgUrl = `${origin}/.netlify/functions/process-cv-background`;
  try {
    // Fire-and-forget: do NOT await. We log a dispatch error
    // for observability, but we don't fail the upload just
    // because the background dispatch itself hit a network
    // blip — the cvs row is in the DB and can be retried
    // manually from the dashboard.
    void fetch(bgUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cvId, userId, setActive }),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(`[api/cv/upload] background dispatch failed for ${cvId}:`, err);
      // Best-effort: mark the row failed so the user can
      // see something went wrong and retry. If even THIS
      // update fails, the row stays in `processing` and
      // the user can hit "retry" from the dashboard.
      void supabaseAdmin
        .from("cvs")
        .update({
          status: "failed",
          error_message: `Background dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
        })
        .eq("id", cvId);
    });
  } catch (err) {
    // Synchronous throw from `fetch` itself (e.g. invalid
    // URL on local dev where `/.netlify/functions/...` may
    // not resolve). Same handling as above.
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[api/cv/upload] background dispatch threw for ${cvId}:`, msg);
    void supabaseAdmin
      .from("cvs")
      .update({ status: "failed", error_message: `Background dispatch failed: ${msg}` })
      .eq("id", cvId);
  }

  // 7. Return immediately with the new row in `processing`
  //    state. The client polls this row to learn the
  //    outcome; a successful ingestion flips status to
  //    `ready` and (if requested) is_active to true.
  return NextResponse.json(
    {
      cv: cvRow as CvSummary,
      dispatched: true,
      pollUrl: `/api/cv/${cvId}`,
    },
    { status: 202 },
  );
}
