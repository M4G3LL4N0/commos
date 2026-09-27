import Link from "next/link";

const BLOCKS = [
  {
    name: "Connectors",
    tag: "Plane",
    desc: "BlueBubbles for iMessage, Twilio for SMS/voice, email, plus a console connector for local tests. Health checks before send.",
  },
  {
    name: "Policy engine",
    tag: "Core",
    desc: "Evaluates send policy, rate and spend limits, known recipients, and whether a message is allowed, needs approval, or is blocked.",
  },
  {
    name: "Signed webhooks",
    tag: "Infra",
    desc: "Outbound delivery with HMAC signing, retries, and dedupe. Inbound receipts normalized onto one event bus.",
  },
  {
    name: "REST API",
    tag: "Infra",
    desc: "Versioned v1 endpoints for projects, agents, identities, messages, and usage — a control plane, not a chat app.",
  },
  {
    name: "Ops kit",
    tag: "Ops",
    desc: "Migrations, seed, telemetry, and usage accounting so a self-hosted install can be inspected. Not a packaged SaaS.",
  },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/40">
            ◈
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-100">CommOS</span>
        </div>
        <a
          href="mailto:?subject=CommOS%20control-plane%20walkthrough&body=I%20want%20a%20walkthrough%20of%20the%20CommOS%20communications%20control%20plane."
          className="text-sm text-cyan-300 hover:text-cyan-200"
        >
          Request a walkthrough
        </a>
      </header>

      <main className="mt-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-cyan-400">
            Communications control plane
          </p>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-slate-50 sm:text-5xl">
            Every channel. <span className="bg-gradient-to-r from-cyan-300 to-emerald-300 bg-clip-text text-transparent">One policy core.</span>
          </h1>
          <p className="mt-5 text-lg leading-7 text-slate-400">
            CommOS is a self-hosted communications control plane: SMS, iMessage,
            email, and voice go through connectors, then a policy engine decides
            allow, approve, or block. It is infrastructure for builders — not a
            finished customer messaging product.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/setup"
              className="w-full rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 sm:w-auto"
            >
              Create a demo workspace
            </Link>
            <Link
              href="/docs/api"
              className="w-full rounded-xl border border-slate-700 bg-slate-800/40 px-5 py-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 sm:w-auto"
            >
              Read the API
            </Link>
          </div>
        </div>

        <div className="mt-20 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BLOCKS.map((b) => (
            <article
              key={b.name}
              className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-cyan-400">
                {b.tag}
              </span>
              <h2 className="mt-2 text-base font-semibold text-slate-100">{b.name}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-400">{b.desc}</p>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-16 max-w-2xl text-center text-sm leading-6 text-slate-500">
          CommOS is not a replacement for Slack, and it is not a hosted inbox
          for end customers. It is the routing and policy layer those products
          would sit on.
        </p>
      </main>

      <footer className="mt-24 border-t border-slate-800/60 pt-6 text-center text-xs text-slate-600">
        CommOS · self-hosted communications control plane · not a finished customer product
      </footer>
    </div>
  );
}
