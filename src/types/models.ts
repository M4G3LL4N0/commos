// =====================================================================
// CommOS domain model
// =====================================================================

export type Channel =
  | "email"
  | "sms"
  | "mms"
  | "imessage"
  | "voice"
  | "whatsapp"
  | "rcs"
  | "telegram"
  | "slack"
  | "discord"
  | "webchat"
  | "console";

export type ChannelFamily = "messaging" | "voice" | "email";

export type MessageDirection = "inbound" | "outbound";

export type MessageStatus =
  | "created"
  | "queued"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "sending"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "received";

export type ConnectorStatus =
  | "not_configured"
  | "configuration_required"
  | "connected"
  | "degraded"
  | "disconnected"
  | "error";

export type ConnectorHealth = "healthy" | "degraded" | "unavailable" | "unknown";

export type IdentityType = "phone" | "email" | "imessage" | "web" | "sip";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type PolicyKind =
  | "permission"
  | "approval_required"
  | "allowlist"
  | "blocklist"
  | "rate_limit"
  | "spend_limit"
  | "recipient_restriction";

export type CostStatus = "estimated" | "actual" | "unavailable";

export type CallStatus =
  | "initiated"
  | "ringing"
  | "answered"
  | "completed"
  | "failed"
  | "transcribed";

export type AuditActorType = "operator" | "api_key" | "agent" | "project" | "system" | "webhook";

export interface Provider {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string;
  channels: Channel[];
  capabilities: string[] | null;
  marketplace: ProviderMarketplace | null;
  status: "builtin" | "future";
  docsUrl: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface ProviderMarketplace {
  icon?: string;
  tagline?: string;
  setupSteps?: string[];
  documentationUrl?: string;
  supportsTestMode?: boolean;
}

export interface Connector {
  id: string;
  providerSlug: string;
  projectId: string | null;
  name: string;
  description: string | null;
  status: ConnectorStatus;
  config: Record<string, unknown>;
  health: ConnectorHealthState | null;
  testResult: TestResult | null;
  lastHealthAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ConnectorHealthState {
  status: ConnectorHealth;
  checkedAt: number;
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface TestResult {
  ok: boolean;
  checkedAt: number;
  message: string;
  details?: Record<string, unknown>;
  error?: string;
}

export interface Project {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  organization: string | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface Agent {
  id: string;
  projectId: string;
  slug: string;
  name: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  status: string;
  createdAt: number;
  updatedAt: number;
}

export interface ApiKey {
  id: string;
  name: string;
  projectId: string | null;
  keyPrefix: string;
  scopes: string[] | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
  createdAt: number;
}

export interface Identity {
  id: string;
  projectId: string | null;
  agentId: string | null;
  type: IdentityType;
  value: string;
  label: string | null;
  providerSlug: string | null;
  connectorId: string | null;
  purpose: string | null;
  status: string;
  routing: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface Contact {
  id: string;
  name: string | null;
  organization: string | null;
  notes: string | null;
  tags: string[] | null;
  source: string | null;
  consentStatus: string;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface ContactMethod {
  id: string;
  contactId: string;
  type: IdentityType | Channel;
  value: string;
  label: string | null;
  isPrimary: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

export type ConversationStatus = "open" | "closed" | "archived";

export interface Conversation {
  id: string;
  projectId: string | null;
  agentId: string | null;
  contactId: string | null;
  externalId: string | null;
  topic: string | null;
  status: ConversationStatus;
  metadata: Record<string, unknown> | null;
  lastMessageAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  conversationId: string | null;
  projectId: string | null;
  agentId: string | null;
  connectorId: string | null;
  channel: Channel;
  direction: MessageDirection;
  fromIdentityId: string | null;
  fromValue: string | null;
  toIdentityId: string | null;
  toValue: string | null;
  contactId: string | null;
  subject: string | null;
  body: string | null;
  headers: Record<string, unknown> | null;
  status: MessageStatus;
  providerMessageId: string | null;
  providerStatus: string | null;
  providerError: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  approvalId: string | null;
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
  deliveredAt: number | null;
  failedAt: number | null;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  filename: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  storageKey: string | null;
  url: string | null;
  createdAt: number;
}

export interface MessageEvent {
  id: string;
  messageId: string;
  type: string;
  status: string | null;
  channel: string | null;
  providerMeta: Record<string, unknown> | null;
  createdAt: number;
}

export interface VoiceCall {
  id: string;
  projectId: string | null;
  agentId: string | null;
  connectorId: string | null;
  direction: MessageDirection;
  fromIdentityId: string | null;
  fromValue: string | null;
  toValue: string | null;
  status: CallStatus;
  durationMs: number | null;
  recordingUrl: string | null;
  recordingAvailable: boolean;
  transcript: string | null;
  transcriptStatus: string | null;
  providerCallId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
  updatedAt: number;
}

export interface VoiceSession {
  id: string;
  voiceCallId: string;
  agentId: string | null;
  state: string;
  transcriptEvents: Array<Record<string, unknown>> | null;
  handoffState: string | null;
  startedAt: number | null;
  endedAt: number | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

export interface Approval {
  id: string;
  projectId: string | null;
  agentId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  reason: string | null;
  channel: string | null;
  recipient: string | null;
  status: ApprovalStatus;
  metadata: Record<string, unknown> | null;
  requestedAt: number;
  decidedAt: number | null;
  decidedBy: string | null;
  decisionNote: string | null;
  expiresAt: number | null;
}

export interface Policy {
  id: string;
  projectId: string | null;
  agentId: string | null;
  kind: PolicyKind;
  channel: Channel | null;
  direction: MessageDirection | null;
  pattern: string | null;
  value: string | null;
  unit: string | null;
  scope: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RoutingRule {
  id: string;
  projectId: string | null;
  connectorId: string | null;
  matchType: "exact" | "prefix" | "regex" | "catch_all";
  matchValue: string | null;
  targetIdentityId: string | null;
  targetAgentId: string | null;
  targetProjectId: string | null;
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Template {
  id: string;
  projectId: string | null;
  name: string;
  channel: Channel | null;
  subject: string | null;
  body: string;
  createdAt: number;
  updatedAt: number;
}

export interface Automation {
  id: string;
  projectId: string | null;
  name: string;
  trigger: Record<string, unknown> | null;
  actions: Array<Record<string, unknown>> | null;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface UsageRecord {
  id: string;
  projectId: string | null;
  agentId: string | null;
  connectorId: string | null;
  providerSlug: string | null;
  channel: Channel;
  actionType: string;
  quantity: number;
  unit: string;
  providerUsageId: string | null;
  usageDate: string;
  createdAt: number;
}

export interface CostRecord {
  id: string;
  usageRecordId: string | null;
  projectId: string | null;
  providerSlug: string | null;
  channel: Channel | null;
  estimatedCostCents: number | null;
  actualCostCents: number | null;
  currency: string;
  pricingStatus: CostStatus;
  note: string | null;
  createdAt: number;
}

export interface AuditEvent {
  id: string;
  actorType: AuditActorType;
  actorId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: number;
}

export interface WebhookEndpoint {
  id: string;
  projectId: string | null;
  name: string;
  url: string;
  eventTypes: string[] | null;
  secret: string | null;
  headers: Record<string, string> | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WebhookReceipt {
  id: string;
  providerSlug: string;
  providerEventId: string | null;
  eventType: string | null;
  endpoint: string | null;
  status: "processed" | "duplicate" | "ignored" | "error";
  error: string | null;
  createdAt: number;
  processedAt: number | null;
}

export interface SystemEvent {
  id: string;
  type: string;
  projectId: string | null;
  agentId: string | null;
  connectorId: string | null;
  messageId: string | null;
  conversationId: string | null;
  payload: Record<string, unknown> | null;
  requestId: string | null;
  createdAt: number;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reasons: string[];
  blocked: string[];
  approvalId: string | null;
  policy?: Policy;
}

export interface ActiveLimits {
  messagesToday: number;
  callsToday: number;
  spentEstimatedCentsToday: number;
  spentEstimatedCentsMonth: number;
}