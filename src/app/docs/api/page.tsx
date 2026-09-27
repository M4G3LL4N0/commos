import Link from "next/link";

export const metadata = {
  title: "API — CommOS",
  description: "CommOS control-plane surface: projects, identities, messages, policies.",
};

export default function ApiDocsPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-xs uppercase tracking-[0.25em] text-cyan-400">Control plane</p>
      <h1 className="mt-4 text-3xl font-semibold text-slate-50">What the API is for</h1>
      <p className="mt-4 text-base leading-7 text-slate-400">
        The intended v1 surface covers projects, agents, identities, messages,
        and usage. Sends go through the policy engine (allow, approval, or
        block) and out a connector. This page is the public map of that plane —
        not a hosted API you can call without running CommOS yourself.
      </p>
      <ul className="mt-8 space-y-3 text-sm leading-6 text-slate-300">
        <li>Connectors: console (sim), BlueBubbles, Twilio, email</li>
        <li>Policy: rate limits, spend limits, known-recipient checks</li>
        <li>Webhooks: HMAC-signed outbound delivery, inbound receipts</li>
      </ul>
      <Link href="/" className="mt-8 inline-block text-sm text-cyan-300">
        Back to CommOS
      </Link>
    </div>
  );
}
