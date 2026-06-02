import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

export default function SignInPlaceholder() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-secondary-100 bg-white p-8 text-center shadow-card">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary text-white">
          <Sparkles className="h-5 w-5" />
        </span>
        <h1 className="font-heading mt-4 text-2xl font-bold">Welcome back</h1>
        <p className="mt-2 text-sm text-secondary-500">
          Sign-in is wired to Clerk. Add your publishable key to{" "}
          <code className="rounded bg-secondary-50 px-1.5 py-0.5 text-xs">
            .env.local
          </code>{" "}
          to activate the full flow.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>
      </div>
    </main>
  );
}
