import Link from "next/link";
import type { Route } from "next";
import { Check, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const plans: ReadonlyArray<{
  name: string;
  price: string;
  cadence: string;
  description: string;
  features: readonly string[];
  cta: string;
  href: Route;
  highlight: boolean;
}> = [
  {
    name: "Free",
    price: "$0",
    cadence: "forever",
    description: "Test the autopilot on a handful of roles.",
    features: [
      "1 CV upload",
      "10 AI job searches / month",
      "Basic fit score",
      "Kanban tracker",
    ],
    cta: "Get Started",
    href: "/sign-up" as Route,
    highlight: false,
  },
  {
    name: "Pilot",
    price: "$19",
    cadence: "/month",
    description: "For active job seekers ready to move fast.",
    features: [
      "Unlimited CV versions",
      "Unlimited job searches",
      "Detailed fit-score breakdown",
      "RAG assistant with memory",
      "Calendar & to-do sync",
    ],
    cta: "Get Started",
    href: "/sign-up" as Route,
    highlight: true,
  },
  {
    name: "Founder",
    price: "$49",
    cadence: "/month",
    description: "Hire faster with a full hiring co-pilot.",
    features: [
      "Everything in Pilot",
      "Team workspaces",
      "Custom job board integrations",
      "Priority agent runtime",
      "Dedicated success manager",
    ],
    cta: "Talk to sales",
    href: "/sign-up" as Route,
    highlight: false,
  },
];

export default function PricingPage() {
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

      <section className="container-wide pt-12 pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="font-heading text-balance text-4xl font-extrabold tracking-tight md:text-5xl">
            Pricing that scales with your hunt.
          </h1>
          <p className="text-pretty mt-4 text-secondary-500">
            Start free. Upgrade when you&apos;re ready to put the search on
            autopilot.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-3">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={cn(
                "rounded-2xl border bg-white p-6 shadow-card",
                plan.highlight
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-secondary-100",
              )}
            >
              {plan.highlight && (
                <span className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  Most popular
                </span>
              )}
              <h2 className="font-heading mt-2 text-xl font-bold">{plan.name}</h2>
              <p className="mt-1 text-sm text-secondary-500">{plan.description}</p>
              <p className="font-heading mt-4 text-4xl font-extrabold">
                {plan.price}
                <span className="text-base font-medium text-secondary-500">
                  {plan.cadence}
                </span>
              </p>
              <ul className="mt-6 space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <span className="text-secondary-600">{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={plan.href}
                className={cn(
                  "mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
                  plan.highlight
                    ? "bg-primary text-white hover:bg-primary-600"
                    : "border border-secondary-200 text-secondary hover:border-primary hover:text-primary",
                )}
              >
                {plan.cta}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
