import type {
  Connector,
  HealthResult,
  InboundPart,
  OutboundRequest,
  SendResult,
  TestResult,
  ValidateResult,
} from "../types";
import type { Channel } from "@/types/models";

/**
 * Simulation console connector. Used for development, dry runs, and tests.
 * It never talks to a real provider and always reports its actions through
 * the returned providerMessageId. This is the ONLY connector that "succeeds"
 * without external configuration — and it is explicitly labeled simulated.
 */
export const consoleConnector: Connector = {
  metadata: {
    providerSlug: "console",
    name: "Simulation Console",
    description:
      "Local message simulator for development and dry runs. Nothing leaves this machine.",
    icon: "terminal",
    channels: ["console", "sms", "email", "imessage"],
    category: "simulation",
    capabilities: ["send", "receive", "simulated", "dry_run"],
    configuration: [
      {
        key: "label",
        label: "Environment label",
        type: "text",
        placeholder: "dev",
      },
      {
        key: "simulated",
        label: "Simulated mode",
        type: "text",
        default: "true",
        help: "Always on. This connector never transmits to a real provider.",
      },
    ],
    simulated: true,
    sortOrder: 90,
  },
  capabilities: {
    send: true,
    receive: true,
    webhook: true,
    listIdentities: false,
    listConversations: false,
    voice: false,
    attachments: false,
    inboundRouting: false,
    deliveryStatus: true,
  },

  async health(): Promise<HealthResult> {
    return {
      status: "healthy",
      message: "Simulation console ready",
      details: { simulated: true },
    };
  },

  async validate(): Promise<ValidateResult> {
    return { ok: true, message: "Simulation console requires no configuration" };
  },

  async test(): Promise<TestResult> {
    return {
      ok: true,
      message: "Simulation connected",
      details: { simulated: true },
    };
  },

  async send(request: OutboundRequest): Promise<SendResult> {
    const providerMessageId = `sim_${request.messageId}_${Date.now()}`;
    return {
      ok: true,
      providerMessageId,
      providerStatus: "delivered",
      details: {
        simulated: true,
        channel: request.channel,
        to: request.to,
        subject: request.subject ?? null,
        body: request.body,
      },
    };
  },

  async normalizeInbound(raw: unknown): Promise<InboundPart[]> {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const channel = (r.channel as Channel) ?? "console";
    const parts = (r.messages ?? []) as Array<Record<string, unknown>>;
    if (parts.length) {
      return parts.map((p) => ({
        channel,
        direction: "inbound",
        fromValue: String(p.from ?? "+10000000000"),
        toValue: String(p.to ?? "+10000000000"),
        body: String(p.body ?? ""),
        providerEventId: String(p.id ?? crypto.randomUUID()),
        timestamp: typeof p.timestamp === "number" ? p.timestamp : undefined,
        metadata: { simulated: true },
      }));
    }
    return [
      {
        channel,
        direction: "inbound",
        fromValue: String(r.from ?? "+10000000000"),
        toValue: String(r.to ?? "+10000000000"),
        body: String(r.body ?? "Simulated inbound message"),
        providerEventId: String(r.id ?? crypto.randomUUID()),
        timestamp: typeof r.timestamp === "number" ? r.timestamp : undefined,
        metadata: { simulated: true },
      },
    ];
  },
};