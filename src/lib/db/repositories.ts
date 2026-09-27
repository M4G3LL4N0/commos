import { getDb } from "@/lib/db";
import type {
  Agent,
  ApiKey,
  Approval,
  AuditEvent,
  Automation,
  Connector,
  Contact,
  ContactMethod,
  Conversation,
  CostRecord,
  Identity,
  Message,
  MessageAttachment,
  MessageEvent,
  Policy,
  Project,
  RoutingRule,
  SystemEvent,
  Template,
  UsageRecord,
  VoiceCall,
  VoiceSession,
  WebhookEndpoint,
  WebhookReceipt,
} from "@/types/models";
import { id, now } from "@/lib/utils/ids";
import { safeParse } from "@/lib/utils/json";
import { sanitize } from "@/lib/utils/json";

type Row = Record<string, unknown>;

import type { SQLInputValue } from "node:sqlite";

function all<T>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...(params as SQLInputValue[])) as unknown as T[];
}
function get<T>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...(params as SQLInputValue[])) as unknown as T | undefined;
}
function run(sql: string, ...params: unknown[]) {
  return getDb().prepare(sql).run(...(params as SQLInputValue[]));
}

// ---- JSON + time helpers ---------------------------------------------------
function js(v: unknown): any {
  return safeParse(v as string, null);
}

// ===========================================================================
// Projects
// ===========================================================================
export interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  organization: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

const projectCols = "id, slug, name, description, organization, status, created_at, updated_at";

function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    organization: r.organization,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const projectsRepo = {
  list(): Project[] {
    return all<ProjectRow>(`SELECT ${projectCols} FROM projects ORDER BY name`).map(mapProject);
  },
  getBySlug(slug: string): Project | undefined {
    return mapProjectOr(get<ProjectRow>(`SELECT ${projectCols} FROM projects WHERE slug = ?`, slug));
  },
  getById(id: string): Project | undefined {
    return mapProjectOr(get<ProjectRow>(`SELECT ${projectCols} FROM projects WHERE id = ?`, id));
  },
  upsert(input: { slug: string; name: string; description?: string; organization?: string }): Project {
    const existing = projectsRepo.getBySlug(input.slug);
    const ts = now();
    if (existing) {
      run(
        `UPDATE projects SET name=?, description=?, organization=?, updated_at=? WHERE id=?`,
        input.name,
        input.description ?? existing.description,
        input.organization ?? existing.organization,
        ts,
        existing.id
      );
      return projectsRepo.getById(existing.id)!;
    }
    const pid = id("prj");
    run(
      `INSERT INTO projects (id, slug, name, description, organization, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      pid,
      input.slug,
      input.name,
      input.description ?? null,
      input.organization ?? null,
      "active",
      ts,
      ts
    );
    return projectsRepo.getById(pid)!;
  },
  count(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM projects`)?.n ?? 0) as number;
  },
};

function mapProjectOr(r: ProjectRow | undefined): Project | undefined {
  return r ? mapProject(r) : undefined;
}

// ===========================================================================
// Agents
// ===========================================================================
export interface AgentRow {
  id: string;
  project_id: string;
  slug: string;
  name: string;
  description: string | null;
  metadata_json: string | null;
  status: string;
  created_at: number;
  updated_at: number;
}

const agentCols =
  "id, project_id, slug, name, description, metadata_json, status, created_at, updated_at";

function mapAgent(r: AgentRow): Agent {
  return {
    id: r.id,
    projectId: r.project_id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    metadata: js(r.metadata_json),
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const agentsRepo = {
  list(projectId?: string): Agent[] {
    const rows = projectId
      ? all<AgentRow>(`SELECT ${agentCols} FROM agents WHERE project_id = ? ORDER BY name`, projectId)
      : all<AgentRow>(`SELECT ${agentCols} FROM agents ORDER BY name`);
    return rows.map(mapAgent);
  },
  getById(agentId: string): Agent | undefined {
    const r = get<AgentRow>(`SELECT ${agentCols} FROM agents WHERE id = ?`, agentId);
    return r ? mapAgent(r) : undefined;
  },
  getBySlug(projectId: string, slug: string): Agent | undefined {
    const r = get<AgentRow>(
      `SELECT ${agentCols} FROM agents WHERE project_id = ? AND slug = ?`,
      projectId,
      slug
    );
    return r ? mapAgent(r) : undefined;
  },
  upsert(input: {
    projectId: string;
    slug: string;
    name: string;
    description?: string;
    metadata?: Record<string, unknown>;
  }): Agent {
    const existing = agentsRepo.getBySlug(input.projectId, input.slug);
    const ts = now();
    if (existing) {
      run(
        `UPDATE agents SET name=?, description=?, metadata_json=?, updated_at=? WHERE id=?`,
        input.name,
        input.description ?? existing.description,
        JSON.stringify(input.metadata ?? existing.metadata ?? {}),
        ts,
        existing.id
      );
      return agentsRepo.getById(existing.id)!;
    }
    const aid = id("agt");
    run(
      `INSERT INTO agents (id, project_id, slug, name, description, metadata_json, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      aid,
      input.projectId,
      input.slug,
      input.name,
      input.description ?? null,
      JSON.stringify(input.metadata ?? {}),
      "active",
      ts,
      ts
    );
    return agentsRepo.getById(aid)!;
  },
  count(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM agents`)?.n ?? 0) as number;
  },
};

// ===========================================================================
// Connectors
// ===========================================================================
export interface ConnectorRow {
  id: string;
  provider_slug: string;
  project_id: string | null;
  name: string;
  description: string | null;
  status: string;
  config: string;
  secret_json: string | null;
  health: string | null;
  test_result: string | null;
  last_health_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

const connectorCols =
  "id, provider_slug, project_id, name, description, status, config, secret_json, health, test_result, last_health_at, last_error, created_at, updated_at";

function mapConnector(r: ConnectorRow): Connector {
  return {
    id: r.id,
    providerSlug: r.provider_slug,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    status: r.status as Connector["status"],
    config: js(r.config) ?? {},
    health: js(r.health),
    testResult: js(r.test_result),
    lastHealthAt: r.last_health_at,
    lastError: r.last_error,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export const connectorsRepo = {
  list(): Connector[] {
    return all<ConnectorRow>(`SELECT ${connectorCols} FROM connectors ORDER BY provider_slug, name`).map(mapConnector);
  },
  listByProvider(providerSlug: string): Connector[] {
    return all<ConnectorRow>(`SELECT ${connectorCols} FROM connectors WHERE provider_slug = ? ORDER BY name`, providerSlug).map(mapConnector);
  },
  getById(cid: string): Connector | undefined {
    const r = get<ConnectorRow>(`SELECT ${connectorCols} FROM connectors WHERE id = ?`, cid);
    return r ? mapConnector(r) : undefined;
  },
  upsert(input: {
    id?: string;
    providerSlug: string;
    projectId?: string | null;
    name: string;
    description?: string | null;
    status: string;
    config: Record<string, unknown>;
    secretJson?: string | null;
  }): Connector {
    const ts = now();
    const existing = input.id ? connectorsRepo.getById(input.id) : undefined;
    const cid = existing?.id ?? id("con");
    const cfg = existing ? { ...existing.config, ...input.config } : { ...input.config };
    if (existing) {
      const marker = input.secretJson;
      const secretJson =
        marker !== undefined ? marker : connectorsRepo.getSecretJson(existing.id);
      run(
        `UPDATE connectors SET provider_slug=?, project_id=?, name=?, description=?, status=?, config=?, secret_json=?, updated_at=? WHERE id=?`,
        input.providerSlug,
        input.projectId ?? existing.projectId,
        input.name,
        input.description ?? existing.description,
        input.status,
        JSON.stringify(cfg),
        secretJson,
        ts,
        cid
      );
      return connectorsRepo.getById(cid)!;
    }
    const secretJson = input.secretJson ?? null;
    run(
      `INSERT INTO connectors (id, provider_slug, project_id, name, description, status, config, secret_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      cid,
      input.providerSlug,
      input.projectId ?? null,
      input.name,
      input.description ?? null,
      input.status,
      JSON.stringify(input.config),
      secretJson,
      ts,
      ts
    );
    return connectorsRepo.getById(cid)!;
  },
  updateStatusAndHealth(
    cid: string,
    status: string,
    health: unknown,
    lastError: string | null,
    testResult?: unknown
  ) {
    const ts = now();
    const base = `UPDATE connectors SET status=?, health=?, last_health_at=?, last_error=?, updated_at=?`;
    const params: unknown[] = [status, JSON.stringify(health ?? null), ts, lastError, ts];
    if (testResult !== undefined) {
      run(`${base}, test_result=? WHERE id=?`, ...params, JSON.stringify(testResult), cid);
    } else {
      run(`${base} WHERE id=?`, ...params, cid);
    }
  },
  patch(cid: string, patch: Partial<Pick<Connector, "name" | "description" | "status">>) {
    const ts = now();
    run(
      `UPDATE connectors SET name=?, description=?, status=?, updated_at=? WHERE id=?`,
      patch.name ?? null,
      patch.description ?? null,
      patch.status ?? null,
      ts,
      cid
    );
  },
  delete(id_: string) {
    run(`DELETE FROM connectors WHERE id = ?`, id_);
  },
  getSecretJson(cid: string): string | null {
    return get<{ secret_json: string | null }>(`SELECT secret_json FROM connectors WHERE id = ?`, cid)
      ?.secret_json ?? null;
  },
  setSecretJson(cid: string, secretJson: string | null) {
    run(`UPDATE connectors SET secret_json=?, updated_at=? WHERE id=?`, secretJson, now(), cid);
  },
};

// ===========================================================================
// API keys
// ===========================================================================
export const apiKeysRepo = {
  insert(input: {
    name: string;
    projectId: string | null;
    keyHash: string;
    keyPrefix: string;
    scopes: string[] | null;
  }): ApiKey {
    const kid = id("key");
    const ts = now();
    run(
      `INSERT INTO api_keys (id, name, project_id, key_hash, key_prefix, scopes_json, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      kid,
      input.name,
      input.projectId,
      input.keyHash,
      input.keyPrefix,
      input.scopes ? JSON.stringify(input.scopes) : null,
      ts
    );
    return apiKeysRepo.getById(kid)!;
  },
  getById(kid: string): ApiKey | undefined {
    const r = get<{
      id: string;
      name: string;
      project_id: string | null;
      key_prefix: string;
      scopes_json: string | null;
      last_used_at: number | null;
      revoked_at: number | null;
      created_at: number;
    }>(`SELECT id, name, project_id, key_prefix, scopes_json, last_used_at, revoked_at, created_at FROM api_keys WHERE id = ?`, kid);
    return r
      ? {
          id: r.id,
          name: r.name,
          projectId: r.project_id,
          keyPrefix: r.key_prefix,
          scopes: js(r.scopes_json),
          lastUsedAt: r.last_used_at,
          revokedAt: r.revoked_at,
          createdAt: r.created_at,
        }
      : undefined;
  },
  getByHash(hash: string): ApiKey | undefined {
    const r = get<{
      id: string;
      name: string;
      project_id: string | null;
      key_prefix: string;
      scopes_json: string | null;
      last_used_at: number | null;
      revoked_at: number | null;
      created_at: number;
    }>(`SELECT id, name, project_id, key_prefix, scopes_json, last_used_at, revoked_at, created_at FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL`, hash);
    return r
      ? {
          id: r.id,
          name: r.name,
          projectId: r.project_id,
          keyPrefix: r.key_prefix,
          scopes: js(r.scopes_json),
          lastUsedAt: r.last_used_at,
          revokedAt: r.revoked_at,
          createdAt: r.created_at,
        }
      : undefined;
  },
  list(): ApiKey[] {
    return all<{
      id: string;
      name: string;
      project_id: string | null;
      key_prefix: string;
      scopes_json: string | null;
      last_used_at: number | null;
      revoked_at: number | null;
      created_at: number;
    }>(`SELECT id, name, project_id, key_prefix, scopes_json, last_used_at, revoked_at, created_at FROM api_keys ORDER BY created_at DESC`).map(
      (r) => ({
        id: r.id,
        name: r.name,
        projectId: r.project_id,
        keyPrefix: r.key_prefix,
        scopes: js(r.scopes_json),
        lastUsedAt: r.last_used_at,
        revokedAt: r.revoked_at,
        createdAt: r.created_at,
      })
    );
  },
  touch(kid: string) {
    run(`UPDATE api_keys SET last_used_at=? WHERE id=?`, now(), kid);
  },
  revoke(kid: string) {
    run(`UPDATE api_keys SET revoked_at=?, last_used_at=last_used_at WHERE id=?`, now(), kid);
  },
};

// ===========================================================================
// Identities
// ===========================================================================
export const identitiesRepo = {
  list(filter?: { type?: string; projectId?: string }): Identity[] {
    let sql = `SELECT id, project_id, agent_id, type, value, label, provider_slug, connector_id, purpose, status, routing_json, metadata_json, created_at, updated_at FROM identities`;
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter?.type) {
      where.push("type = ?");
      params.push(filter.type);
    }
    if (filter?.projectId) {
      where.push("project_id = ?");
      params.push(filter.projectId);
    }
    if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
    sql += ` ORDER BY created_at DESC`;
    return all<IdentityRow>(sql, ...params).map(mapIdentity);
  },
  getById(iid: string): Identity | undefined {
    return mapIdentityOr(get<IdentityRow>(`SELECT id, project_id, agent_id, type, value, label, provider_slug, connector_id, purpose, status, routing_json, metadata_json, created_at, updated_at FROM identities WHERE id = ?`, iid));
  },
  getByTypeValue(type: string, value: string): Identity | undefined {
    return mapIdentityOr(get<IdentityRow>(`SELECT id, project_id, agent_id, type, value, label, provider_slug, connector_id, purpose, status, routing_json, metadata_json, created_at, updated_at FROM identities WHERE type = ? AND value = ?`, type, value));
  },
  upsert(input: {
    type: string;
    value: string;
    projectId?: string | null;
    agentId?: string | null;
    label?: string | null;
    providerSlug?: string | null;
    connectorId?: string | null;
    purpose?: string | null;
    status?: string;
    routing?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
  }): Identity {
    const existing = identitiesRepo.getByTypeValue(input.type, input.value);
    const ts = now();
    if (existing) {
      run(
        `UPDATE identities SET project_id=?, agent_id=?, label=?, provider_slug=?, connector_id=?, purpose=?, status=?, routing_json=?, metadata_json=?, updated_at=? WHERE id=?`,
        input.projectId ?? existing.projectId,
        input.agentId ?? existing.agentId,
        input.label ?? existing.label,
        input.providerSlug ?? existing.providerSlug,
        input.connectorId ?? existing.connectorId,
        input.purpose ?? existing.purpose,
        input.status ?? existing.status,
        JSON.stringify(input.routing ?? existing.routing ?? {}),
        JSON.stringify(input.metadata ?? existing.metadata ?? {}),
        ts,
        existing.id
      );
      return identitiesRepo.getById(existing.id)!;
    }
    const iid = id("idt");
    run(
      `INSERT INTO identities (id, project_id, agent_id, type, value, label, provider_slug, connector_id, purpose, status, routing_json, metadata_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      iid,
      input.projectId ?? null,
      input.agentId ?? null,
      input.type,
      input.value,
      input.label ?? null,
      input.providerSlug ?? null,
      input.connectorId ?? null,
      input.purpose ?? null,
      input.status ?? "active",
      JSON.stringify(input.routing ?? {}),
      JSON.stringify(input.metadata ?? {}),
      ts,
      ts
    );
    return identitiesRepo.getById(iid)!;
  },
  delete(iid: string) {
    run(`DELETE FROM identities WHERE id = ?`, iid);
  },
};

interface IdentityRow {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  type: string;
  value: string;
  label: string | null;
  provider_slug: string | null;
  connector_id: string | null;
  purpose: string | null;
  status: string;
  routing_json: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

function mapIdentity(r: IdentityRow): Identity {
  return {
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    type: r.type as Identity["type"],
    value: r.value,
    label: r.label,
    providerSlug: r.provider_slug,
    connectorId: r.connector_id,
    purpose: r.purpose,
    status: r.status,
    routing: js(r.routing_json),
    metadata: js(r.metadata_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapIdentityOr(r: IdentityRow | undefined): Identity | undefined {
  return r ? mapIdentity(r) : undefined;
}

// ===========================================================================
// Contacts + methods
// ===========================================================================
export const contactsRepo = {
  list(opts?: { q?: string; limit?: number }): Contact[] {
    const limit = opts?.limit ?? 100;
    const q = opts?.q;
    const sql = q
      ? `SELECT id, name, organization, notes, tags_json, source, consent_status, metadata_json, created_at, updated_at FROM contacts
         WHERE name LIKE ? OR organization LIKE ? OR tags_json LIKE ? ORDER BY updated_at DESC LIMIT ?`
      : `SELECT id, name, organization, notes, tags_json, source, consent_status, metadata_json, created_at, updated_at FROM contacts ORDER BY updated_at DESC LIMIT ?`;
    const rows = q
      ? all<ContactRow>(sql, `%${q}%`, `%${q}%`, `%${q}%`, limit)
      : all<ContactRow>(sql, limit);
    return rows.map(mapContact);
  },
  getById(cid: string): Contact | undefined {
    return mapContactOr(get<ContactRow>(`SELECT id, name, organization, notes, tags_json, source, consent_status, metadata_json, created_at, updated_at FROM contacts WHERE id = ?`, cid));
  },
  /** Find a contact by a normalized method value. */
  getByMethod(type: string, value: string): Contact | undefined {
    const r = get<{ contact_id: string }>(`SELECT contact_id FROM contact_methods WHERE type = ? AND value = ?`, type, value);
    return r ? contactsRepo.getById(r.contact_id) : undefined;
  },
  upsert(input: {
    name?: string | null;
    organization?: string | null;
    notes?: string | null;
    tags?: string[] | null;
    source?: string | null;
    consentStatus?: string;
    metadata?: Record<string, unknown> | null;
  }): Contact {
    const ts = now();
    const cid = id("ctc");
    run(
      `INSERT INTO contacts (id, name, organization, notes, tags_json, source, consent_status, metadata_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      cid,
      input.name ?? null,
      input.organization ?? null,
      input.notes ?? null,
      input.tags ? JSON.stringify(input.tags) : null,
      input.source ?? null,
      input.consentStatus ?? "unknown",
      JSON.stringify(input.metadata ?? {}),
      ts,
      ts
    );
    return contactsRepo.getById(cid)!;
  },
  addMethod(c: Contact, method: { type: string; value: string; label?: string | null; isPrimary?: boolean; metadata?: Record<string, unknown> | null }): ContactMethod {
    const existing = get<{ id: string }>(`SELECT id FROM contact_methods WHERE type = ? AND value = ?`, method.type, method.value);
    if (existing) {
      const cm = get<ContactMethodRow>(`SELECT * FROM contact_methods WHERE id = ?`, existing.id)!;
      return mapContactMethod(cm);
    }
    const mid = id("cma");
    const ts = now();
    run(
      `INSERT INTO contact_methods (id, contact_id, type, value, label, is_primary, metadata_json, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      mid,
      c.id,
      method.type,
      method.value,
      method.label ?? null,
      method.isPrimary ? 1 : 0,
      JSON.stringify(method.metadata ?? {}),
      ts
    );
    if (method.isPrimary) {
      run(`UPDATE contact_methods SET is_primary = 0 WHERE contact_id = ? AND id != ?`, c.id, mid);
    }
    const row = get<ContactMethodRow>(`SELECT * FROM contact_methods WHERE id = ?`, mid)!;
    return mapContactMethod(row);
  },
  methods(contactId: string): ContactMethod[] {
    return all<ContactMethodRow>(`SELECT id, contact_id, type, value, label, is_primary, metadata_json, created_at FROM contact_methods WHERE contact_id = ? ORDER BY is_primary DESC`, contactId).map(mapContactMethod);
  },
  /** Get or create contact for a method value. */
  ensureByMethod(type: string, value: string, input?: { name?: string; source?: string }): Contact {
    const existing = contactsRepo.getByMethod(type, value);
    if (existing) return existing;
    const c = contactsRepo.upsert({ name: input?.name ?? null, source: input?.source ?? "auto" });
    contactsRepo.addMethod(c, { type, value, isPrimary: true });
    return c;
  },
  update(id_: string, patch: Partial<Pick<Contact, "name" | "organization" | "notes" | "consentStatus" | "tags">>) {
    run(
      `UPDATE contacts SET name=?, organization=?, notes=?, consent_status=?, tags_json=?, updated_at=? WHERE id=?`,
      patch.name ?? null,
      patch.organization ?? null,
      patch.notes ?? null,
      patch.consentStatus ?? null,
      patch.tags ? JSON.stringify(patch.tags) : null,
      now(),
      id_
    );
  },
  count(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM contacts`)?.n ?? 0) as number;
  },
};

interface ContactRow {
  id: string;
  name: string | null;
  organization: string | null;
  notes: string | null;
  tags_json: string | null;
  source: string | null;
  consent_status: string;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}

interface ContactMethodRow {
  id: string;
  contact_id: string;
  type: string;
  value: string;
  label: string | null;
  is_primary: number;
  metadata_json: string | null;
  created_at: number;
}

function mapContact(r: ContactRow): Contact {
  return {
    id: r.id,
    name: r.name,
    organization: r.organization,
    notes: r.notes,
    tags: js(r.tags_json),
    source: r.source,
    consentStatus: r.consent_status,
    metadata: js(r.metadata_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapContactOr(r: ContactRow | undefined): Contact | undefined {
  return r ? mapContact(r) : undefined;
}
function mapContactMethod(r: ContactMethodRow): ContactMethod {
  return {
    id: r.id,
    contactId: r.contact_id,
    type: r.type as ContactMethod["type"],
    value: r.value,
    label: r.label,
    isPrimary: Boolean(r.is_primary),
    metadata: js(r.metadata_json),
    createdAt: r.created_at,
  };
}

// ===========================================================================
// Conversations
// ===========================================================================
export const conversationsRepo = {
  list(opts?: { projectId?: string; status?: string; limit?: number; offset?: number }): Conversation[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.projectId) {
      where.push("project_id = ?");
      params.push(opts.projectId);
    }
    if (opts?.status) {
      where.push("status = ?");
      params.push(opts.status);
    }
    const sql = `SELECT id, project_id, agent_id, contact_id, external_id, topic, status, metadata_json, last_message_at, created_at, updated_at FROM conversations ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT ? OFFSET ?`;
    params.push(opts?.limit ?? 100, opts?.offset ?? 0);
    return all<ConversationRow>(sql, ...params).map(mapConversation);
  },
  getById(cid: string): Conversation | undefined {
    return mapConversationOr(get<ConversationRow>(`SELECT id, project_id, agent_id, contact_id, external_id, topic, status, metadata_json, last_message_at, created_at, updated_at FROM conversations WHERE id = ?`, cid));
  },
  findForContact(contactId: string, projectId?: string | null): Conversation | undefined {
    const params: unknown[] = [contactId];
    let sql = `SELECT id, project_id, agent_id, contact_id, external_id, topic, status, metadata_json, last_message_at, created_at, updated_at FROM conversations WHERE contact_id = ?`;
    if (projectId) {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
    sql += ` ORDER BY last_message_at DESC LIMIT 1`;
    const r = get<ConversationRow>(sql, ...params);
    return r ? mapConversation(r) : undefined;
  },
  ensure(input: {
    contactId: string;
    projectId?: string | null;
    agentId?: string | null;
    topic?: string | null;
    metadata?: Record<string, unknown> | null;
  }): Conversation {
    const existing = conversationsRepo.findForContact(input.contactId, input.projectId);
    if (existing) return existing;
    const ts = now();
    const cid = id("cvs");
    run(
      `INSERT INTO conversations (id, project_id, agent_id, contact_id, external_id, topic, status, metadata_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      cid,
      input.projectId ?? null,
      input.agentId ?? null,
      input.contactId,
      null,
      input.topic ?? null,
      "open",
      JSON.stringify(input.metadata ?? {}),
      ts,
      ts
    );
    return conversationsRepo.getById(cid)!;
  },
  touch(id_: string) {
    run(`UPDATE conversations SET last_message_at=?, updated_at=? WHERE id=?`, now(), now(), id_);
  },
  updateStatus(id_: string, status: string) {
    run(`UPDATE conversations SET status=?, updated_at=? WHERE id=?`, status, now(), id_);
  },
  count(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM conversations`)?.n ?? 0) as number;
  },
  activeCount(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM conversations WHERE status = 'open'`)?.n ?? 0) as number;
  },
  addParticipant(conversationId: string, input: { contactId?: string; identityId?: string; role?: string }) {
    const ts = now();
    run(
      `INSERT INTO conversation_participants (id, conversation_id, contact_id, identity_id, role, created_at) VALUES (?,?,?,?,?,?)`,
      id("cpp"),
      conversationId,
      input.contactId ?? null,
      input.identityId ?? null,
      input.role ?? "participant",
      ts
    );
  },
};

interface ConversationRow {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  contact_id: string | null;
  external_id: string | null;
  topic: string | null;
  status: string;
  metadata_json: string | null;
  last_message_at: number | null;
  created_at: number;
  updated_at: number;
}
function mapConversation(r: ConversationRow): Conversation {
  return {
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    contactId: r.contact_id,
    externalId: r.external_id,
    topic: r.topic,
    status: r.status as Conversation["status"],
    metadata: js(r.metadata_json),
    lastMessageAt: r.last_message_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function mapConversationOr(r: ConversationRow | undefined): Conversation | undefined {
  return r ? mapConversation(r) : undefined;
}

// ===========================================================================
// Messages
// ===========================================================================
export interface MessageRow {
  id: string;
  conversation_id: string | null;
  project_id: string | null;
  agent_id: string | null;
  connector_id: string | null;
  channel: string;
  direction: string;
  from_identity_id: string | null;
  from_value: string | null;
  to_identity_id: string | null;
  to_value: string | null;
  contact_id: string | null;
  subject: string | null;
  body: string | null;
  headers_json: string | null;
  status: string;
  provider_message_id: string | null;
  provider_status: string | null;
  provider_error_json: string | null;
  metadata_json: string | null;
  approval_id: string | null;
  created_at: number;
  updated_at: number;
  sent_at: number | null;
  delivered_at: number | null;
  failed_at: number | null;
}

const messageCols = `id, conversation_id, project_id, agent_id, connector_id, channel, direction, from_identity_id, from_value, to_identity_id, to_value, contact_id, subject, body, headers_json, status, provider_message_id, provider_status, provider_error_json, metadata_json, approval_id, created_at, updated_at, sent_at, delivered_at, failed_at`;

export function mapMessage(r: MessageRow): Message {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    projectId: r.project_id,
    agentId: r.agent_id,
    connectorId: r.connector_id,
    channel: r.channel as Message["channel"],
    direction: r.direction as Message["direction"],
    fromIdentityId: r.from_identity_id,
    fromValue: r.from_value,
    toIdentityId: r.to_identity_id,
    toValue: r.to_value,
    contactId: r.contact_id,
    subject: r.subject,
    body: r.body,
    headers: js(r.headers_json),
    status: r.status as Message["status"],
    providerMessageId: r.provider_message_id,
    providerStatus: r.provider_status,
    providerError: js(r.provider_error_json),
    metadata: js(r.metadata_json),
    approvalId: r.approval_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    sentAt: r.sent_at,
    deliveredAt: r.delivered_at,
    failedAt: r.failed_at,
  };
}

export const messagesRepo = {
  insert(input: Partial<Message> & { id: string; channel: string; direction: string; status: string; createdAt?: number }): Message {
    const ts = input.createdAt ?? now();
    run(
      `INSERT INTO messages (id, conversation_id, project_id, agent_id, connector_id, channel, direction, from_identity_id, from_value, to_identity_id, to_value, contact_id, subject, body, headers_json, status, provider_message_id, provider_status, provider_error_json, metadata_json, approval_id, created_at, updated_at, sent_at, delivered_at, failed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      input.id,
      input.conversationId ?? null,
      input.projectId ?? null,
      input.agentId ?? null,
      input.connectorId ?? null,
      input.channel,
      input.direction,
      input.fromIdentityId ?? null,
      input.fromValue ?? null,
      input.toIdentityId ?? null,
      input.toValue ?? null,
      input.contactId ?? null,
      input.subject ?? null,
      input.body ?? null,
      JSON.stringify(input.headers ?? {}),
      input.status,
      input.providerMessageId ?? null,
      input.providerStatus ?? null,
      JSON.stringify(input.providerError ?? null),
      JSON.stringify(input.metadata ?? {}),
      input.approvalId ?? null,
      ts,
      ts,
      input.sentAt ?? null,
      input.deliveredAt ?? null,
      input.failedAt ?? null
    );
    return messagesRepo.getById(input.id)!;
  },
  getById(mid: string): Message | undefined {
    const r = get<MessageRow>(`SELECT ${messageCols} FROM messages WHERE id = ?`, mid);
    return r ? mapMessage(r) : undefined;
  },
  getByProviderId(providerMessageId: string): Message | undefined {
    const r = get<MessageRow>(`SELECT ${messageCols} FROM messages WHERE provider_message_id = ?`, providerMessageId);
    return r ? mapMessage(r) : undefined;
  },
  list(opts?: {
    conversationId?: string;
    contactId?: string;
    projectId?: string;
    agentId?: string;
    channel?: string;
    direction?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Message[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.conversationId) {
      where.push("conversation_id = ?");
      params.push(opts.conversationId);
    }
    if (opts?.contactId) {
      where.push("contact_id = ?");
      params.push(opts.contactId);
    }
    if (opts?.projectId) {
      where.push("project_id = ?");
      params.push(opts.projectId);
    }
    if (opts?.agentId) {
      where.push("agent_id = ?");
      params.push(opts.agentId);
    }
    if (opts?.channel) {
      where.push("channel = ?");
      params.push(opts.channel);
    }
    if (opts?.direction) {
      where.push("direction = ?");
      params.push(opts.direction);
    }
    if (opts?.status) {
      where.push("status = ?");
      params.push(opts.status);
    }
    const sql = `SELECT ${messageCols} FROM messages ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY created_at ASC LIMIT ? OFFSET ?`;
    params.push(opts?.limit ?? 100, opts?.offset ?? 0);
    return all<MessageRow>(sql, ...params).map(mapMessage);
  },
  listByConversation(conversationId: string, limit = 500): Message[] {
    return all<MessageRow>(
      `SELECT ${messageCols} FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`,
      conversationId,
      limit
    ).map(mapMessage);
  },
  updateStatus(mid: string, status: string, fields?: Partial<{ providerMessageId: string; providerStatus: string; providerError: unknown; sentAt: number; deliveredAt: number; failedAt: number; metadata: Record<string, unknown> }>) {
    const ts = now();
    if (fields?.providerMessageId !== undefined) {
      run(
        `UPDATE messages SET status=?, provider_message_id=?, provider_status=?, provider_error_json=?, sent_at=?, delivered_at=?, failed_at=?, updated_at=? WHERE id=?`,
        status,
        fields.providerMessageId,
        fields.providerStatus ?? null,
        JSON.stringify(fields.providerError ?? null),
        fields.sentAt ?? null,
        fields.deliveredAt ?? null,
        fields.failedAt ?? null,
        ts,
        mid
      );
    } else {
      run(`UPDATE messages SET status=?, updated_at=? WHERE id=?`, status, ts, mid);
    }
  },
  attachMessageEvent(mid: string, type: string, status: string | null, channel: string | null, providerMeta?: unknown) {
    const ts = now();
    run(
      `INSERT INTO message_events (id, message_id, type, status, channel, provider_meta_json, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      id("mse"),
      mid,
      type,
      status,
      channel,
      JSON.stringify(providerMeta ?? null),
      ts
    );
  },
  events(mid: string): MessageEvent[] {
    return all<{
      id: string;
      message_id: string;
      type: string;
      status: string | null;
      channel: string | null;
      provider_meta_json: string | null;
      created_at: number;
    }>(`SELECT id, message_id, type, status, channel, provider_meta_json, created_at FROM message_events WHERE message_id = ? ORDER BY created_at ASC`, mid).map(
      (r) => ({
        id: r.id,
        messageId: r.message_id,
        type: r.type,
        status: r.status,
        channel: r.channel,
        providerMeta: js(r.provider_meta_json),
        createdAt: r.created_at,
      })
    );
  },
  attachments(messageId$1: string): MessageAttachment[] {
    return all<{
      id: string;
      message_id: string;
      filename: string | null;
      content_type: string | null;
      size_bytes: number | null;
      storage_key: string | null;
      url: string | null;
      created_at: number;
    }>(`SELECT id, message_id, filename, content_type, size_bytes, storage_key, url, created_at FROM message_attachments WHERE message_id = ?`, messageId$1).map(
      (r) => ({
        id: r.id,
        messageId: r.message_id,
        filename: r.filename,
        contentType: r.content_type,
        sizeBytes: r.size_bytes,
        storageKey: r.storage_key,
        url: r.url,
        createdAt: r.created_at,
      })
    );
  },
  addAttachment(mid: string, a: { filename?: string; contentType?: string; url?: string; sizeBytes?: number }) {
    run(
      `INSERT INTO message_attachments (id, message_id, filename, content_type, size_bytes, storage_key, url, created_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      id("att"),
      mid,
      a.filename ?? null,
      a.contentType ?? null,
      a.sizeBytes ?? null,
      null,
      a.url ?? null,
      now()
    );
  },
  count(opts?: { date?: string; channel?: string; status?: string }): number {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.date) {
      where.push(`date(created_at/1000,'unixepoch','localtime') = ?`);
      params.push(opts.date);
    }
    if (opts?.channel) {
      where.push("channel = ?");
      params.push(opts.channel);
    }
    if (opts?.status) {
      where.push("status = ?");
      params.push(opts.status);
    }
    const sql = `SELECT COUNT(*) AS n FROM messages ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`;
    return (get<{ n: number }>(sql, ...params)?.n ?? 0) as number;
  },
  unreadCount(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM messages WHERE direction='inbound' AND status='received'`)?.n ?? 0) as number;
  },
  markRead(mid: string) {
    const ts = now();
    run(`UPDATE messages SET status='read', updated_at=? WHERE id=?`, ts, mid);
    messagesRepo.attachMessageEvent(mid, "message.read", "read", null);
    emitEvent({ type: "message.read", messageId: mid });
  },
  /** Mark all inbound messages in a conversation as read. */
  markConversationRead(conversationId: string) {
    const rows = all<{ id: string }>(
      `SELECT id FROM messages WHERE conversation_id = ? AND direction='inbound' AND status='received'`,
      conversationId
    );
    for (const r of rows) messagesRepo.markRead(r.id);
    return rows.length;
  },
  deleteForConversation(conversationId: string) {
    run(`DELETE FROM messages WHERE conversation_id = ?`, conversationId);
  },
  byContact(contactId: string): Message[] {
    return all<MessageRow>(`SELECT ${messageCols} FROM messages WHERE contact_id = ? ORDER BY created_at DESC LIMIT 200`, contactId).map(mapMessage);
  },
};

// ===========================================================================
// Voice
// ===========================================================================
export const voiceRepo = {
  insertCall(input: Partial<VoiceCall> & { id: string; direction: string; status: string }): VoiceCall {
    const ts = now();
    run(
      `INSERT INTO voice_calls (id, project_id, agent_id, connector_id, direction, from_identity_id, from_value, to_value, status, duration_ms, recording_url, recording_available, transcript, transcript_status, provider_call_id, metadata_json, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      input.id,
      input.projectId ?? null,
      input.agentId ?? null,
      input.connectorId ?? null,
      input.direction,
      input.fromIdentityId ?? null,
      input.fromValue ?? null,
      input.toValue ?? null,
      input.status,
      input.durationMs ?? null,
      input.recordingUrl ?? null,
      input.recordingAvailable ? 1 : 0,
      input.transcript ?? null,
      input.transcriptStatus ?? null,
      input.providerCallId ?? null,
      JSON.stringify(input.metadata ?? {}),
      ts,
      ts
    );
    return voiceRepo.getCall(input.id)!;
  },
  getCall(callId: string): VoiceCall | undefined {
    const r = get<VoiceCallRow>(`SELECT id, project_id, agent_id, connector_id, direction, from_identity_id, from_value, to_value, status, duration_ms, recording_url, recording_available, transcript, transcript_status, provider_call_id, metadata_json, created_at, updated_at FROM voice_calls WHERE id = ?`, callId);
    return r ? mapVoiceCall(r) : undefined;
  },
  updateCall(callId: string, patch: Partial<VoiceCall>) {
    const ts = now();
    const existing = voiceRepo.getCall(callId);
    if (!existing) return;
    run(
      `UPDATE voice_calls SET status=?, duration_ms=?, recording_url=?, recording_available=?, transcript=?, transcript_status=?, provider_call_id=?, metadata_json=?, updated_at=? WHERE id=?`,
      patch.status ?? existing.status,
      patch.durationMs ?? existing.durationMs,
      patch.recordingUrl ?? existing.recordingUrl,
      patch.recordingAvailable !== undefined ? (patch.recordingAvailable ? 1 : 0) : existing.recordingAvailable ? 1 : 0,
      patch.transcript ?? existing.transcript,
      patch.transcriptStatus ?? existing.transcriptStatus,
      patch.providerCallId ?? existing.providerCallId,
      JSON.stringify(patch.metadata ?? existing.metadata ?? {}),
      ts,
      callId
    );
  },
  listCalls(opts?: { limit?: number }): VoiceCall[] {
    return all<VoiceCallRow>(`SELECT id, project_id, agent_id, connector_id, direction, from_identity_id, from_value, to_value, status, duration_ms, recording_url, recording_available, transcript, transcript_status, provider_call_id, metadata_json, created_at, updated_at FROM voice_calls ORDER BY created_at DESC LIMIT ?`, opts?.limit ?? 100).map(mapVoiceCall);
  },
  upsertSession(input: Partial<VoiceSession> & { id: string; voiceCallId: string; state: string }): VoiceSession {
    const ts = now();
    run(
      `INSERT INTO voice_sessions (id, voice_call_id, agent_id, state, transcript_events_json, handoff_state, started_at, ended_at, metadata_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      input.id,
      input.voiceCallId,
      input.agentId ?? null,
      input.state,
      JSON.stringify(input.transcriptEvents ?? []),
      input.handoffState ?? null,
      input.startedAt ?? ts,
      input.endedAt ?? null,
      JSON.stringify(input.metadata ?? {}),
      ts
    );
    return voiceRepo.getSession(input.id)!;
  },
  getSession(sid: string): VoiceSession | undefined {
    const r = get<VoiceSessionRow>(`SELECT id, voice_call_id, agent_id, state, transcript_events_json, handoff_state, started_at, ended_at, metadata_json, created_at FROM voice_sessions WHERE id = ?`, sid);
    return r ? mapVoiceSession(r) : undefined;
  },
  appendTranscript(sid: string, event: Record<string, unknown>) {
    const s = voiceRepo.getSession(sid);
    if (!s) return;
    const events = [...(s.transcriptEvents ?? []), event];
    run(`UPDATE voice_sessions SET transcript_events_json=?, updated_at=? WHERE id=?`, JSON.stringify(events), now(), sid);
  },
  setHandoff(sid: string, state: string) {
    run(`UPDATE voice_sessions SET handoff_state=?, updated_at=? WHERE id=?`, state, now(), sid);
  },
  countToday(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM voice_calls WHERE date(created_at/1000,'unixepoch','localtime') = ?`, new Date().toISOString().slice(0, 10))?.n ?? 0) as number;
  },
};

interface VoiceCallRow {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  connector_id: string | null;
  direction: string;
  from_identity_id: string | null;
  from_value: string | null;
  to_value: string | null;
  status: string;
  duration_ms: number | null;
  recording_url: string | null;
  recording_available: number;
  transcript: string | null;
  transcript_status: string | null;
  provider_call_id: string | null;
  metadata_json: string | null;
  created_at: number;
  updated_at: number;
}
function mapVoiceCall(r: VoiceCallRow): VoiceCall {
  return {
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    connectorId: r.connector_id,
    direction: r.direction as VoiceCall["direction"],
    fromIdentityId: r.from_identity_id,
    fromValue: r.from_value,
    toValue: r.to_value,
    status: r.status as VoiceCall["status"],
    durationMs: r.duration_ms,
    recordingUrl: r.recording_url,
    recordingAvailable: Boolean(r.recording_available),
    transcript: r.transcript,
    transcriptStatus: r.transcript_status,
    providerCallId: r.provider_call_id,
    metadata: js(r.metadata_json),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
interface VoiceSessionRow {
  id: string;
  voice_call_id: string;
  agent_id: string | null;
  state: string;
  transcript_events_json: string | null;
  handoff_state: string | null;
  started_at: number | null;
  ended_at: number | null;
  metadata_json: string | null;
  created_at: number;
}
function mapVoiceSession(r: VoiceSessionRow): VoiceSession {
  return {
    id: r.id,
    voiceCallId: r.voice_call_id,
    agentId: r.agent_id,
    state: r.state,
    transcriptEvents: js(r.transcript_events_json),
    handoffState: r.handoff_state,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    metadata: js(r.metadata_json),
    createdAt: r.created_at,
  };
}

// ===========================================================================
// Policies
// ===========================================================================
export const policiesRepo = {
  list(opts?: { projectId?: string; agentId?: string; active?: boolean }): Policy[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.projectId) {
      where.push("project_id = ?");
      params.push(opts.projectId);
    }
    if (opts?.agentId) {
      where.push("agent_id = ?");
      params.push(opts.agentId);
    }
    if (opts?.active !== undefined) {
      where.push("active = ?");
      params.push(opts.active ? 1 : 0);
    }
    const sql = `SELECT id, project_id, agent_id, kind, channel, direction, pattern, value, unit, scope, active, created_at, updated_at FROM policies ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY kind, channel`;
    return all<PolicyRow>(sql, ...params).map(mapPolicy);
  },
  effective(projectId: string | null, agentId: string | null): Policy[] {
    const rows = all<PolicyRow>(
      `SELECT id, project_id, agent_id, kind, channel, direction, pattern, value, unit, scope, active, created_at, updated_at FROM policies
       WHERE active = 1 AND (agent_id = ? OR (agent_id IS NULL AND project_id = ?) OR (project_id IS NULL AND agent_id IS NULL))
       ORDER BY CASE WHEN agent_id IS NOT NULL THEN 0 WHEN project_id IS NOT NULL THEN 1 ELSE 2 END`,
      agentId ?? "__none__",
      projectId ?? "__none__"
    );
    return rows.map(mapPolicy);
  },
  insert(input: {
    projectId?: string | null;
    agentId?: string | null;
    kind: string;
    channel?: string | null;
    direction?: string | null;
    pattern?: string | null;
    value?: string | null;
    unit?: string | null;
    scope?: string | null;
    active?: boolean;
  }): Policy {
    const ts = now();
    const pid = id("pol");
    run(
      `INSERT INTO policies (id, project_id, agent_id, kind, channel, direction, pattern, value, unit, scope, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      pid,
      input.projectId ?? null,
      input.agentId ?? null,
      input.kind,
      input.channel ?? null,
      input.direction ?? null,
      input.pattern ?? null,
      input.value ?? null,
      input.unit ?? null,
      input.scope ?? null,
      input.active ?? true ? 1 : 0,
      ts,
      ts
    );
    return policiesRepo.getById(pid)!;
  },
  getById(pid: string): Policy | undefined {
    const r = get<PolicyRow>(`SELECT id, project_id, agent_id, kind, channel, direction, pattern, value, unit, scope, active, created_at, updated_at FROM policies WHERE id = ?`, pid);
    return r ? mapPolicy(r) : undefined;
  },
  setActive(pid: string, active: boolean) {
    run(`UPDATE policies SET active=?, updated_at=? WHERE id=?`, active ? 1 : 0, now(), pid);
  },
  delete(pid: string) {
    run(`DELETE FROM policies WHERE id = ?`, pid);
  },
};

interface PolicyRow {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  kind: string;
  channel: string | null;
  direction: string | null;
  pattern: string | null;
  value: string | null;
  unit: string | null;
  scope: string | null;
  active: number;
  created_at: number;
  updated_at: number;
}
function mapPolicy(r: PolicyRow): Policy {
  return {
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    kind: r.kind as Policy["kind"],
    channel: r.channel as Policy["channel"],
    direction: r.direction as Policy["direction"],
    pattern: r.pattern,
    value: r.value,
    unit: r.unit,
    scope: r.scope,
    active: Boolean(r.active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ===========================================================================
// Routing rules
// ===========================================================================
export const routingRulesRepo = {
  list(enabledOnly = false): RoutingRule[] {
    const sql = enabledOnly
      ? `SELECT id, project_id, connector_id, match_type, match_value, target_identity_id, target_agent_id, target_project_id, priority, enabled, created_at, updated_at FROM routing_rules WHERE enabled = 1 ORDER BY priority DESC`
      : `SELECT id, project_id, connector_id, match_type, match_value, target_identity_id, target_agent_id, target_project_id, priority, enabled, created_at, updated_at FROM routing_rules ORDER BY priority DESC`;
    return all<RoutingRuleRow>(sql).map(mapRoutingRule);
  },
  insert(input: {
    projectId?: string | null;
    connectorId?: string | null;
    matchType: string;
    matchValue?: string | null;
    targetIdentityId?: string | null;
    targetAgentId?: string | null;
    targetProjectId?: string | null;
    priority?: number;
    enabled?: boolean;
  }): RoutingRule {
    const ts = now();
    const rid = id("rtg");
    run(
      `INSERT INTO routing_rules (id, project_id, connector_id, match_type, match_value, target_identity_id, target_agent_id, target_project_id, priority, enabled, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      rid,
      input.projectId ?? null,
      input.connectorId ?? null,
      input.matchType,
      input.matchValue ?? null,
      input.targetIdentityId ?? null,
      input.targetAgentId ?? null,
      input.targetProjectId ?? null,
      input.priority ?? 0,
      input.enabled ?? true ? 1 : 0,
      ts,
      ts
    );
    return routingRulesRepo.getById(rid)!;
  },
  getById(rid: string): RoutingRule | undefined {
    const r = get<RoutingRuleRow>(`SELECT id, project_id, connector_id, match_type, match_value, target_identity_id, target_agent_id, target_project_id, priority, enabled, created_at, updated_at FROM routing_rules WHERE id = ?`, rid);
    return r ? mapRoutingRule(r) : undefined;
  },
  setEnabled(rid: string, enabled: boolean) {
    run(`UPDATE routing_rules SET enabled=?, updated_at=? WHERE id=?`, enabled ? 1 : 0, now(), rid);
  },
  delete(rid: string) {
    run(`DELETE FROM routing_rules WHERE id = ?`, rid);
  },
};

interface RoutingRuleRow {
  id: string;
  project_id: string | null;
  connector_id: string | null;
  match_type: string;
  match_value: string | null;
  target_identity_id: string | null;
  target_agent_id: string | null;
  target_project_id: string | null;
  priority: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}
function mapRoutingRule(r: RoutingRuleRow): RoutingRule {
  return {
    id: r.id,
    projectId: r.project_id,
    connectorId: r.connector_id,
    matchType: r.match_type as RoutingRule["matchType"],
    matchValue: r.match_value,
    targetIdentityId: r.target_identity_id,
    targetAgentId: r.target_agent_id,
    targetProjectId: r.target_project_id,
    priority: r.priority,
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ===========================================================================
// Approvals
// ===========================================================================
export const approvalsRepo = {
  insert(input: {
    projectId?: string | null;
    agentId?: string | null;
    actorType: string;
    actorId: string;
    action: string;
    reason?: string | null;
    channel?: string | null;
    recipient?: string | null;
    metadata?: Record<string, unknown> | null;
    expiresAt?: number | null;
  }): Approval {
    const ts = now();
    const aid = id("app");
    run(
      `INSERT INTO approvals (id, project_id, agent_id, actor_type, actor_id, action, reason, channel, recipient, status, metadata_json, requested_at, expires_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      aid,
      input.projectId ?? null,
      input.agentId ?? null,
      input.actorType,
      input.actorId,
      input.action,
      input.reason ?? null,
      input.channel ?? null,
      input.recipient ?? null,
      "pending",
      JSON.stringify(input.metadata ?? {}),
      ts,
      input.expiresAt ?? null
    );
    return approvalsRepo.getById(aid)!;
  },
  getById(aid: string): Approval | undefined {
    const r = get<ApprovalRow>(`SELECT id, project_id, agent_id, actor_type, actor_id, action, reason, channel, recipient, status, metadata_json, requested_at, decided_at, decided_by, decision_note, expires_at FROM approvals WHERE id = ?`, aid);
    return r ? mapApproval(r) : undefined;
  },
  list(opts?: { status?: string; projectId?: string }): Approval[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.status) {
      where.push("status = ?");
      params.push(opts.status);
    }
    if (opts?.projectId) {
      where.push("project_id = ?");
      params.push(opts.projectId);
    }
    const sql = `SELECT id, project_id, agent_id, actor_type, actor_id, action, reason, channel, recipient, status, metadata_json, requested_at, decided_at, decided_by, decision_note, expires_at FROM approvals ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY requested_at DESC LIMIT 200`;
    return all<ApprovalRow>(sql, ...params).map(mapApproval);
  },
  decide(aid: string, status: "approved" | "rejected", decidedBy: string, note?: string | null) {
    const ts = now();
    run(
      `UPDATE approvals SET status=?, decided_at=?, decided_by=?, decision_note=? WHERE id=?`,
      status,
      ts,
      decidedBy,
      note ?? null,
      aid
    );
  },
  expirePending() {
    run(`UPDATE approvals SET status='expired' WHERE status='pending' AND expires_at IS NOT NULL AND expires_at < ?`, now());
  },
};

interface ApprovalRow {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  actor_type: string;
  actor_id: string;
  action: string;
  reason: string | null;
  channel: string | null;
  recipient: string | null;
  status: string;
  metadata_json: string | null;
  requested_at: number;
  decided_at: number | null;
  decided_by: string | null;
  decision_note: string | null;
  expires_at: number | null;
}
function mapApproval(r: ApprovalRow): Approval {
  return {
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    actorType: r.actor_type,
    actorId: r.actor_id,
    action: r.action,
    reason: r.reason,
    channel: r.channel,
    recipient: r.recipient,
    status: r.status as Approval["status"],
    metadata: js(r.metadata_json),
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
    decisionNote: r.decision_note,
    expiresAt: r.expires_at,
  };
}

// ===========================================================================
// Usage / cost
// ===========================================================================
export const usageRepo = {
  record(input: {
    projectId?: string | null;
    agentId?: string | null;
    connectorId?: string | null;
    providerSlug?: string | null;
    channel: string;
    actionType: string;
    quantity?: number;
    unit?: string;
    providerUsageId?: string | null;
    usageDate?: string;
  }): UsageRecord | undefined {
    const ts = now();
    const uid = id("use");
    const date = input.usageDate ?? new Date().toISOString().slice(0, 10);
    run(
      `INSERT INTO usage_records (id, project_id, agent_id, connector_id, provider_slug, channel, action_type, quantity, unit, provider_usage_id, usage_date, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      uid,
      input.projectId ?? null,
      input.agentId ?? null,
      input.connectorId ?? null,
      input.providerSlug ?? null,
      input.channel,
      input.actionType,
      input.quantity ?? 1,
      input.unit ?? "message",
      input.providerUsageId ?? null,
      date,
      ts
    );
    return { id: uid, ...input } as unknown as UsageRecord;
  },
  lastId(): string {
    const r = get<{ id: string }>(`SELECT id FROM usage_records ORDER BY created_at DESC LIMIT 1`);
    return r?.id ?? "";
  },
  /** Rollup by day for a given action/channel. */
  todayCount(channel: string, actionType?: string, projectId?: string): number {
    const params: unknown[] = [new Date().toISOString().slice(0, 10)];
    let sql = `SELECT COALESCE(SUM(quantity),0) AS n FROM usage_records WHERE usage_date = ?`;
    if (channel) {
      sql += ` AND channel = ?`;
      params.push(channel);
    }
    if (actionType) {
      sql += ` AND action_type = ?`;
      params.push(actionType);
    }
    if (projectId) {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
    return Number(get<{ n: number }>(sql, ...params)?.n ?? 0);
  },
  getUsageRecord(uid: string): UsageRecord | undefined {
    const r = get<UsageRow>(`SELECT id, project_id, agent_id, connector_id, provider_slug, channel, action_type, quantity, unit, provider_usage_id, usage_date, created_at FROM usage_records WHERE id = ?`, uid);
    return r ? mapUsageRecord(r) : undefined;
  },
  countSince(channel: string, since: number, opts?: { projectId?: string | null; agentId?: string | null }): number {
    const params: unknown[] = [channel, since];
    let sql = `SELECT COALESCE(SUM(quantity),0) AS n FROM usage_records WHERE channel = ? AND created_at >= ?`;
    if (opts?.projectId) {
      sql += ` AND project_id = ?`;
      params.push(opts.projectId);
    }
    if (opts?.agentId) {
      sql += ` AND agent_id = ?`;
      params.push(opts.agentId);
    }
    return Number(get<{ n: number }>(sql, ...params)?.n ?? 0);
  },
  summarize(opts?: { days?: number }): Array<{ usageDate: string; channel: string; actionType: string; quantity: number }> {
    const days = opts?.days ?? 30;
    const since = Date.now() - days * 86400000;
    return all<{ usage_date: string; channel: string; action_type: string; quantity: number }>(
      `SELECT usage_date, channel, action_type, SUM(quantity) AS quantity FROM usage_records
       WHERE created_at >= ? GROUP BY usage_date, channel, action_type ORDER BY usage_date DESC`,
      since
    ).map((r) => ({ usageDate: r.usage_date, channel: r.channel, actionType: r.action_type, quantity: r.quantity }));
  },
};

interface UsageRow {
  id: string;
  project_id: string | null;
  agent_id: string | null;
  connector_id: string | null;
  provider_slug: string | null;
  channel: string;
  action_type: string;
  quantity: number;
  unit: string;
  provider_usage_id: string | null;
  usage_date: string;
  created_at: number;
}
function mapUsageRecord(r: UsageRow): UsageRecord {
  return {
    id: r.id,
    projectId: r.project_id,
    agentId: r.agent_id,
    connectorId: r.connector_id,
    providerSlug: r.provider_slug,
    channel: r.channel as UsageRecord["channel"],
    actionType: r.action_type,
    quantity: r.quantity,
    unit: r.unit,
    providerUsageId: r.provider_usage_id,
    usageDate: r.usage_date,
    createdAt: r.created_at,
  };
}

export const costRepo = {
  record(input: {
    usageRecordId: string;
    projectId?: string | null;
    providerSlug?: string | null;
    channel?: string | null;
    estimatedCostCents?: number | null;
    actualCostCents?: number | null;
    pricingStatus?: string;
    note?: string | null;
  }): CostRecord {
    const ts = now();
    const cid = id("cst");
    const status = input.pricingStatus ?? (input.estimatedCostCents != null ? "estimated" : "unavailable");
    run(
      `INSERT INTO cost_records (id, usage_record_id, project_id, provider_slug, channel, estimated_cost_cents, actual_cost_cents, currency, pricing_status, note, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      cid,
      input.usageRecordId,
      input.projectId ?? null,
      input.providerSlug ?? null,
      input.channel ?? null,
      input.estimatedCostCents ?? null,
      input.actualCostCents ?? null,
      "usd",
      status,
      input.note ?? null,
      ts
    );
    return costRepo.getById(cid)!;
  },
  getById(cid: string): CostRecord | undefined {
    const r = get<CostRow>(`SELECT id, usage_record_id, project_id, provider_slug, channel, estimated_cost_cents, actual_cost_cents, currency, pricing_status, note, created_at FROM cost_records WHERE id = ?`, cid);
    return r
      ? {
          id: r.id,
          usageRecordId: r.usage_record_id,
          projectId: r.project_id,
          providerSlug: r.provider_slug,
          channel: r.channel as CostRecord["channel"],
          estimatedCostCents: r.estimated_cost_cents,
          actualCostCents: r.actual_cost_cents,
          currency: r.currency,
          pricingStatus: r.pricing_status as CostRecord["pricingStatus"],
          note: r.note,
          createdAt: r.created_at,
        }
      : undefined;
  },
  spendSince(since: number, projectId?: string | null): number {
    const params: unknown[] = [since];
    let sql = `SELECT COALESCE(SUM(COALESCE(actual_cost_cents, estimated_cost_cents, 0)), 0) AS n FROM cost_records WHERE created_at >= ?`;
    if (projectId) {
      sql += ` AND project_id = ?`;
      params.push(projectId);
    }
    return Number(get<{ n: number }>(sql, ...params)?.n ?? 0);
  },
  recent(limit = 100): CostRecord[] {
    return all<CostRow>(`SELECT id, usage_record_id, project_id, provider_slug, channel, estimated_cost_cents, actual_cost_cents, currency, pricing_status, note, created_at FROM cost_records ORDER BY created_at DESC LIMIT ?`, limit).map(
      (r) => ({
        id: r.id,
        usageRecordId: r.usage_record_id,
        projectId: r.project_id,
        providerSlug: r.provider_slug,
        channel: r.channel as CostRecord["channel"],
        estimatedCostCents: r.estimated_cost_cents,
        actualCostCents: r.actual_cost_cents,
        currency: r.currency,
        pricingStatus: r.pricing_status as CostRecord["pricingStatus"],
        note: r.note,
        createdAt: r.created_at,
      })
    );
  },
};

interface CostRow {
  id: string;
  usage_record_id: string | null;
  project_id: string | null;
  provider_slug: string | null;
  channel: string | null;
  estimated_cost_cents: number | null;
  actual_cost_cents: number | null;
  currency: string;
  pricing_status: string;
  note: string | null;
  created_at: number;
}

// ===========================================================================
// Audit
// ===========================================================================
export const auditRepo = {
  record(input: {
    actorType: string;
    actorId?: string | null;
    action: string;
    resourceType?: string | null;
    resourceId?: string | null;
    projectId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    requestId?: string | null;
    metadata?: Record<string, unknown> | null;
  }): AuditEvent {
    const ts = now();
    const aid = id("aud");
    run(
      `INSERT INTO audit_events (id, actor_type, actor_id, action, resource_type, resource_id, project_id, ip, user_agent, request_id, metadata_json, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      aid,
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.resourceType ?? null,
      input.resourceId ?? null,
      input.projectId ?? null,
      input.ip ?? null,
      input.userAgent ?? null,
      input.requestId ?? null,
      JSON.stringify(sanitize(input.metadata ?? {})),
      ts
    );
    return auditRepo.getById(aid)!;
  },
  getById(aid: string): AuditEvent | undefined {
    const r = get<AuditRow>(`SELECT id, actor_type, actor_id, action, resource_type, resource_id, project_id, ip, user_agent, request_id, metadata_json, created_at FROM audit_events WHERE id = ?`, aid);
    return r ? mapAudit(r) : undefined;
  },
  list(opts?: { limit?: number; action?: string; resourceType?: string; projectId?: string }): AuditEvent[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.action) {
      where.push("action = ?");
      params.push(opts.action);
    }
    if (opts?.resourceType) {
      where.push("resource_type = ?");
      params.push(opts.resourceType);
    }
    if (opts?.projectId) {
      where.push("project_id = ?");
      params.push(opts.projectId);
    }
    const sql = `SELECT id, actor_type, actor_id, action, resource_type, resource_id, project_id, ip, user_agent, request_id, metadata_json, created_at FROM audit_events ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY created_at DESC LIMIT ?`;
    params.push(opts?.limit ?? 200);
    return all<AuditRow>(sql, ...params).map(mapAudit);
  },
  count(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_events`)?.n ?? 0) as number;
  },
};

interface AuditRow {
  id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  project_id: string | null;
  ip: string | null;
  user_agent: string | null;
  request_id: string | null;
  metadata_json: string | null;
  created_at: number;
}
function mapAudit(r: AuditRow): AuditEvent {
  return {
    id: r.id,
    actorType: r.actor_type as AuditEvent["actorType"],
    actorId: r.actor_id,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    projectId: r.project_id,
    ip: r.ip,
    userAgent: r.user_agent,
    requestId: r.request_id,
    metadata: js(r.metadata_json),
    createdAt: r.created_at,
  };
}

// ===========================================================================
// Webhooks (outbound endpoints + inbound receipts)
// ===========================================================================
export const webhookRepo = {
  listEndpoints(opts?: { projectId?: string }): WebhookEndpoint[] {
    const rows = opts?.projectId
      ? all<WhEndRow>(`SELECT * FROM webhook_endpoints WHERE project_id = ? ORDER BY created_at DESC`, opts.projectId)
      : all<WhEndRow>(`SELECT * FROM webhook_endpoints ORDER BY created_at DESC`);
    return rows.map(mapWebhookEndpoint);
  },
  getEndpoint(id_: string): WebhookEndpoint | undefined {
    const r = get<WhEndRow>(`SELECT * FROM webhook_endpoints WHERE id = ?`, id_);
    return r ? mapWebhookEndpoint(r) : undefined;
  },
  insertEndpoint(input: {
    projectId?: string | null;
    name: string;
    url: string;
    eventTypes?: string[] | null;
    secret?: string | null;
    headers?: Record<string, string> | null;
    active?: boolean;
  }): WebhookEndpoint {
    const ts = now();
    const wid = id("whk");
    run(
      `INSERT INTO webhook_endpoints (id, project_id, name, url, event_types_json, secret, headers_json, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      wid,
      input.projectId ?? null,
      input.name,
      input.url,
      JSON.stringify(input.eventTypes ?? []),
      input.secret ?? null,
      JSON.stringify(input.headers ?? {}),
      input.active ?? true ? 1 : 0,
      ts,
      ts
    );
    return webhookRepo.getEndpoint(wid)!;
  },
  recordReceipt(input: {
    providerSlug: string;
    providerEventId?: string | null;
    eventType?: string | null;
    endpoint?: string | null;
    rawJson: string;
    normalizedJson?: string | null;
    status: string;
    error?: string | null;
    dedupeKey?: string | null;
  }): { id: string; status: string; duplicate: boolean } {
    const ts = now();
    if (input.dedupeKey) {
      const existing = get<{ id: string; status: string }>(`SELECT id, status FROM webhook_receipts WHERE dedupe_key = ?`, input.dedupeKey);
      if (existing) return { id: existing.id, status: existing.status, duplicate: true };
    }
    const wid = id("whr");
    run(
      `INSERT INTO webhook_receipts (id, provider_slug, provider_event_id, event_type, endpoint, raw_json, normalized_json, status, error, dedupe_key, created_at, processed_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      wid,
      input.providerSlug,
      input.providerEventId ?? null,
      input.eventType ?? null,
      input.endpoint ?? null,
      input.rawJson,
      input.normalizedJson ?? null,
      input.status,
      input.error ?? null,
      input.dedupeKey ?? null,
      ts,
      input.status === "processed" ? ts : null
    );
    return { id: wid, status: input.status, duplicate: false };
  },
  receipts(opts?: { limit?: number }): WebhookReceipt[] {
    return all<WhRecRow>(`SELECT id, provider_slug, provider_event_id, event_type, endpoint, status, error, created_at, processed_at FROM webhook_receipts ORDER BY created_at DESC LIMIT ?`, opts?.limit ?? 100).map(
      (r) => ({
        id: r.id,
        providerSlug: r.provider_slug,
        providerEventId: r.provider_event_id,
        eventType: r.event_type,
        endpoint: r.endpoint,
        status: r.status as WebhookReceipt["status"],
        error: r.error,
        createdAt: r.created_at,
        processedAt: r.processed_at,
      })
    );
  },
  markReceiptProcessed(id_: string) {
    run(`UPDATE webhook_receipts SET status='processed', processed_at=? WHERE id=?`, now(), id_);
  },
  markReceiptError(id_: string, error: string) {
    run(`UPDATE webhook_receipts SET status='error', error=?, processed_at=? WHERE id=?`, error, now(), id_);
  },
  enqueueDelivery(input: { webhookEndpointId: string; eventId: string }) {
    const ts = now();
    run(
      `INSERT INTO webhook_deliveries (id, webhook_endpoint_id, event_id, status, attempts, next_attempt_at, created_at)
       VALUES (?,?,?,?,?,?,?)`,
      id("whd"),
      input.webhookEndpointId,
      input.eventId,
      "pending",
      0,
      ts,
      ts
    );
  },
  pendingDeliveries(limit = 50): Array<{ id: string; webhookEndpointId: string; eventId: string; attempts: number }> {
    return all<{ id: string; webhook_endpoint_id: string; event_id: string; attempts: number }>(
      `SELECT id, webhook_endpoint_id, event_id, attempts FROM webhook_deliveries WHERE status='pending' AND next_attempt_at <= ? ORDER BY created_at ASC LIMIT ?`,
      now(),
      limit
    ).map((r) => ({ id: r.id, webhookEndpointId: r.webhook_endpoint_id, eventId: r.event_id, attempts: r.attempts }));
  },
  updateDelivery(id_: string, patch: { status: string; nextAttemptAt?: number; lastError?: string | null; responseStatus?: number | null; deliveredAt?: number | null }) {
    const current = get<{ attempts: number }>(`SELECT attempts FROM webhook_deliveries WHERE id = ?`, id_);
    const attempts = (current?.attempts ?? 0) + (patch.status === "delivered" ? 0 : 1);
    run(
      `UPDATE webhook_deliveries SET status=?, attempts=?, next_attempt_at=?, last_error=?, response_status=?, delivered_at=? WHERE id=?`,
      patch.status,
      attempts,
      patch.nextAttemptAt ?? null,
      patch.lastError ?? null,
      patch.responseStatus ?? null,
      patch.deliveredAt ?? null,
      id_
    );
  },
};

interface WhEndRow {
  id: string;
  project_id: string | null;
  name: string;
  url: string;
  event_types_json: string | null;
  secret: string | null;
  headers_json: string | null;
  active: number;
  created_at: number;
  updated_at: number;
}
function mapWebhookEndpoint(r: WhEndRow): WebhookEndpoint {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    url: r.url,
    eventTypes: js(r.event_types_json),
    secret: r.secret,
    headers: js(r.headers_json),
    active: Boolean(r.active),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
interface WhRecRow {
  id: string;
  provider_slug: string;
  provider_event_id: string | null;
  event_type: string | null;
  endpoint: string | null;
  status: string;
  error: string | null;
  created_at: number;
  processed_at: number | null;
}

// ===========================================================================
// Templates
// ===========================================================================
export const templatesRepo = {
  list(projectId?: string | null): Template[] {
    const rows = projectId
      ? all<TemplateRow>(`SELECT * FROM templates WHERE project_id = ? ORDER BY name`, projectId)
      : all<TemplateRow>(`SELECT * FROM templates ORDER BY name`);
    return rows.map(mapTemplate);
  },
  insert(input: { projectId?: string | null; name: string; channel?: string | null; subject?: string | null; body: string }): Template {
    const ts = now();
    const tid = id("tpl");
    run(
      `INSERT INTO templates (id, project_id, name, channel, subject, body, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      tid,
      input.projectId ?? null,
      input.name,
      input.channel ?? null,
      input.subject ?? null,
      input.body,
      ts,
      ts
    );
    return mapTemplate(get<TemplateRow>(`SELECT * FROM templates WHERE id = ?`, tid)!);
  },
};

interface TemplateRow {
  id: string;
  project_id: string | null;
  name: string;
  channel: string | null;
  subject: string | null;
  body: string;
  created_at: number;
  updated_at: number;
}
function mapTemplate(r: TemplateRow): Template {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    channel: r.channel as Template["channel"],
    subject: r.subject,
    body: r.body,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ===========================================================================
// Automations
// ===========================================================================
export const automationsRepo = {
  list(projectId?: string | null): Automation[] {
    const rows = projectId
      ? all<AutomationRow>(`SELECT * FROM automations WHERE project_id = ? ORDER BY name`, projectId)
      : all<AutomationRow>(`SELECT * FROM automations ORDER BY name`);
    return rows.map(mapAutomation);
  },
  insert(input: { projectId?: string | null; name: string; trigger?: Record<string, unknown> | null; actions?: Array<Record<string, unknown>> | null; enabled?: boolean }): Automation {
    const ts = now();
    const aid = id("aut");
    run(
      `INSERT INTO automations (id, project_id, name, trigger_json, actions_json, enabled, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`,
      aid,
      input.projectId ?? null,
      input.name,
      JSON.stringify(input.trigger ?? {}),
      JSON.stringify(input.actions ?? []),
      input.enabled ?? true ? 1 : 0,
      ts,
      ts
    );
    return mapAutomation(get<AutomationRow>(`SELECT * FROM automations WHERE id = ?`, aid)!);
  },
};

interface AutomationRow {
  id: string;
  project_id: string | null;
  name: string;
  trigger_json: string | null;
  actions_json: string | null;
  enabled: number;
  created_at: number;
  updated_at: number;
}
function mapAutomation(r: AutomationRow): Automation {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    trigger: js(r.trigger_json),
    actions: js(r.actions_json),
    enabled: Boolean(r.enabled),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ===========================================================================
// Settings
// ===========================================================================
export const settingsRepo = {
  get(key: string): string | null {
    return get<{ value: string | null }>(`SELECT value FROM settings WHERE key = ?`, key)?.value ?? null;
  },
  set(key: string, value: string) {
    run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?,?,?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`,
      key,
      value,
      now()
    );
  },
};

// ===========================================================================
// Rate limit buckets
// ===========================================================================
export const rateLimitRepo = {
  incr(key: string, windowStart: number, windowEnd: number): number {
    run(
      `INSERT INTO rate_limit_buckets (id, bucket_key, window_start, window_end, count) VALUES (?,?,?,?,1)
       ON CONFLICT(bucket_key, window_start) DO UPDATE SET count = count + 1`,
      id("rlb"),
      key,
      windowStart,
      windowEnd
    );
    return Number(
      get<{ count: number }>(`SELECT count FROM rate_limit_buckets WHERE bucket_key = ? AND window_start = ?`, key, windowStart)?.count ?? 0
    );
  },
  count(key: string, windowStart: number): number {
    return Number(get<{ count: number }>(`SELECT count FROM rate_limit_buckets WHERE bucket_key = ? AND window_start = ?`, key, windowStart)?.count ?? 0);
  },
};

// ===========================================================================
// System events → type mapping (avoid circular imports)
// ===========================================================================
let _emitEventFn:
  | ((ev: { type: string; projectId?: string | null; agentId?: string | null; connectorId?: string | null; messageId?: string | null; conversationId?: string | null; payload?: Record<string, unknown> | null }) => Promise<void> | void)
  | null = null;
export function setEventEmitter(fn: typeof _emitEventFn) {
  _emitEventFn = fn;
}
export function emitEvent(ev: {
  type: string;
  projectId?: string | null;
  agentId?: string | null;
  connectorId?: string | null;
  messageId?: string | null;
  conversationId?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> | void {
  if (_emitEventFn) return _emitEventFn(ev);
}

// Re-export shared bits
export { emitEvent as emitSystemEvent };

// System events public store functions used by the bus
export const systemEventsRepo = {
  insert(ev: SystemEvent): void {
    run(
      `INSERT INTO events (id, type, project_id, agent_id, connector_id, message_id, conversation_id, payload_json, request_id, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ev.id,
      ev.type,
      ev.projectId ?? null,
      ev.agentId ?? null,
      ev.connectorId ?? null,
      ev.messageId ?? null,
      ev.conversationId ?? null,
      JSON.stringify(sanitize(ev.payload ?? {})),
      ev.requestId ?? null,
      ev.createdAt
    );
  },
  getById(id_: string): SystemEvent | undefined {
    const r = get<SystemEventRow>(
      `SELECT id, type, project_id, agent_id, connector_id, message_id, conversation_id, payload_json, request_id, created_at FROM events WHERE id = ?`,
      id_
    );
    return r ? mapSystemEvent(r) : undefined;
  },
  list(opts?: { limit?: number; type?: string }): SystemEvent[] {
    const where: string[] = [];
    const params: unknown[] = [];
    if (opts?.type) {
      where.push("type = ?");
      params.push(opts.type);
    }
    const sql = `SELECT id, type, project_id, agent_id, connector_id, message_id, conversation_id, payload_json, request_id, created_at FROM events ${
      where.length ? `WHERE ${where.join(" AND ")}` : ""
    } ORDER BY created_at DESC LIMIT ?`;
    params.push(opts?.limit ?? 100);
    return all<SystemEventRow>(sql, ...params).map((r) => mapSystemEvent(r));
  },
  count(): number {
    return (get<{ n: number }>(`SELECT COUNT(*) AS n FROM events`)?.n ?? 0) as number;
  },
};

function mapSystemEvent(r: SystemEventRow): SystemEvent {
  return {
    id: r.id,
    type: r.type,
    projectId: r.project_id,
    agentId: r.agent_id,
    connectorId: r.connector_id,
    messageId: r.message_id,
    conversationId: r.conversation_id,
    payload: js(r.payload_json),
    requestId: r.request_id,
    createdAt: r.created_at,
  };
}

interface SystemEventRow {
  id: string;
  type: string;
  project_id: string | null;
  agent_id: string | null;
  connector_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
  payload_json: string | null;
  request_id: string | null;
  created_at: number;
}