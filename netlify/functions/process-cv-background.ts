/**
 * Netlify Background Function: process-cv-background
 *
 * Filename
 * --------
 * The `-background` suffix is what Netlify looks for to
 * deploy this as a **background function** rather than a
 * synchronous Lambda. Background functions get a 15-minute
 * wall-clock budget on Netlify Pro (15s on the free plan,
 * but still well above the 10s sync default) and are NOT
 * awaited by the caller — the response is `202 Accepted`
 * with an empty body the moment the function is dispatched.
 *
 * Why we need this
 * ----------------
 * CV ingestion is a multi-step pipeline:
 *
 *     storage download -> parse (unpdf/mammoth) -> chunker
 *     -> Gemini batch-embed (5-10s alone) -> Supabase RPC
 *
 * For a typical 5-page CV it takes 15-30s end to end.
 * Netlify's *sync* function timeout is 10s (free) or 26s
 * (Pro). When that hits, the platform returns a
 * `502 FUNCTION_INVOCATION_TIMEOUT` with an EMPTY body —
 * the client saw that empty 5xx and reported
 * "Upload failed (500 no response body)", which hid the
 * real cause.
 *
 * On top of that, when the project-level Gemini quota is
 * exhausted mid-ingestion, `withBackoff` may need to wait
 * 60s+ for the window to refill. That can never fit inside
 * a 26s sync budget.
 *
 * By moving the slow work to a background function:
 *   - the synchronous upload route returns within ~2s
 *   - the real work happens out-of-band with a 15-min budget
 *   - the client polls the `cvs.status` row and sees it
 *     flip from "processing" -> "ready" / "failed" naturally
 *
 * Invocation
 * ----------
 * The upload route (`app/api/cv/upload/route.ts`) calls
 * this function fire-and-forget using a server-side
 * `fetch()` to `/.netlify/functions/process-cv-background`.
 * Netlify honours the `-background` suffix and runs this
 * as a background function regardless of how it's called.
 *
 * Request body: { cvId: string, userId: string }
 *
 * Security model
 * --------------
 * 1. The upload route is the ONLY public entry point and
 *    it has already verified Clerk auth + ownership
 *    before dispatching. The fetch from the route to this
 *    function happens server-to-server on Netlify and is
 *    not exposed to the public internet.
 * 2. We re-verify inside this function by loading the
 *    `cvs` row and comparing its `user_id` to the
 *    `userId` field in the payload. This is defense in
 *    depth, not a primary check.
 * 3. We use the Supabase service-role client (`supabaseAdmin`)
 *    which bypasses RLS. That's safe here because we just
 *    confirmed the user owns the row, and this function is
 *    never exposed without a payload that names a real
 *    `cvId` we own.
 *
 * Error handling
 * --------------
 * The underlying `runIngestion(cvId)` is already defensive:
 * it writes `status = 'failed'` and `error_message` to the
 * row before re-throwing. We catch here ONLY to log; we
 * always exit 2xx on the way out so Netlify doesn't flag
 * the background invocation as failed (the failure is
 * reflected in the row state, not the function exit code).
 */

import { runIngestion, type IngestionResult } from "../../lib/cv/ingester";
import { supabaseAdmin } from "../../lib/supabase/admin";

// ---------- Types ----------

interface InvokePayload {
  cvId: string;
  userId: string;
  setActive?: boolean;
}

interface CvOwnershipRow {
  id: string;
  user_id: string;
}

// ---------- Handler ----------

export default async (req: Request): Promise<Response> => {
  // Background functions can be invoked by GET (the Netlify
  // dashboard "Test" button) or POST (our upload route). We
  // accept both: for GET, return a 200 with a short status
  // message so manual invocation in the UI doesn't look
  // broken. For POST, do the real work.
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        ok: true,
        message: "process-cv-background is alive. POST { cvId, userId } to enqueue.",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  let payload: InvokePayload;
  try {
    payload = (await req.json()) as InvokePayload;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const { cvId, userId, setActive = true } = payload;
  if (!cvId || !userId) {
    return new Response(
      JSON.stringify({ error: "Missing cvId or userId." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  // Defense in depth: re-verify ownership before running
  // the ingester. The upload route already checked, but
  // this function is reachable in principle by anyone who
  // knows its URL, so we don't trust the payload alone.
  try {
    const { data, error } = await supabaseAdmin
      .from("cvs")
      .select("id, user_id")
      .eq("id", cvId)
      .single<CvOwnershipRow>();
    if (error || !data) {
      console.error(`[process-cv-background] cv ${cvId} not found: ${error?.message}`);
      return new Response(JSON.stringify({ error: "cv not found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    if (data.user_id !== userId) {
      console.error(
        `[process-cv-background] ownership mismatch for cv ${cvId}: payload=${userId}, row=${data.user_id}`,
      );
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { "content-type": "application/json" },
      });
    }
  } catch (err) {
    console.error(`[process-cv-background] ownership check threw:`, err);
    return new Response(JSON.stringify({ error: "ownership check failed" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  // Run the ingester. runIngestion writes status='failed'
  // and error_message to the row on any throw, so we don't
  // need to do error accounting here — we just need to
  // return 2xx so Netlify doesn't flag the background
  // invocation as failed.
  try {
    const result: IngestionResult = await runIngestion(cvId);
    console.log(
      `[process-cv-background] cv ${cvId} done: chunks=${result.chunksWritten}, tokens=${result.totalTokens}, durationMs=${result.durationMs}`,
    );

    // Flip the new CV to active on success. The partial
    // unique index `cvs_one_active_per_user` guarantees at
    // most one active row per user, so we first mark the
    // previous active (if any) inactive.
    if (setActive) {
      const { error: deactivateErr } = await supabaseAdmin
        .from("cvs")
        .update({ is_active: false })
        .eq("user_id", userId)
        .eq("is_active", true)
        .neq("id", cvId);
      if (deactivateErr) {
        console.error(
          `[process-cv-background] deactivate previous active for ${userId} failed: ${deactivateErr.message}`,
        );
      }
      const { error: activateErr } = await supabaseAdmin
        .from("cvs")
        .update({ is_active: true })
        .eq("id", cvId);
      if (activateErr) {
        console.error(
          `[process-cv-background] activate ${cvId} failed: ${activateErr.message}`,
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, cvId, chunksWritten: result.chunksWritten }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // The ingester already wrote the failure to the row.
    // Log here for observability but do NOT exit non-2xx:
    // the function "succeeded" in the sense that it ran
    // to completion and reported the real error into the DB.
    console.error(`[process-cv-background] cv ${cvId} ingest failed: ${msg}`);
    return new Response(
      JSON.stringify({ ok: false, cvId, error: msg }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }
};
