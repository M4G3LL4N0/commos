import type {
  Connector,
  HealthResult,
  InboundPart,
  OutboundRequest,
  SendResult,
  TestResult,
  ValidateResult,
} from "../types";
import { fetchJson } from "../http";
import { getConnectorParam } from "../types";
import { normalizePhone } from "@/lib/utils/phone";
import { safeError } from "@/lib/log";

function serverUrl(config: Record<string, unknown>): string {
  return String(config.serverUrl ?? "").replace(/\/+$/, "");
}

/**
 * BlueBubbles connector — real iMessage gateway.
 *
 * Implements the BlueBubbles Server private REST API:
 *   GET  {server}/api/v1/server/health-check   (Bearer password auth)
 *   GET  {server}/api/v1/server/self
 *   GET  {server}/api/v1/chat?participant=...
 *   POST {server}/api/v1/message/text          ({guid|chatGuid, message, method})
 *
 * Inbound events arrive over BlueBubbles' socket/websocket transport. CommOS
 * receives them via /webhooks/bluebubbles (normalized here); see CONNECTORS.md
 * for wiring the BlueBubbles socket through to CommOS.
 */
export const bluebubblesConnector: Connector = {
  metadata: {
    providerSlug: "bluebubbles",
    name: "BlueBubbles",
    description:
      "iMessage via the BlueBubbles server. Requires a running BlueBubbles server with the private API enabled and a password.",
    icon: "imessage",
    channels: ["imessage"],
    category: "messaging",
    capabilities: ["send", "receive", "webhook", "attachments", "delivery_status"],
    docsUrl: "https://bluebubbles.app/install/",
    configuration: [
      {
        key: "serverUrl",
        label: "Server URL",
        type: "url",
        required: true,
        placeholder: "http://127.0.0.1:1234",
        help: "Default BlueBubbles server port is 1234.",
      },
      {
        key: "password",
        label: "Password / API credential",
        type: "password",
        required: true,
        secret: true,
        help: "The password configured under BlueBubbles → Settings → Private API.",
      },
    ],
    sortOrder: 10,
  },
  capabilities: {
    send: true,
    receive: true,
    webhook: true,
    listIdentities: true,
    listConversations: true,
    voice: false,
    attachments: true,
    inboundRouting: false,
    deliveryStatus: true,
  },

  async health(config, secrets): Promise<HealthResult> {
    const url = serverUrl(config);
    const password = getConnectorParam(config, secrets, "password");
    if (!url || !password) {
      return { status: "unavailable", message: "Configuration required: server URL and password" };
    }
    const start = Date.now();
    const res = await fetchJson(`${url}/api/v1/server/health-check`, {
      headers: { Authorization: `Bearer ${password}` },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      if (res.status === 511) {
        return {
          status: "unavailable",
          message: "BlueBubbles requires authentication (511). Check the password.",
          latencyMs,
        };
      }
      return {
        status: "unavailable",
        message: res.error ?? `Server responded ${res.status}`,
        latencyMs,
      };
    }
    const data = res.data as Record<string, unknown> | null;
    const result = data?.result;
    const ok = result === true || result === "true" || data?.success === true;
    if (!ok) {
      return {
        status: "degraded",
        message: "Server reachable, but health-check returned an unexpected result.",
        latencyMs,
        details: data ?? undefined,
      };
    }
    return {
      status: "healthy",
      message:
        typeof data?.message === "string"
          ? String(data.message)
          : "BlueBubbles server healthy",
      latencyMs,
      details: data ?? undefined,
    };
  },

  async validate(config, secrets): Promise<ValidateResult> {
    const url = serverUrl(config);
    if (!url) return { ok: false, message: "Server URL is required" };
    try {
      new URL(url);
    } catch {
      return { ok: false, message: "Server URL is not a valid URL" };
    }
    if (!getConnectorParam(config, secrets, "password")) {
      return { ok: false, message: "Password is required" };
    }
    return { ok: true, message: "Configuration looks valid" };
  },

  async test(config, secrets): Promise<TestResult> {
    const v = await bluebubblesConnector.validate(config, secrets);
    if (!v.ok) return { ok: false, message: v.message };
    const h = await bluebubblesConnector.health(config, secrets);
    if (h.status === "healthy") {
      return { ok: true, message: "Connected to BlueBubbles", details: h };
    }
    return { ok: false, message: h.message ?? "BlueBubbles health check failed", details: h };
  },

  async send(request, config, secrets): Promise<SendResult> {
    const url = serverUrl(config);
    const password = getConnectorParam(config, secrets, "password");
    if (!url || !password) {
      return { ok: false, error: "BlueBubbles is not configured" };
    }
    const guid = buildGuid(request.to);
    const body: Record<string, unknown> = {
      message: request.body,
      method: "standard",
    };
    // Prefer a resolved chatGuid if the caller knows one, else let BlueBubbles
    // create/find the chat from the recipient's guid.
    const chatGuid = request.metadata?.chatGuid;
    if (typeof chatGuid === "string" && chatGuid) {
      body.chatGuid = chatGuid;
    } else {
      body.guid = guid;
    }
    const res = await fetchJson(`${url}/api/v1/message/text`, {
      method: "POST",
      headers: { Authorization: `Bearer ${password}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return {
        ok: false,
        error: res.error ?? `BlueBubbles send failed (${res.status})`,
        details: res.data as Record<string, unknown> | undefined,
      };
    }
    const data = res.data as { message?: { guid?: string } } | null;
    return {
      ok: true,
      providerMessageId: data?.message?.guid,
      providerStatus: "sent",
      details: data as Record<string, unknown> | undefined,
    };
  },

  async normalizeInbound(raw: unknown): Promise<InboundPart[]> {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    // BlueBubbles socket relays event envelopes: {event?, data:{message, chat}}.
    const data = (r.data ?? r) as Record<string, unknown>;
    let message = data.message as Record<string, unknown> | undefined;
    if (Array.isArray(data.messages)) {
      return data.messages
        .map((m) => mapImessage(m as Record<string, unknown>))
        .filter((p): p is InboundPart => p !== null);
    }
    if (!message) {
      // Accept a bare message object
      if (
        typeof data.guid === "string" ||
        typeof data.text === "string" ||
        typeof data.handle === "string"
      ) {
        message = data;
      }
    }
    if (!message) return [];
    const part = mapImessage(message);
    return part ? [part] : [];
  },

  async listIdentities(config, secrets): Promise<Array<{ id: string; value: string; label?: string }>> {
    const url = serverUrl(config);
    const password = getConnectorParam(config, secrets, "password");
    if (!url || !password) return [];
    const res = await fetchJson(`${url}/api/v1/server/self`, {
      headers: { Authorization: `Bearer ${password}` },
    });
    if (!res.ok) return [];
    const data = res.data as { handles?: unknown } | null;
    const handles = data?.handles;
    if (Array.isArray(handles)) {
      return handles.map((h) => ({
        id: String((h as Record<string, unknown>)?.id ?? String(h)),
        value: String((h as Record<string, unknown>)?.address ?? String(h)),
      }));
    }
    return [];
  },

  async disconnect() {
    return;
  },
};

export function buildGuid(handle: string): string {
  const h = handle.trim();
  const normalized = h.startsWith("+") ? normalizePhone(h) : h;
  const service = h.startsWith("+") ? "+" : "-";
  return `iMessage;${service};${normalized}`;
}

function mapImessage(m: Record<string, unknown>): InboundPart | null {
  const guid = m.guid ?? m.id;
  const chat = m.chat as Record<string, unknown> | undefined;
  const participants = Array.isArray(chat?.participants)
    ? (chat.participants as Array<Record<string, unknown>>)
    : [];
  const fromHandle = m.handle ?? participants[0]?.handle ?? null;
  const chatGuid = typeof m.chatGuid === "string" ? m.chatGuid : typeof chat?.chatGuid === "string" ? chat.chatGuid : null;
  const text = m.text ?? m.message ?? null;
  const metadata: Record<string, unknown> = {
    service: m.service ?? null,
    chatGuid: chatGuid ?? null,
    groupChat: Boolean(m.groupChat ?? chat?.groupChat),
    isFromMe: Boolean(m.isFromMe ?? chat?.isFromMe),
    debug: true,
  };
  return {
    channel: "imessage",
    direction: "inbound",
    fromValue: String(fromHandle ?? ""),
    toValue: chatGuid ?? "",
    body: text ? String(text) : null,
    providerEventId: guid ? String(guid) : undefined,
    providerMessageId: guid ? String(guid) : undefined,
    timestamp:
      typeof m.timestamp === "number" ? m.timestamp : typeof m.dateCreated === "number" ? m.dateCreated : undefined,
    metadata,
  };
}

export function bluebubblesSendError(e: unknown): SendResult {
  return { ok: false, error: safeError(e).message };
}