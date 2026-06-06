// CareerPilot — bookmark a JobCard from a hunt result.
//
//   POST /api/hunt/save  { job: JobCard }  → 200 { id, alreadySaved }

import { NextResponse, type NextRequest } from "next/server";
import { requireUserId } from "@/lib/auth/require-user";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { JobCard } from "@/lib/agents/hunter";

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch (r) {
    return r as Response;
  }

  let body: { job?: JobCard };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const job = body.job;
  if (!job || !job.url || !job.title || !job.company) {
    return NextResponse.json({ error: "Missing required job fields" }, { status: 400 });
  }

  const sb = supabaseAdmin;
  const { data, error } = await sb
    .from("hunter_saved")
    .upsert(
      {
        user_id: userId,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        deadline: job.deadline,
        job_type: job.jobType,
        snippet: job.snippet,
        fit_score: job.fitScore,
        fit_reason: job.fitReason,
      },
      { onConflict: "user_id,url" }
    )
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data?.id, alreadySaved: true });
}
