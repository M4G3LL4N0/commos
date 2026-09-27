import type {
  Connector as ConnectorContract,
  ConnectorCapabilities,
  ConnectorMetadata,
  HealthResult,
  InboundPart,
  OutboundRequest,
  SendResult,
  TestResult,
  ValidateResult,
} from "./types";
import type { Connector as ConnectorRecord } from "@/types/models";
import { registerConnector, getConnectorClass, listConnectorMetadata, collectCatalog, providerEntry } from "./registry";
import { consoleConnector } from "./impl/console";
import { bluebubblesConnector } from "./impl/bluebubbles";
import { twilioConnector } from "./impl/twilio";
import { emailConnector } from "./impl/email";
import { connectorsRepo } from "@/lib/db/repositories";
import { decryptSecretFields, encryptSecretFields } from "@/lib/crypto/secrets";
import { sanitize } from "@/lib/utils/json";

// Hard-reference implementations so bundlers keep them in the graph.
export { consoleConnector, bluebubblesConnector, twilioConnector, emailConnector };
export { PROVIDER_CATALOG, providerEntry, collectCatalog } from "./registry";
export * from "./types";

let _registered = false;
export function ensureRegistered() {
  if (_registered) return;
  registerConnector(consoleConnector);
  registerConnector(bluebubblesConnector);
  registerConnector(twilioConnector);
  registerConnector(emailConnector);
  _registered = true;
}

export function getConnector(providerSlug: string): ConnectorContract | undefined {
  ensureRegistered();
  return getConnectorClass(providerSlug);
}

export function connectorMetadataList(): ConnectorMetadata[] {
  ensureRegistered();
  return listConnectorMetadata();
}

export function connectorMetadata(providerSlug: string): ConnectorMetadata | undefined {
  ensureRegistered();
  return getConnectorClass(providerSlug)?.metadata;
}

export function capabilitiesFor(providerSlug: string): ConnectorCapabilities | null {
  return getConnector(providerSlug)?.capabilities ?? null;
}

/** Partition an incoming config into non-secret config + encrypted secret blob. */
export function partitionConfig(
  providerSlug: string,
  input: Record<string, unknown>
): { config: Record<string, unknown>; secrets: Record<string, unknown> } {
  const meta = connectorMetadata(providerSlug);
  const secretKeys = new Set(
    (meta?.configuration ?? []).filter((f) => f.secret).map((f) => f.key)
  );
  const config: Record<string, unknown> = {};
  const secrets: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (secretKeys.has(k)) {
      // "[set]" means "keep existing"; empty means omit.
      if (v === "[set]" || v === "" || v === null || v === undefined) continue;
      secrets[k] = v;
    } else {
      config[k] = v;
    }
  }
  return { config, secrets };
}

export function encryptSecrets(providerSlug: string, secrets: Record<string, unknown>): string {
  const meta = connectorMetadata(providerSlug);
  const secretKeys = (meta?.configuration ?? []).filter((f) => f.secret).map((f) => f.key);
  return encryptSecretFields(secrets, secretKeys);
}

/** Decrypt a connector record's stored secrets. */
export function resolveSecrets(secretBlob: string | null | undefined): Record<string, unknown> {
  if (!secretBlob) return {};
  return decryptSecretFields(secretBlob);
}

export function loadConnectorSecrets(cid: string): Record<string, unknown> {
  return resolveSecrets(connectorsRepo.getSecretJson(cid));
}

/** Full runtime context for a connector record: record + decrypted secrets. */
export function loadConnectorContext(cid: string): {
  record: ConnectorRecord;
  secrets: Record<string, unknown>;
} {
  const record = connectorsRepo.getById(cid);
  if (!record) throw new Error(`Connector not found: ${cid}`);
  const secrets = resolveSecrets(connectorsRepo.getSecretJson(cid));
  return { record, secrets };
}

/**
 * A connector record's secrets are never exposed. Returns a UI-safe deep copy.
 */
export function publicConnectorView(record: ConnectorRecord): Record<string, unknown> {
  const entries = Object.entries(record as unknown as Record<string, unknown>);
  const safe: Record<string, unknown> = {};
  for (const [k, v] of entries) {
    if (k === "config") {
      safe[k] = sanitize(v ?? {});
    } else {
      safe[k] = sanitize(v);
    }
  }
  const meta = connectorMetadata(record.providerSlug);
  const secretFields = (meta?.configuration ?? []).filter((f) => f.secret).map((f) => f.key);
  const cfg = safe.config as Record<string, unknown>;
  for (const k of secretFields) {
    if (cfg[k] !== undefined) cfg[k] = "[set]";
  }
  safe.secretsConfigured = Boolean(connectorsRepo.getSecretJson(record.id));
  safe._isFuture = providerEntry(record.providerSlug)?.status === "future";
  safe.capabilities = capabilitiesFor(record.providerSlug);
  return safe;
}

export async function connectorHealth(
  record: ConnectorRecord,
  secrets?: Record<string, unknown>
): Promise<HealthResult> {
  const c = getConnector(record.providerSlug);
  const sec = secrets ?? resolveSecrets(connectorsRepo.getSecretJson(record.id));
  if (!c) {
    const future = providerEntry(record.providerSlug)?.status === "future";
    return {
      status: "unavailable",
      message: future ? "Future connector — not implemented yet" : `No connector implementation for '${record.providerSlug}'`,
    };
  }
  try {
    return await c.health(record.config ?? {}, sec);
  } catch (err) {
    return { status: "unavailable", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function connectorValidate(
  providerSlug: string,
  config: Record<string, unknown>,
  secrets: Record<string, unknown>
): Promise<ValidateResult> {
  const c = getConnector(providerSlug);
  if (!c) return { ok: false, message: `Unknown connector '${providerSlug}'` };
  return c.validate(config, secrets);
}

export async function connectorTest(
  providerSlug: string,
  config: Record<string, unknown>,
  secrets: Record<string, unknown>
): Promise<TestResult> {
  const c = getConnector(providerSlug);
  if (!c) return { ok: false, message: `Unknown connector '${providerSlug}'` };
  return c.test(config, secrets);
}

export async function connectorSend(
  record: ConnectorRecord,
  request: OutboundRequest,
  secrets?: Record<string, unknown>
): Promise<SendResult> {
  const c = getConnector(record.providerSlug);
  if (!c) return { ok: false, error: `No connector implementation for '${record.providerSlug}'` };
  const sec = secrets ?? resolveSecrets(connectorsRepo.getSecretJson(record.id));
  return c.send(request, record.config ?? {}, sec);
}

export async function connectorNormalizeInbound(
  providerSlug: string,
  record: ConnectorRecord | undefined,
  raw: unknown
): Promise<InboundPart[]> {
  const c = getConnector(providerSlug);
  if (!c || !c.normalizeInbound) return [];
  const config = record?.config ?? {};
  const secrets = record ? resolveSecrets(connectorsRepo.getSecretJson(record.id)) : {};
  try {
    return await c.normalizeInbound(raw, config);
  } catch (err) {
    return [];
  }
}

export async function connectorListIdentities(
  cid: string
): Promise<Array<{ id: string; value: string; label?: string }>> {
  const record = connectorsRepo.getById(cid);
  if (!record) return [];
  const c = getConnector(record.providerSlug);
  if (!c?.listIdentities) return [];
  const secrets = resolveSecrets(connectorsRepo.getSecretJson(cid));
  try {
    return await c.listIdentities(record.config ?? {}, secrets);
  } catch {
    return [];
  }
}