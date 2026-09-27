import type { Channel, ConnectorHealthState, MessageDirection } from "@/types/models";

// =====================================================================
// Provider-neutral connector contract
// =====================================================================

export type ConfigFieldType =
  | "text"
  | "password"
  | "url"
  | "number"
  | "select"
  | "textarea";

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  required?: boolean;
  secret?: boolean;
  placeholder?: string;
  help?: string;
  options?: Array<{ value: string; label: string }>;
  default?: string | number;
  /** If true, the field is only used for the "test" flow and not persisted. */
  testOnly?: boolean;
}

export interface ConnectorMetadata {
  providerSlug: string;
  name: string;
  description: string;
  icon: string;
  channels: Channel[];
  category: "messaging" | "voice" | "email" | "simulation";
  capabilities: string[];
  configuration: ConfigField[];
  docsUrl?: string;
  /** true when this connector can only simulate (no real provider behind it) */
  simulated?: boolean;
  /** Display order in the connector marketplace */
  sortOrder?: number;
}

export interface ConnectorCapabilities {
  send: boolean;
  receive: boolean;
  webhook: boolean;
  listIdentities: boolean;
  listConversations: boolean;
  voice: boolean;
  attachments: boolean;
  inboundRouting: boolean;
  deliveryStatus: boolean;
}

/** Normalized request to send a message through a connector. */
export interface OutboundRequest {
  messageId: string;
  channel: Channel;
  from: string;
  to: string;
  body: string;
  subject?: string | null;
  attachments?: OutboundAttachment[];
  metadata?: Record<string, unknown>;
  projectId?: string | null;
  agentId?: string | null;
  voiceConfig?: Record<string, unknown>;
}

export interface OutboundAttachment {
  filename?: string;
  contentType?: string;
  content?: Buffer | string;
  url?: string;
}

export interface SendResult {
  ok: boolean;
  providerMessageId?: string;
  providerStatus?: string;
  error?: string;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HealthResult {
  status: ConnectorHealthState["status"];
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ValidateResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

export interface TestResult {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
  [key: string]: unknown;
}

export interface InboundPart {
  channel: Channel;
  direction: MessageDirection;
  fromValue: string;
  toValue: string;
  body?: string | null;
  subject?: string | null;
  providerEventId?: string;
  providerMessageId?: string;
  providerStatus?: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
  attachments?: Array<{
    filename?: string;
    contentType?: string;
    url?: string;
    sizeBytes?: number;
  }>;
}

/**
 * A connector instance. Implementations must be stateless with respect to
 * configuration — all config lives in the `config` object passed to methods.
 */
export interface Connector {
  readonly metadata: ConnectorMetadata;
  readonly capabilities: ConnectorCapabilities;

  health(config: Record<string, unknown>, secrets: Record<string, unknown>): Promise<HealthResult>;
  validate(
    config: Record<string, unknown>,
    secrets: Record<string, unknown>
  ): Promise<ValidateResult>;
  test(
    config: Record<string, unknown>,
    secrets: Record<string, unknown>
  ): Promise<TestResult>;
  send(request: OutboundRequest, config: Record<string, unknown>, secrets: Record<string, unknown>): Promise<SendResult>;

  /** Normalize a raw inbound webhook payload into CommOS messages. */
  normalizeInbound?(raw: unknown, config?: Record<string, unknown>): Promise<InboundPart[]>;

  listIdentities?(config: Record<string, unknown>, secrets: Record<string, unknown>): Promise<Array<{ id: string; value: string; label?: string }>>;

  disconnect?(config: Record<string, unknown>): Promise<void>;
}

/** How a connector's persisted config maps to the public shape. */
export interface ConnectorConfigSchema {
  fields: ConfigField[];
}

export function getConnectorParam(
  config: Record<string, unknown>,
  secrets: Record<string, unknown>,
  key: string
): string {
  const fromSecrets = secrets[key];
  if (typeof fromSecrets === "string" && fromSecrets.length > 0) return fromSecrets;
  const fromConfig = config[key];
  if (typeof fromConfig === "string" && fromConfig.length > 0) return fromConfig;
  return "";
}