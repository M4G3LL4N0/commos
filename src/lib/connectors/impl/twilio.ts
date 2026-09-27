import type {
  Connector,
  HealthResult,
  InboundPart,
  OutboundRequest,
  SendResult,
  TestResult,
  ValidateResult,
} from "../types";
import { basicAuth, fetchJson } from "../http";
import { getConnectorParam } from "../types";
import { safeError } from "@/lib/log";

const API = "https://api.twilio.com/2010-04-01";

function sid(config: Record<string, unknown>, secrets: Record<string, unknown>): string {
  return getConnectorParam(config, secrets, "accountSid");
}
function token(config: Record<string, unknown>, secrets: Record<string, unknown>): string {
  return getConnectorParam(config, secrets, "authToken");
}
function auth(config: Record<string, unknown>, secrets: Record<string, unknown>): string {
  return basicAuth(sid(config, secrets), token(config, secrets));
}

/**
 * Twilio connector — SMS/MMS/Voice via the Twilio REST API v2010-04-01.
 * Basic-auth against the account SID. Verified with GET /Accounts/{Sid}.
 */
export const twilioConnector: Connector = {
  metadata: {
    providerSlug: "twilio",
    name: "Twilio",
    description:
      "Programmable SMS, MMS, and voice calls. Supports outbound + inbound, delivery status, phone-number inventory and call lifecycle.",
    icon: "twilio",
    channels: ["sms", "mms", "voice"],
    category: "messaging",
    capabilities: ["send", "receive", "webhook", "voice", "attachments", "delivery_status", "phone_numbers"],
    docsUrl: "https://www.twilio.com/docs/messaging/guides/how-to-use-your-free-trial-account",
    configuration: [
      {
        key: "accountSid",
        label: "Account SID",
        type: "text",
        required: true,
        placeholder: "ACxxxxxxxxxxxxxxxxxxxx",
      },
      {
        key: "authToken",
        label: "Auth Token",
        type: "password",
        required: true,
        secret: true,
      },
      {
        key: "defaultFrom",
        label: "Default From number",
        type: "text",
        placeholder: "+15551234567",
        help: "Used as the From when a send request does not supply an identity.",
      },
      {
        key: "region",
        label: "Region",
        type: "select",
        options: [
          { value: "", label: "Global (edge)" },
          { value: "us1", label: "US1" },
          { value: "ie1", label: "Europe (ie1)" },
          { value: "au1", label: "Australia (au1)" },
        ],
      },
    ],
    sortOrder: 20,
  },
  capabilities: {
    send: true,
    receive: true,
    webhook: true,
    listIdentities: true,
    listConversations: false,
    voice: true,
    attachments: true,
    inboundRouting: true,
    deliveryStatus: true,
  },

  async health(config, secrets): Promise<HealthResult> {
    const s = sid(config, secrets);
    const t = token(config, secrets);
    if (!s || !t) {
      return { status: "unavailable", message: "Configuration required: Account SID + Auth Token" };
    }
    const start = Date.now();
    const res = await fetchJson(`${API}/Accounts/${s}.json`, {
      headers: { Authorization: auth(config, secrets) },
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const data = res.data as { message?: string; status?: number; code?: number } | null;
      return {
        status: "unavailable",
        message: data?.message ?? res.error ?? `Twilio responded ${res.status}`,
        latencyMs,
        details: { status: res.status, code: data?.code },
      };
    }
    const data = res.data as { status?: string; friendly_name?: string } | null;
    return {
      status: "healthy",
      message: `Twilio account ${data?.friendly_name ?? ""}`.trim(),
      latencyMs,
      details: { accountStatus: data?.status },
    };
  },

  async validate(config, secrets): Promise<ValidateResult> {
    if (!sid(config, secrets)) return { ok: false, message: "Account SID is required" };
    if (!token(config, secrets)) return { ok: false, message: "Auth Token is required" };
    if (!sid(config, secrets).startsWith("AC")) {
      return { ok: false, message: "Account SID should start with AC" };
    }
    return { ok: true, message: "Twilio configuration looks valid" };
  },

  async test(config, secrets): Promise<TestResult> {
    const v = await twilioConnector.validate(config, secrets);
    if (!v.ok) return { ok: false, message: v.message };
    const h = await twilioConnector.health(config, secrets);
    if (h.status === "healthy") return { ok: true, message: "Connected to Twilio", details: h };
    return { ok: false, message: h.message ?? "Twilio health check failed", details: h };
  },

  async send(request, config, secrets): Promise<SendResult> {
    const s = sid(config, secrets);
    const t = token(config, secrets);
    if (!s || !t) return { ok: false, error: "Twilio is not configured" };
    const from = request.from || getConnectorParam(config, secrets, "defaultFrom");
    if (!from) return { ok: false, error: "Missing From number" };

    if (request.channel === "voice") {
      const voiceUrl =
        (request.voiceConfig?.twimlUrl as string) ??
        (request.metadata?.twimlUrl as string);
      if (!voiceUrl) {
        return { ok: false, error: "Voice calls require a TwiML URL (voiceConfig.twimlUrl)" };
      }
      const params = new URLSearchParams({
        To: request.to,
        From: from,
        Url: voiceUrl,
        ...(request.metadata?.timeout ? { Timeout: String(request.metadata.timeout) } : {}),
        ...(request.metadata?.statusCallback
          ? {
              StatusCallback: String(request.metadata.statusCallback),
              StatusCallbackEvent:
                "initiated,ringing,answered,completed,no-answer,busy,failed,canceled",
            }
          : {}),
      });
      return twilioFormPost(s, t, "Calls.json", params, {
        providerKind: "call",
        intent: "voice",
      });
    }

    if (request.channel !== "sms" && request.channel !== "mms") {
      return { ok: false, error: `Twilio does not support channel '${request.channel}'` };
    }
    const params = new URLSearchParams({ To: request.to, From: from, Body: request.body });
    request.attachments?.slice(0, 10).forEach((a, i) => {
      if (a.url) params.append(`MediaUrl${i}`, a.url);
    });
    if (request.metadata?.statusCallback) {
      params.append("StatusCallback", String(request.metadata.statusCallback));
    }
    return twilioFormPost(s, t, "Messages.json", params, { providerKind: "message" });
  },

  async normalizeInbound(raw: unknown): Promise<InboundPart[]> {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const parts: InboundPart[] = [];

    // ---- message / status webhook ----
    const body = r.Body as string | undefined;
    const from = r.From as string | undefined;
    const to = r.To as string | undefined;
    const messageSid = r.MessageSid as string | undefined;
    const smsStatus = (r.SmsStatus as string | undefined) ?? (r.MessageStatus as string | undefined);

    if (smsStatus && !body) {
      // delivery status callback
      parts.push({
        channel: "sms",
        direction: "inbound",
        fromValue: from ?? "",
        toValue: to ?? "",
        providerEventId: messageSid,
        providerMessageId: messageSid,
        providerStatus: mapTwilioStatus(smsStatus),
        metadata: { webhookKind: "status", status: smsStatus },
      });
    } else if (body !== undefined || messageSid) {
      const channels = (r.NumMedia as unknown) !== undefined;
      const numMedia = channels ? Number(r.NumMedia) : 0;
      const channel = numMedia > 0 ? "mms" : "sms";
      const attachments: InboundPart["attachments"] = [];
      for (let i = 0; i < numMedia; i++) {
        const u = r[`MediaUrl${i}`];
        const t = r[`MediaContentType${i}`];
        if (u) {
          attachments.push({ url: String(u), contentType: t ? String(t) : undefined });
        }
      }
      parts.push({
        channel,
        direction: "inbound",
        fromValue: String(from ?? ""),
        toValue: String(to ?? ""),
        body: body ? String(body) : "",
        providerEventId: messageSid,
        providerMessageId: messageSid,
        providerStatus: smsStatus ? mapTwilioStatus(smsStatus) : undefined,
        attachments: attachments.length ? attachments : undefined,
        metadata: { webhookKind: "message", numMedia },
      });
    }

    // ---- voice webhook / status ----
    const callSid = r.CallSid as string | undefined;
    const callStatus = r.CallStatus as string | undefined;
    if (callSid && !parts.length) {
      parts.push({
        channel: "voice",
        direction: "inbound",
        fromValue: String(r.From ?? ""),
        toValue: String(r.To ?? ""),
        providerEventId: callSid,
        providerMessageId: callSid,
        providerStatus: callStatus ? String(callStatus) : undefined,
        metadata: {
          webhookKind: "voice",
          callStatus,
          callDuration: r.CallDuration ? Number(r.CallDuration) : undefined,
          digits: r.Digits ? String(r.Digits) : undefined,
          recordingUrl: r.RecordingUrl ? String(r.RecordingUrl) : undefined,
          fromCity: r.FromCity,
        },
      });
    }
    return parts;
  },

  async listIdentities(config, secrets): Promise<Array<{ id: string; value: string; label?: string }>> {
    const s = sid(config, secrets);
    const t = token(config, secrets);
    if (!s || !t) return [];
    const res = await fetchJson(`${API}/Accounts/${s}/IncomingPhoneNumbers.json?PageSize=50`, {
      headers: { Authorization: auth(config, secrets) },
    });
    if (!res.ok) return [];
    const data = res.data as { incoming_phone_numbers?: Array<Record<string, unknown>> } | null;
    return (data?.incoming_phone_numbers ?? []).map((n) => ({
      id: String(n.sid ?? ""),
      value: String(n.phone_number ?? ""),
      label: n.friendly_name ? String(n.friendly_name) : undefined,
    }));
  },

  async disconnect() {
    return;
  },
};

async function twilioFormPost(
  sid_: string,
  token_: string,
  resource: string,
  params: URLSearchParams,
  details: Record<string, unknown>
): Promise<SendResult> {
  const res = await fetchJson(`${API}/Accounts/${sid_}/${resource}`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(sid_, token_),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const data = res.data as { message?: string; code?: number; more_info?: string } | null;
    return {
      ok: false,
      error: data?.message ?? res.error ?? `Twilio ${resource} failed (${res.status})`,
      details: { ...details, status: res.status, code: data?.code, moreInfo: data?.more_info },
    };
  }
  const data = res.data as { sid?: string; status?: string } | null;
  return {
    ok: true,
    providerMessageId: data?.sid,
    providerStatus: data?.status,
    details: { ...details, twilio: data },
  };
}

function mapTwilioStatus(s: string): string {
  switch (s) {
    case "queued":
    case "accepted":
    case "scheduled":
    case "sending":
    case "sent":
      return "sent";
    case "delivered":
      return "delivered";
    case "undelivered":
    case "failed":
    case "canceled":
      return "failed";
    default:
      return s;
  }
}

export function twilioError(e: unknown): SendResult {
  return { ok: false, error: safeError(e).message };
}