import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Sparkles, Users, Target } from "lucide-react";

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="container-wide flex items-center justify-between py-6">
        <Link href="/" className="font-heading text-lg font-bold text-secondary">
          CareerPilot
        </Link>
        <Link
          href={"/sign-up" as Route}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white shadow-card transition hover:bg-primary-600"
        >
          Get Started
          <ArrowRight className="h-4 w-4" />
        </Link>
      </header>

      <section className="container-wide pt-12 pb-16 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-heading text-balance text-4xl font-extrabold tracking-tight md:text-5xl">
            We&apos;re building the autopilot for the Dhaka job hunt.
          </h1>
          <p className="text-pretty mt-6 text-lg text-secondary-500">
            CareerPilot exists so the next generation of Dhaka founders and
            operators can spend less time searching and more time building.
          </p>
        </div>
      </section>

      <section className="container-wide grid grid-cols-1 gap-4 pb-24 md:grid-cols-3">
        {[
          {
            icon: Sparkles,
            title: "AI-first",
            body: "Every workflow is grounded in your real CV, not generic templates.",
          },
          {
            icon: Users,
            title: "Community-built",
            body: "Designed with the Dhaka founders ecosystem — by job seekers, for job seekers.",
          },
          {
            icon: Target,
            title: "Outcome-driven",
            body: "We measure success in offers received, not features shipped.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <article
            key={title}
            className="rounded-2xl border border-secondary-100 bg-white p-6 shadow-card"
          >
            <span className="inline-grid h-10 w-10 place-items-center rounded-lg bg-primary-50 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="font-heading mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-secondary-500">{body}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
