import { getDb } from "./index";
import { PROVIDER_CATALOG, providerEntry } from "@/lib/connectors/registry";
import {
  projectsRepo,
  agentsRepo,
  identitiesRepo,
  contactsRepo,
  conversationsRepo,
  messagesRepo,
  usageRepo,
  costRepo,
  policiesRepo,
  routingRulesRepo,
  emitEvent,
} from "./repositories";
import { id, now } from "@/lib/utils/ids";

/**
 * Seed the provider registry. Idempotent and safe to run on every boot —
 * provider metadata is static product infrastructure, not user data.
 */
export function seedProviders() {
  const db = getDb();
  const ts = now();
  const stmt = db.prepare("INSERT OR IGNORE INTO providers (id, slug, name, description, category, channels, capabilities, marketplace_json, status, docs_url, sort_order, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  const tx = db.prepare("BEGIN");
  tx.run();
  try {
    for (const p of PROVIDER_CATALOG) {
      stmt.run(
        id("prv"),
        p.slug,
        p.name,
        p.description,
        p.category,
        JSON.stringify(p.channels),
        JSON.stringify(p.capabilities),
        JSON.stringify({
          icon: p.icon,
          setupSteps: p.setupSteps ?? [],
          supportsTestMode: p.status === "builtin",
        }),
        p.status,
        p.docsUrl ?? null,
        p.sortOrder,
        ts,
        ts
      );
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Seed base namespaces + default safety policies (idempotent). */
export function seedBase() {
  seedProviders();
  const commos = projectsRepo.upsert({
    slug: "commos",
    name: "CommOS",
    organization: "TRILLIONX",
    description: "System project for the communications operating plane",
  });
  if (policiesRepo.effective(null, null).length === 0) {
    // Default safety: no unapproved bulk sends, no cold outreach without a
    // recipient allowlist entry. Projects/agents can add permissive policies.
    policiesRepo.insert({
      projectId: commos.id,
      kind: "approval_required",
      channel: null,
      pattern: "recipient:new",
      value: "1",
      scope: "default",
    });
    policiesRepo.insert({
      kind: "blocklist",
      channel: "voice",
      pattern: "*",
      value: "paused",
      scope: "no voice without explicit policy",
    });
  }
  return commos;
}

/**
 * Demo seed — clearly-labeled sample data so a fresh install is explorable.
 * All demo rows carry source/simulation markers. Safe to run repeatedly.
 */
export function seedDemo() {
  seedBase();
  const tsPattern = Date.now();

  // Demo project + agent
  const revenue = projectsRepo.upsert({
    slug: "revenueos",
    name: "RevenueOS",
    organization: "TRILLIONX",
    description: "Revenue operations demo project",
  });
  const agent = agentsRepo.upsert({
    projectId: revenue.id,
    slug: "revenue-agent",
    name: "Revenue Agent",
    description: "Prospecting and follow-up agent (demo)",
    metadata: { demo: true },
  });

  // Demo identities (dynamic addresses on a demo domain)
  identitiesRepo.upsert({
    type: "email",
    value: "sales@revenueos.example",
    projectId: revenue.id,
    agentId: agent.id,
    label: "Sales mailbox",
    purpose: "inbound",
    routing: { project: revenue.slug, agent: agent.slug, conversationPrefix: "sales" },
    metadata: { demo: true },
  });
  identitiesRepo.upsert({
    type: "phone",
    value: "+15550100100",
    projectId: revenue.id,
    agentId: agent.id,
    label: "RevenueOS line",
    providerSlug: "twilio",
    purpose: "outbound",
    metadata: { demo: true },
  });
  const leadAddr = identitiesRepo.upsert({
    type: "email",
    value: "lead-7f92@revenueos.example",
    projectId: revenue.id,
    agentId: agent.id,
    label: "Dynamic lead address",
    purpose: "inbound",
    routing: { project: revenue.slug, agent: agent.slug, conversationPrefix: "lead-7f92" },
    metadata: { demo: true, dynamic: true },
  });

  // Demo contact + unified conversation
  const alex = contactsRepo.ensureByMethod("email", "alex.rivera@examplecorp.com", {
    name: "Alex Rivera",
    source: "demo",
  });
  contactsRepo.addMethod(alex, { type: "phone", value: "+15550100200", label: "Mobile", isPrimary: true });
  contactsRepo.addMethod(alex, { type: "imessage", value: "alex.rivera@icloud.example", label: "iMessage" });
  contactsRepo.update(alex.id, {
    name: "Alex Rivera",
    organization: "ExampleCorp",
    tags: ["prospect", "demo"],
    consentStatus: "marketing-opt-in",
    notes: "Demo contact seeded by `commos db seed`.",
  });

  const conv = conversationsRepo.ensure({
    contactId: alex.id,
    projectId: revenue.id,
    agentId: agent.id,
    topic: "Partnership discussion",
    metadata: { demo: true },
  });

  // Demo thread across channels
  const mk = (
    channel: string,
    direction: "inbound" | "outbound",
    body: string,
    fromValue: string,
    toValue: string,
    ageMin: number,
    status = "received"
  ) => {
    const m = messagesRepo.insert({
      id: id("msg"),
      conversationId: conv.id,
      projectId: revenue.id,
      agentId: agent.id,
      channel: channel as never,
      direction,
      fromValue,
      toValue,
      contactId: alex.id,
      body,
      status: status as never,
      createdAt: tsPattern - ageMin * 60_000,
    });
    messagesRepo.attachMessageEvent(m.id, `message.${status}`, status, channel);
    return m;
  };

  mk("imessage", "inbound", "Hey — following up on the exchange model you mentioned.", "alex.rivera@icloud.example", "sales@revenueos.example", 118, "received");
  mk("imessage", "outbound", "Great timing — want to walk through the partnership mechanics this week?", "sales@revenueos.example", "alex.rivera@icloud.example", 112, "sent");
  mk("email", "inbound", "Yes. Sending over our volume numbers now — should be in your inbox.", "alex.rivera@examplecorp.com", "lead-7f92@revenueos.example", 60, "received");
  mk("sms", "outbound", "Received — I'll have the proposal drafted by Friday.", "+15550100100", "+15550100200", 30, "delivered");

  // Demo usage + cost (labeled "demo", no real provider spend)
    const u = usageRepo.record({
      projectId: revenue.id,
      agentId: agent.id,
      channel: "sms",
      actionType: "send",
      providerSlug: "twilio",
      unit: "message",
    });
    if (!u) throw new Error("Failed to seed demo usage record");
    costRepo.record({
    usageRecordId: u.id,
    projectId: revenue.id,
    providerSlug: "twilio",
    channel: "sms",
    pricingStatus: "unavailable",
    note: "demo seed — no real provider spend",
  });

  // Demo routing rule — inbound lead addresses route to the revenue agent
  routingRulesRepo.insert({
    matchType: "prefix",
    matchValue: "lead-",
    targetIdentityId: leadAddr.id,
    targetAgentId: agent.id,
    targetProjectId: revenue.id,
    priority: 100,
  });

  emitEvent({
    type: "system.demo_seeded",
    projectId: revenue.id,
    payload: { note: "Demo data seeded" },
  });
  return { revenue, agent, alex, conv };
}

export function hasDemoData(): boolean {
  return contactsRepo.count() > 0;
}