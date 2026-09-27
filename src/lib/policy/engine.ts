import type { Channel, MessageDirection, Policy, PolicyDecision } from "@/types/models";
import { policiesRepo, usageRepo, costRepo, conversationsRepo, messagesRepo, contactsRepo } from "@/lib/db/repositories";
import { now } from "@/lib/utils/ids";
import { normalizeValue } from "@/lib/utils/phone";
import { auditRepo } from "@/lib/db/repositories";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export interface PolicyContext {
  projectId: string | null;
  agentId: string | null;
  channel: Channel;
  direction: MessageDirection;
  to: string;
  from?: string | null;
  bulk?: boolean;
}

export interface PolicyEvaluation extends PolicyDecision {
  rateLimited: boolean;
  spendLimited: boolean;
  details: Array<{ policy: Policy; action: "allowed" | "required_approval" | "blocked" }>;
}

function patternToRegExp(pattern: string): RegExp {
  let p = pattern;
  if (p === "*") return /.*/;
  if (!p.includes("*") && !p.includes("?")) {
    return new RegExp(`^${escapeRegExp(p)}$`);
  }
  const re = p
    .split("*")
    .map((s) => escapeRegExp(s))
    .join(".*");
  return new RegExp(`^${re}$`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function matchesPattern(pattern: string | null, value: string | null | undefined): boolean {
  if (!pattern || value == null) return false;
  try {
    return patternToRegExp(pattern).test(value);
  } catch {
    return false;
  }
}

/** Does this recipient have prior two-way history with the project? */
function isKnownRecipient(projectId: string | null, channel: Channel, to: string): boolean {
  const contact = contactsRepo.getByMethod(channel as never, normalizeValue(channel, to));
  if (!contact) return false;
  const conv = conversationsRepo.findForContact(contact.id, projectId);
  if (!conv) return false;
  const sent = messagesRepo.list({ conversationId: conv.id, direction: "outbound", limit: 1 });
  return sent.length > 0;
}

export function evaluateSend(ctx: PolicyContext): PolicyEvaluation {
  const decision: PolicyEvaluation = {
    allowed: true,
    requiresApproval: false,
    reasons: [],
    blocked: [],
    approvalId: null,
    rateLimited: false,
    spendLimited: false,
    details: [],
  };

  const policies = policiesRepo.effective(ctx.projectId, ctx.agentId);

  // Permission (deny-by-default): if any 'permission' policy applies to this
  // scope, the channel must be listed or '*'.
  const permissions = policies.filter((p) => p.kind === "permission" && (!p.channel || p.channel === ctx.channel));
  if (permissions.length > 0) {
    const grants = permissions.flatMap((p) =>
      (p.value ?? "").split(",").map((v) => v.trim())
    );
    if (!grants.includes("*") && !grants.includes(ctx.channel)) {
      decision.allowed = false;
      decision.blocked.push(`channel '${ctx.channel}' not permitted for this agent/project scope`);
      decision.details.push({
        policy: permissions[0],
        action: "blocked",
      });
    } else {
      decision.details.push({ policy: permissions[0], action: "allowed" });
    }
  }

  // Blocklist
  for (const p of policies.filter((p) => p.kind === "blocklist" && (!p.channel || p.channel === ctx.channel))) {
    if (matchesPattern(p.pattern, ctx.to)) {
      decision.allowed = false;
      decision.blocked.push(`recipient blocked by policy (pattern '${p.pattern}')`);
      decision.details.push({ policy: p, action: "blocked" });
    }
  }

  // Allowlist (outbound)
  const allowlists = policies.filter(
    (p) =>
      p.kind === "allowlist" &&
      p.direction === "outbound" &&
      (!p.channel || p.channel === ctx.channel)
  );
  if (allowlists.length > 0 && ctx.direction === "outbound") {
    const matched = allowlists.some((p) => matchesPattern(p.pattern, ctx.to));
    if (!matched) {
      decision.allowed = false;
      decision.blocked.push(`recipient not on outbound allowlist`);
      decision.details.push({ policy: allowlists[0], action: "blocked" });
    }
  }

  // Approval-required
  for (const p of policies.filter((p) => p.kind === "approval_required")) {
    const trigger = p.value ?? "";
    const channelTrigger = trigger === ctx.channel || trigger === "*";
    const newRecipientTrigger = trigger === "recipient:new" && !isKnownRecipient(ctx.projectId, ctx.channel, ctx.to);
    const bulkTrigger = trigger === "bulk" && ctx.bulk === true;
    const voiceTrigger = trigger === "voice" && ctx.channel === "voice";
    if (channelTrigger || newRecipientTrigger || bulkTrigger || voiceTrigger) {
      if (!decision.requiresApproval) {
        decision.requiresApproval = true;
        decision.reasons.push(describeApprovalTrigger(trigger, p));
      }
      decision.details.push({ policy: p, action: "required_approval" });
    }
  }

  // Rate limits
  for (const p of policies.filter((p) => p.kind === "rate_limit" && (!p.channel || p.channel === ctx.channel))) {
    const limit = Number(p.value ?? "0");
    if (limit <= 0) continue;
    const unit = p.unit ?? "hour";
    const windowMs = unit === "day" ? DAY : unit === "month" ? 30 * DAY : HOUR;
    const since = now() - windowMs;
    const used = usageRepo.countSince(ctx.channel, since, {
      projectId: ctx.projectId,
      agentId: ctx.agentId,
    });
    if (used >= limit) {
      decision.allowed = false;
      decision.rateLimited = true;
      decision.blocked.push(`rate limit exceeded: ${used}/${limit} ${unit} for '${ctx.channel}'`);
      decision.details.push({ policy: p, action: "blocked" });
    }
  }

  // Spend limits (estimated cost)
  for (const p of policies.filter((p) => p.kind === "spend_limit" && (!p.channel || p.channel === ctx.channel))) {
    const limitCents = Number(p.value ?? "0");
    if (limitCents <= 0) continue;
    const unit = p.unit ?? "month";
    const windowMs = unit === "day" ? DAY : 30 * DAY;
    const spent = costRepo.spendSince(now() - windowMs, ctx.projectId);
    if (spent >= limitCents) {
      decision.allowed = false;
      decision.spendLimited = true;
      decision.blocked.push(
        `spend limit reached: $${(spent / 100).toFixed(2)}/$ ${(limitCents / 100).toFixed(2)} ${unit}`
      );
      decision.details.push({ policy: p, action: "blocked" });
    }
  }

  return decision;
}

function describeApprovalTrigger(trigger: string, p: Policy): string {
  switch (trigger) {
    case "recipient:new":
      return "first contact with a new external recipient requires operator approval";
    case "bulk":
      return "bulk sends require operator approval";
    case "voice":
      return "voice calls require operator approval";
    case "export":
      return "data export requires operator approval";
    default:
      return p.scope ?? `approval required (${trigger})`;
  }
}

export function activeLimits(projectId: string | null): {
  messagesToday: number;
  callsToday: number;
  spentEstimatedCentsToday: number;
  spentEstimatedCentsMonth: number;
} {
  return {
    messagesToday: usageRepo.todayCount("", "send", projectId ?? undefined),
    callsToday: usageRepo.todayCount("voice", "call", projectId ?? undefined),
    spentEstimatedCentsToday: costRepo.spendSince(now() - DAY, projectId),
    spentEstimatedCentsMonth: costRepo.spendSince(now() - 30 * DAY, projectId),
  };
}

const HOUR2 = 3600_000;
const DAY2 = 24 * HOUR2;
export { HOUR2 as HOUR, DAY2 as DAY };

export function auditPolicyDecision(ctx: PolicyContext, decision: PolicyEvaluation, actor: { type: string; id: string }) {
  auditRepo.record({
    actorType: actor.type as never,
    actorId: actor.id,
    action: decision.allowed ? "policy.approved" : decision.requiresApproval ? "policy.approval_required" : "policy.denied",
    resourceType: "policy",
    projectId: ctx.projectId,
    metadata: {
      channel: ctx.channel,
      to: ctx.to,
      blocked: decision.blocked,
    },
  });
}