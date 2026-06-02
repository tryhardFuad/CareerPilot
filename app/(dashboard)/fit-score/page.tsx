import { Gauge as GaugeIcon } from "lucide-react";

export default function FitScorePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Fit Score, explained.
        </h1>
        <p className="mt-1 text-sm text-secondary-500">
          Paste a job description. Get a transparent match percentage.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-secondary-100 bg-white p-5 shadow-card">
          <label
            htmlFor="jd"
            className="text-xs font-semibold uppercase tracking-wider text-secondary-400"
          >
            Job description
          </label>
          <textarea
            id="jd"
            rows={12}
            placeholder="Paste the role requirements here…"
            className="mt-2 w-full resize-none rounded-lg border border-secondary-100 bg-secondary-50/40 p-3 text-sm outline-none focus:border-primary focus:bg-white"
          />
          <button
            type="button"
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-primary-600"
          >
            <GaugeIcon className="h-4 w-4" />
            Compute fit
          </button>
        </div>

        <div className="rounded-2xl border border-secondary-100 bg-white p-5 shadow-card">
          <h2 className="font-heading text-lg font-semibold">Result</h2>
          <p className="mt-1 text-sm text-secondary-500">
            Run a fit score to see the breakdown here.
          </p>
        </div>
      </div>
    </div>
  );
}
