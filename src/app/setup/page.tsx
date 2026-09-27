import Link from "next/link";

export const metadata = {
  title: "Create a demo workspace — CommOS",
  description: "First-run setup for the CommOS communications control plane.",
};

export default function SetupPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Demo workspace</p>
      <h1 className="mt-4 text-3xl font-semibold text-slate-50">
        Stand up a local control plane
      </h1>
      <p className="mt-4 text-base leading-7 text-slate-400">
        CommOS does not host workspaces for you. A demo workspace is a local
        install: migrate the database, seed providers, then open this app. First
        run asks for an operator password unless <code>COMMOS_OPERATOR_PASSWORD</code> is set.
      </p>
      <ol className="mt-8 space-y-4 text-sm leading-6 text-slate-300">
        <li>
          <code className="rounded bg-slate-800 px-2 py-1">pnpm install</code>
        </li>
        <li>
          <code className="rounded bg-slate-800 px-2 py-1">pnpm db:migrate</code> then{" "}
          <code className="rounded bg-slate-800 px-2 py-1">pnpm db:seed</code>
        </li>
        <li>
          <code className="rounded bg-slate-800 px-2 py-1">pnpm dev</code> — connectors
          register on bootstrap (console, BlueBubbles, Twilio, email).
        </li>
      </ol>
      <p className="mt-8 text-sm text-slate-500">
        This is a control-plane setup path, not a customer signup.
      </p>
      <Link href="/" className="mt-8 inline-block text-sm text-cyan-300">
        Back to CommOS
      </Link>
    </div>
  );
}
