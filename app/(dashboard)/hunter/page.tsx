import { Search, MapPin, Briefcase, ExternalLink } from "lucide-react";

const sampleJobs = [
  {
    title: "Senior Full-Stack Engineer",
    company: "Pathao",
    location: "Bangalore (Hybrid)",
    type: "Full-time",
    snippet:
      "Own end-to-end product features across our super-app stack (Node, React, Go).",
  },
  {
    title: "Product Engineer, Fintech",
    company: "bKash",
    location: "Singapore (On-site)",
    type: "Full-time",
    snippet:
      "Build payment rails used by 50M+ users. Strong TypeScript + Postgres preferred.",
  },
  {
    title: "Founding Engineer",
    company: "CareerPilot Labs",
    location: "Remote",
    type: "Contract",
    snippet:
      "0→1 builder for internal tools. Ship in days, not weeks. Equity + cash.",
  },
];

export default function HunterPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight md:text-3xl">
          Hunt jobs, automatically.
        </h1>
        <p className="mt-1 text-sm text-secondary-500">
          The agent searches live boards and returns structured matches.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-2xl border border-secondary-100 bg-white p-2 shadow-card">
        <Search className="ml-3 h-4 w-4 text-secondary-400" />
        <input
          type="search"
          placeholder="e.g. senior product engineer, fintech, remote"
          className="flex-1 bg-transparent px-1 py-2 text-sm outline-none placeholder:text-secondary-400"
        />
        <button
          type="button"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-600"
        >
          Hunt
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sampleJobs.map((job) => (
          <article
            key={job.title}
            className="rounded-2xl border border-secondary-100 bg-white p-5 shadow-card transition hover:shadow-cardHover"
          >
            <h3 className="font-heading text-base font-semibold leading-snug">
              {job.title}
            </h3>
            <p className="mt-1 text-sm font-medium text-secondary-700">
              {job.company}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-secondary-500">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2 py-0.5">
                <MapPin className="h-3 w-3" />
                {job.location}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary-50 px-2 py-0.5">
                <Briefcase className="h-3 w-3" />
                {job.type}
              </span>
            </div>
            <p className="mt-3 text-sm text-secondary-600">{job.snippet}</p>
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-600"
            >
              View &amp; apply
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
