import { webhookRepo, systemEventsRepo, setEventEmitter } from "@/lib/db/repositories";
import { id, now } from "@/lib/utils/ids";
import { createHmac, timingSafeEqual } from "node:crypto";
import { log, safeError } from "@/lib/log";

export interface BusEvent {
  type: string;
  projectId?: string | null;
  agentId?: string | null;
  connectorId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  payload?: Record<string, unknown> | null;
  requestId?: string | null;
}

type Subscriber = (event: BusEvent) => void | Promise<void>;

const subscribers = new Map<string, Subscriber[]>();
let _draining = false;

export function subscribe(type: string, fn: Subscriber) {
  const list = subscribers.get(type) ?? [];
  list.push(fn);
  subscribers.set(type, list);
}

export function emit(event: BusEvent): Promise<void> {
  const ts = now();
  setEventEmitter((ev) => {
    emit(ev);
  });
  const record = {
    id: id("evt"),
    type: event.type,
    projectId: event.projectId ?? null,
    agentId: event.agentId ?? null,
    connectorId: event.connectorId ?? null,
    messageId: event.messageId ?? null,
    conversationId: event.conversationId ?? null,
    payload: event.payload ?? null,
    requestId: event.requestId ?? null,
    createdAt: ts,
  };
  systemEventsRepo.insert(record as never);

  if (!_draining) {
    _draining = true;
    queueMicrotask(() => {
      _draining = false;
      const list = subscribers.get(event.type) ?? [];
      const wild = subscribers.get("*") ?? [];
      for (const fn of [...list, ...wild]) {
        queueMicrotask(() => {
          Promise.resolve(fn(event)).catch((err) => {
            log.warn("event subscriber error", { type: event.type, err: safeError(err) });
          });
        });
      }
    });
  }

  enqueueForActiveWebhooks(record);
  return Promise.resolve();
}

function enqueueForActiveWebhooks(event: {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  projectId: string | null;
  requestId: string | null;
}) {
  const endpoints = webhookRepo.listEndpoints();
  for (const ep of endpoints) {
    if (!ep.active) continue;
    if (ep.projectId && event.projectId && ep.projectId !== event.projectId) continue;
    const types = ep.eventTypes ?? [];
    if (types.length && !types.includes(event.type) && !types.includes("*")) continue;
    webhookRepo.enqueueDelivery({ webhookEndpointId: ep.id, eventId: event.id });
  }
}

export function signPayload(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySignature(secret: string, body: string, signature: string): boolean {
  const expected = signPayload(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// =====================================================================
// Outbound webhook delivery worker
// =====================================================================

export function processPendingDeliveries(nowMs = Date.now()): Promise<number> {
  const pending = webhookRepo.pendingDeliveries(50);
  for (const d of pending) {
    queueMicrotask(() => deliverOne(d.id, d.webhookEndpointId, nowMs).catch(() => {}));
  }
  return Promise.resolve(pending.length);
}

async function deliverOne(deliveryId: string, endpointId: string, _nowMs: number) {
  const endpoint = webhookRepo.getEndpoint(endpointId);
  if (!endpoint || !endpoint.active) {
    webhookRepo.updateDelivery(deliveryId, { status: "failed", lastError: "endpoint missing or inactive" });
    return;
  }
  const delivery = webhookRepo.pendingDeliveries(1).find((x) => x.id === deliveryId);
  const event = delivery ? systemEventsRepo.getById(delivery.eventId) : undefined;
  const payload = {
    event: event?.type ?? "commos.unknown",
    at: Date.now(),
    payload: event?.payload ?? null,
    projectId: event?.projectId ?? null,
    messageId: event?.messageId ?? null,
    conversationId: event?.conversationId ?? null,
  };
  const body = JSON.stringify(payload);
  const signature = endpoint.secret ? signPayload(endpoint.secret, body) : "";
  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `commos/${process.env.npm_package_version ?? "0.1.0"}`,
        ...(signature ? { "x-commos-signature": signature } : {}),
        ...(endpoint.headers ?? {}),
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      webhookRepo.updateDelivery(deliveryId, {
        status: "delivered",
        responseStatus: res.status,
        deliveredAt: Date.now(),
        lastError: null,
      });
    } else {
      failWithRetry(deliveryId, `HTTP ${res.status}`);
    }
  } catch (err) {
    failWithRetry(deliveryId, safeError(err).message);
  }
}

function failWithRetry(deliveryId: string, error: string) {
  const d = webhookRepo.pendingDeliveries(1).find((x) => x.id === deliveryId);
  const attempts = (d?.attempts ?? 0) + 1;
  if (attempts >= 5) {
    webhookRepo.updateDelivery(deliveryId, { status: "failed", lastError: error });
    return;
  }
  const backoff = [10_000, 60_000, 300_000, 3_600_000][Math.min(attempts - 1, 3)];
  webhookRepo.updateDelivery(deliveryId, {
    status: "pending",
    nextAttemptAt: Date.now() + backoff,
    lastError: error,
  });
}

let _workerStarted = false;
export function startWebhookWorker(intervalMs = 15000) {
  if (_workerStarted) return;
  _workerStarted = true;
  setInterval(() => {
    processPendingDeliveries().catch(() => {});
  }, intervalMs).unref();
}

// =====================================================================
// Convenience event helpers
// =====================================================================

export const systemEvents = {
  list: systemEventsRepo.list,
  count: systemEventsRepo.count,
};