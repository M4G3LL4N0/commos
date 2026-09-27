export const SCHEMA_VERSION = 2;

export const DDL = `
-- =====================================================================
-- CommOS schema
-- =====================================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- ---------- Providers (static registry, seeded) ----------
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  channels TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  marketplace_json TEXT,
  status TEXT NOT NULL DEFAULT 'builtin',
  docs_url TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ---------- Connectors (configured provider instances) ----------
CREATE TABLE IF NOT EXISTS connectors (
  id TEXT PRIMARY KEY,
  provider_slug TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  config TEXT NOT NULL,
  secret_json TEXT,
  health TEXT,
  test_result TEXT,
  last_health_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_connectors_provider ON connectors(provider_slug);
CREATE INDEX IF NOT EXISTS idx_connectors_status ON connectors(status);

-- ---------- Projects / Agents (namespaces) ----------
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  organization TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  metadata_json TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(project_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_agents_project ON agents(project_id);

-- ---------- API keys (project/agent auth) ----------
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  project_id TEXT,
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes_json TEXT,
  last_used_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_keys_project ON api_keys(project_id);

-- ---------- Communication identities ----------
CREATE TABLE IF NOT EXISTS identities (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  provider_slug TEXT,
  connector_id TEXT,
  purpose TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  routing_json TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(type, value)
);
CREATE INDEX IF NOT EXISTS idx_identities_project ON identities(project_id);
CREATE INDEX IF NOT EXISTS idx_identities_agent ON identities(agent_id);

-- ---------- Contacts ----------
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  name TEXT,
  organization TEXT,
  notes TEXT,
  tags_json TEXT,
  source TEXT,
  consent_status TEXT NOT NULL DEFAULT 'unknown',
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);

CREATE TABLE IF NOT EXISTS contact_methods (
  id TEXT PRIMARY KEY,
  contact_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(type, value)
);
CREATE INDEX IF NOT EXISTS idx_cm_contact ON contact_methods(contact_id);
CREATE INDEX IF NOT EXISTS idx_cm_value ON contact_methods(value);

-- ---------- Conversations ----------
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  contact_id TEXT,
  external_id TEXT,
  topic TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  metadata_json TEXT,
  last_message_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_project ON conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_conv_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conv_lastmsg ON conversations(last_message_at);

CREATE TABLE IF NOT EXISTS conversation_participants (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  contact_id TEXT,
  identity_id TEXT,
  role TEXT DEFAULT 'participant',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cp_conversation ON conversation_participants(conversation_id);

-- ---------- Messages ----------
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  project_id TEXT,
  agent_id TEXT,
  connector_id TEXT,
  channel TEXT NOT NULL,
  direction TEXT NOT NULL,
  from_identity_id TEXT,
  from_value TEXT,
  to_identity_id TEXT,
  to_value TEXT,
  contact_id TEXT,
  subject TEXT,
  body TEXT,
  headers_json TEXT,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  provider_status TEXT,
  provider_error_json TEXT,
  metadata_json TEXT,
  approval_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  sent_at INTEGER,
  delivered_at INTEGER,
  failed_at INTEGER,
  UNIQUE(provider_message_id)
);
CREATE INDEX IF NOT EXISTS idx_msg_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_msg_project ON messages(project_id);
CREATE INDEX IF NOT EXISTS idx_msg_agent ON messages(agent_id);
CREATE INDEX IF NOT EXISTS idx_msg_contact ON messages(contact_id);
CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_msg_channel ON messages(channel);
CREATE INDEX IF NOT EXISTS idx_msg_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_msg_from ON messages(from_value);
CREATE INDEX IF NOT EXISTS idx_msg_to ON messages(to_value);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  size_bytes INTEGER,
  storage_key TEXT,
  url TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msgatt_message ON message_attachments(message_id);

CREATE TABLE IF NOT EXISTS message_events (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT,
  channel TEXT,
  provider_meta_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msgev_message ON message_events(message_id);
CREATE INDEX IF NOT EXISTS idx_msgev_created ON message_events(created_at);

-- ---------- Voice ----------
CREATE TABLE IF NOT EXISTS voice_calls (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  connector_id TEXT,
  direction TEXT NOT NULL,
  from_identity_id TEXT,
  from_value TEXT,
  to_value TEXT,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  recording_url TEXT,
  recording_available INTEGER NOT NULL DEFAULT 0,
  transcript TEXT,
  transcript_status TEXT,
  provider_call_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_calls_project ON voice_calls(project_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON voice_calls(status);

CREATE TABLE IF NOT EXISTS voice_sessions (
  id TEXT PRIMARY KEY,
  voice_call_id TEXT NOT NULL,
  agent_id TEXT,
  state TEXT NOT NULL,
  transcript_events_json TEXT,
  handoff_state TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_vs_call ON voice_sessions(voice_call_id);

-- ---------- Event log ----------
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  project_id TEXT,
  agent_id TEXT,
  connector_id TEXT,
  message_id TEXT,
  conversation_id TEXT,
  payload_json TEXT,
  request_id TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);
CREATE INDEX IF NOT EXISTS idx_events_project ON events(project_id);

-- ---------- Outbound webhooks ----------
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  event_types_json TEXT,
  secret TEXT,
  headers_json TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_endpoint_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER,
  last_error TEXT,
  response_status INTEGER,
  created_at INTEGER NOT NULL,
  delivered_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_wd_pending ON webhook_deliveries(status, next_attempt_at);

-- ---------- Inbound webhook receipts (idempotent) ----------
CREATE TABLE IF NOT EXISTS webhook_receipts (
  id TEXT PRIMARY KEY,
  provider_slug TEXT NOT NULL,
  provider_event_id TEXT,
  event_type TEXT,
  endpoint TEXT,
  raw_json TEXT,
  normalized_json TEXT,
  status TEXT NOT NULL,
  error TEXT,
  dedupe_key TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_wr_created ON webhook_receipts(created_at);

-- ---------- Approvals ----------
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  channel TEXT,
  recipient TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  metadata_json TEXT,
  requested_at INTEGER NOT NULL,
  decided_at INTEGER,
  decided_by TEXT,
  decision_note TEXT,
  expires_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_appr_project ON approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_appr_status ON approvals(status);

-- ---------- Policies ----------
CREATE TABLE IF NOT EXISTS policies (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  kind TEXT NOT NULL,
  channel TEXT,
  direction TEXT,
  pattern TEXT,
  value TEXT,
  unit TEXT,
  scope TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pol_project ON policies(project_id);
CREATE INDEX IF NOT EXISTS idx_pol_agent ON policies(agent_id);

-- ---------- Routing rules ----------
CREATE TABLE IF NOT EXISTS routing_rules (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  connector_id TEXT,
  match_type TEXT NOT NULL,
  match_value TEXT,
  target_identity_id TEXT,
  target_agent_id TEXT,
  target_project_id TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rr_enabled ON routing_rules(priority);

-- ---------- Templates ----------
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  channel TEXT,
  subject TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ---------- Automations ----------
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  name TEXT NOT NULL,
  trigger_json TEXT,
  actions_json TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- ---------- Usage / cost ----------
CREATE TABLE IF NOT EXISTS usage_records (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  agent_id TEXT,
  connector_id TEXT,
  provider_slug TEXT,
  channel TEXT NOT NULL,
  action_type TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT NOT NULL,
  provider_usage_id TEXT,
  usage_date TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_records(usage_date);
CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_records(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_records(provider_slug);

CREATE TABLE IF NOT EXISTS cost_records (
  id TEXT PRIMARY KEY,
  usage_record_id TEXT,
  project_id TEXT,
  provider_slug TEXT,
  channel TEXT,
  estimated_cost_cents INTEGER,
  actual_cost_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'usd',
  pricing_status TEXT NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_project ON cost_records(project_id);

-- ---------- Audit ----------
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  project_id TEXT,
  ip TEXT,
  user_agent TEXT,
  request_id TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_events(actor_type, actor_id);

-- ---------- Settings / rate limits / sessions ----------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  id TEXT PRIMARY KEY,
  bucket_key TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(bucket_key, window_start)
);
CREATE INDEX IF NOT EXISTS idx_rlb_key ON rate_limit_buckets(bucket_key);

CREATE TABLE IF NOT EXISTS operator_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opexp ON operator_sessions(expires_at);
`;

export const MIGRATIONS: Array<{ id: string; up: string }> = [
  {
    id: "0001-initial",
    up: DDL,
  },
  {
    id: "0002-seed-providers",
    up: `-- provider registry rows are seeded by code (seed.ts)`,
  },
];