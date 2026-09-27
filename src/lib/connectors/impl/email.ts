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
import { safeError } from "@/lib/log";

export type EmailProvider = "resend" | "smtp";

function providerOf(config: Record<string, unknown>): EmailProvider {
  const p = String(config.provider ?? "resend");
  return p === "smtp" ? "smtp" : "resend";
}

/**
 * Email connector — provider-neutral envelope with Resend and SMTP adapters.
 * Outbound is fully implemented for both; inbound is normalized from webhook
 * payloads (Resend inbound / Postmark / SendGrid shapes). Dynamic address
 * provisioning lives in the identities + routing services.
 */
export const emailConnector: Connector = {
  metadata: {
    providerSlug: "email",
    name: "Email",
    description:
      "Outbound and inbound email over a provider-neutral connector. Resend (API) and SMTP adapters; dynamic per-address provisioning; reply threading; attachments.",
    icon: "email",
    channels: ["email"],
    category: "email",
    capabilities: ["send", "receive", "webhook", "attachments", "dynamic_addresses", "threading", "delivery_status"],
    docsUrl: "https://resend.com/docs",
    configuration: [
      {
        key: "provider",
        label: "Provider",
        type: "select",
        required: true,
        options: [
          { value: "resend", label: "Resend (transactional API)" },
          { value: "smtp", label: "SMTP" },
        ],
        default: "resend",
      },
      {
        key: "domain",
        label: "Sending domain",
        type: "text",
        required: true,
        placeholder: "app.example.com",
        help: "Domain verified with your provider. Used as the From suffix and for dynamic addresses.",
      },
      {
        key: "fromPrefix",
        label: "Default From prefix",
        type: "text",
        placeholder: "commos",
        default: "commos",
        help: "Defaults to commos@app.example.com when a send has no explicit identity.",
      },
      {
        key: "resendApiKey",
        label: "Resend API key",
        type: "password",
        required: false,
        secret: true,
        help: "Required when provider is Resend.",
      },
      {
        key: "smtpHost",
        label: "SMTP host",
        type: "text",
        required: false,
        placeholder: "smtp.example.com",
        help: "Required when provider is SMTP.",
      },
      {
        key: "smtpPort",
        label: "SMTP port",
        type: "number",
        default: 587,
        required: false,
      },
      {
        key: "smtpSecure",
        label: "SMTP TLS (port 465)",
        type: "select",
        options: [
          { value: "0", label: "STARTTLS (587)" },
          { value: "1", label: "SSL/TLS (465)" },
        ],
        default: "0",
      },
      {
        key: "smtpUser",
        label: "SMTP username",
        type: "text",
        required: false,
        secret: true,
      },
      {
        key: "smtpPass",
        label: "SMTP password",
        type: "password",
        required: false,
        secret: true,
      },
    ],
    sortOrder: 30,
  },
  capabilities: {
    send: true,
    receive: true,
    webhook: true,
    listIdentities: false,
    listConversations: false,
    voice: false,
    attachments: true,
    inboundRouting: true,
    deliveryStatus: false,
  },

  async validate(config, secrets): Promise<ValidateResult> {
    const p = providerOf(config);
    if (!config.domain) return { ok: false, message: "Sending domain is required" };
    if (p === "resend") {
      if (!getConnectorParam(config, secrets, "resendApiKey")) {
        return { ok: false, message: "Resend API key is required" };
      }
    } else {
      if (!getConnectorParam(config, secrets, "smtpHost")) {
        return { ok: false, message: "SMTP host is required" };
      }
      if (!getConnectorParam(config, secrets, "smtpUser")) {
        // smtpUser may legitimately be omitted for open relays, but we require
        // it for realistic sending.
        return { ok: false, message: "SMTP username is required" };
      }
    }
    return { ok: true, message: `Email configuration (${p}) looks valid` };
  },

  async health(config, secrets): Promise<HealthResult> {
    const p = providerOf(config);
    const start = Date.now();
    if (p === "resend") {
      const key = getConnectorParam(config, secrets, "resendApiKey");
      if (!key) return { status: "unavailable", message: "Resend API key missing" };
      // GET /domains validates the key and shows registered domains.
      const res = await fetchJson("https://api.resend.com/domains", {
        headers: { Authorization: `Bearer ${key}` },
      });
      const latencyMs = Date.now() - start;
      if (!res.ok) {
        return { status: "unavailable", message: res.error ?? `Resend responded ${res.status}`, latencyMs };
      }
      const data = res.data as { data?: Array<{ name?: string; status?: string; id?: string }> } | null;
      const domains = data?.data ?? [];
      const domain = domains.find((d) => d.name === config.domain);
      return {
        status: domain ? "healthy" : "degraded",
        message: domain
          ? `Resend connected · ${domain.name} ${domain.status ?? "ok"}`
          : `Resend connected, but configured domain '${config.domain}' is not on this account`,
        latencyMs,
        details: { domains: domains.map((d) => d.name) },
      };
    }

    // SMTP health via nodemailer transport.verify()
    try {
      const transport = await createSmtpTransport(config, secrets);
      const ok = await transport.verify();
      await transport.close();
      const latencyMs = Date.now() - start;
      if (!ok) {
        return { status: "unavailable", message: "SMTP verification failed", latencyMs };
      }
      return { status: "healthy", message: `SMTP ${config.smtpHost} verified`, latencyMs };
    } catch (err) {
      return { status: "unavailable", message: safeError(err).message, latencyMs: Date.now() - start };
    }
  },

  async test(config, secrets): Promise<TestResult> {
    const v = await emailConnector.validate(config, secrets);
    if (!v.ok) return { ok: false, message: v.message };
    const h = await emailConnector.health(config, secrets);
    if (h.status === "healthy") return { ok: true, message: "Email provider connected", details: h };
    return { ok: false, message: h.message ?? "Email provider health check failed", details: h };
  },

  async send(request, config, secrets): Promise<SendResult> {
    const p = providerOf(config);
    const from = request.from || `${String(config.fromPrefix ?? "commos")}@${String(config.domain)}`;
    if (p === "smtp") {
      return sendViaSmtp(request, from, config, secrets);
    }
    const key = getConnectorParam(config, secrets, "resendApiKey");
    if (!key) return { ok: false, error: "Resend API key missing" };
    const payload: Record<string, unknown> = {
      from,
      to: request.to,
      subject: request.subject ?? "",
    };
    if (/<[^>]+>/s.test(request.body)) {
      payload.html = request.body;
    } else {
      payload.text = request.body;
    }
    if (request.metadata?.replyTo) payload.reply_to = String(request.metadata.replyTo);
    if (request.metadata?.inReplyTo) payload.headers = { "In-Reply-To": String(request.metadata.inReplyTo), References: String(request.metadata.inReplyTo) };
    if (request.attachments?.length) {
      payload.attachments = request.attachments.map((a) => ({
        filename: a.filename ?? "attachment",
        content: a.content ? Buffer.from(a.content as string).toString("base64") : undefined,
      }));
    }
    const res = await fetchJson("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const data = res.data as { message?: string; code?: string } | null;
      return {
        ok: false,
        error: data?.message ?? res.error ?? `Resend send failed (${res.status})`,
        details: { status: res.status, code: data?.code },
      };
    }
    const data = res.data as { id?: string } | null;
    return { ok: true, providerMessageId: data?.id, providerStatus: "sent" };
  },

  async normalizeInbound(raw: unknown): Promise<InboundPart[]> {
    if (!raw || typeof raw !== "object") return [];
    const r = raw as Record<string, unknown>;
    const parts: InboundPart[] = [];

    // ---- Resend inbound webhook ----
    const resendType = r.type as string | undefined;
    if (resendType || r.data) {
      const data = (r.data ?? r) as Record<string, unknown>;
      const email = data.email as Record<string, unknown> | undefined;
      if (email) {
        const from = parseAddressField(email.from as unknown);
        const toRaw = email.to;
        const toList = Array.isArray(toRaw)
          ? toRaw.map((x) => parseAddressField(x).email)
          : toRaw
            ? [parseAddressField(toRaw).email]
            : [];
        const headers = Array.isArray(email.headers)
          ? (email.headers as Array<{ name?: string; value?: string }>).reduce<Record<string, string>>(
              (acc, h) => {
                if (h.name) acc[h.name] = String(h.value ?? "");
                return acc;
              },
              {}
            )
          : {};
        const cc = email.cc
          ? (Array.isArray(email.cc) ? email.cc : [email.cc]).map((x) => parseAddressField(x).email)
          : [];
        const bcc = email.bcc
          ? (Array.isArray(email.bcc) ? email.bcc : [email.bcc]).map((x) => parseAddressField(x).email)
          : [];
        parts.push({
          channel: "email",
          direction: "inbound",
          fromValue: from.email,
          toValue: toList[0] ?? "",
          subject: String(email.subject ?? ""),
          body: String(email.text ?? email.html ?? ""),
          providerEventId: String(email.id ?? r.id ?? crypto.randomUUID()),
          providerMessageId: String(email.id ?? null),
          timestamp: typeof data.created_at === "string" ? new Date(data.created_at).getTime() : undefined,
          metadata: {
            webhookKind: "message",
            fromName: from.name,
            cc,
            bcc,
            messageId: headers["Message-ID"],
            headers,
          },
        });
      }
    } else if (r.MessageID || r.From) {
      // ---- Postmark / generic inbound shape ----
      parts.push({
        channel: "email",
        direction: "inbound",
        fromValue: parseAddressField(r.From as unknown).email,
        toValue: firstEmail(r.To),
        subject: String(r.Subject ?? ""),
        body: String(r.TextBody ?? r.HtmlBody ?? ""),
        providerEventId: String(r.MessageID ?? crypto.randomUUID()),
        providerMessageId: String(r.MessageID ?? null),
        timestamp: typeof r.Date === "string" ? new Date(r.Date).getTime() : undefined,
        metadata: { webhookKind: "message", headers: r.Headers ?? undefined },
      });
    }
    return parts;
  },

  async disconnect() {
    return;
  },
};

async function createSmtpTransport(config: Record<string, unknown>, secrets: Record<string, unknown>) {
  const { default: nodemailer } = await import("nodemailer");
  const host = getConnectorParam(config, secrets, "smtpHost");
  const port = Number(config.smtpPort ?? (config.smtpSecure === "1" ? 465 : 587));
  const secure = String(config.smtpSecure ?? "0") === "1";
  const user = getConnectorParam(config, secrets, "smtpUser");
  const pass = getConnectorParam(config, secrets, "smtpPass");
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    tls: { rejectUnauthorized: true },
  } as Parameters<typeof nodemailer.createTransport>[0]);
}

async function sendViaSmtp(
  request: OutboundRequest,
  from: string,
  config: Record<string, unknown>,
  secrets: Record<string, unknown>
): Promise<SendResult> {
  try {
    const transport = await createSmtpTransport(config, secrets);
    const mail: Record<string, unknown> = {
      from,
      to: request.to,
      subject: request.subject ?? "",
      text: request.body,
      replyTo: request.metadata?.replyTo,
      inReplyTo: request.metadata?.inReplyTo,
      headers: request.metadata?.headers,
    };
    if (request.attachments?.length) {
      mail.attachments = request.attachments.map((a) => ({
        filename: a.filename ?? "attachment",
        content: a.content as string | Buffer | undefined,
      }));
    }
    const info = (await transport.sendMail(mail as any)) as { messageId?: string };
    transport.close();
    return { ok: true, providerMessageId: info.messageId, providerStatus: "sent" };
  } catch (err) {
    return { ok: false, error: safeError(err).message };
  }
}

function parseAddressField(v: unknown): { email: string; name?: string } {
  if (typeof v === "string") {
    const m = v.match(/^(.*?)\s*<([^>]+)>$/);
    if (m) return { name: m[1].trim(), email: m[2].trim() };
    return { email: v.trim() };
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return { email: String(o.email ?? ""), name: o.name ? String(o.name) : undefined };
  }
  return { email: "" };
}

function firstEmail(v: unknown): string {
  if (typeof v === "string") return parseAddressField(v).email;
  if (Array.isArray(v)) {
    for (const x of v) {
      const e = parseAddressField(x).email;
      if (e) return e;
    }
  }
  return "";
}