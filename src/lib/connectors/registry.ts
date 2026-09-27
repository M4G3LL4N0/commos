import type { Channel } from "@/types/models";
import type { Connector, ConnectorMetadata } from "./types";

// =====================================================================
// Provider catalog — every provider CommOS knows about.
// `builtin` providers have working connectors; `future` providers are
// registered so the marketplace UI already knows how to render them.
// =====================================================================

export interface ProviderCatalogEntry {
  slug: string;
  name: string;
  description: string;
  category: "messaging" | "voice" | "email" | "simulation" | "chat";
  channels: Channel[];
  capabilities: string[];
  icon: string;
  status: "builtin" | "future";
  docsUrl?: string;
  setupSteps?: string[];
  sortOrder: number;
}

export const PROVIDER_CATALOG: ProviderCatalogEntry[] = [
  {
    slug: "console",
    name: "Simulation Console",
    description:
      "Local send/receive simulator. No external provider required — meant for development, tests, and dry runs.",
    category: "simulation",
    channels: ["console", "sms", "email", "imessage"],
    capabilities: ["send", "receive", "simulated", "dry_run", "webhook"],
    icon: "terminal",
    status: "builtin",
    sortOrder: 90,
  },
  {
    slug: "bluebubbles",
    name: "BlueBubbles",
    description:
      "iMessage gateway via the BlueBubbles server. Send and receive iMessage through a real BlueBubbles installation.",
    category: "messaging",
    channels: ["imessage"],
    capabilities: ["send", "receive", "webhook", "attachments", "delivery_status"],
    icon: "imessage",
    docsUrl: "https://bluebubbles.app",
    setupSteps: [
      "Install and run the BlueBubbles server",
      "Enable the private API and record its port + password",
      "Enter the server URL and password here, then Test Connection",
    ],
    status: "builtin",
    sortOrder: 10,
  },
  {
    slug: "twilio",
    name: "Twilio",
    description:
      "Programmable SMS, MMS, and voice calls through Twilio. Inbound phone numbers, delivery status, call lifecycle.",
    category: "messaging",
    channels: ["sms", "mms", "voice"],
    capabilities: ["send", "receive", "webhook", "voice", "attachments", "delivery_status", "phone_numbers"],
    icon: "twilio",
    docsUrl: "https://www.twilio.com/docs",
    setupSteps: [
      "Create a Twilio account (or use the sandbox/Test credentials)",
      "Copy Account SID and Auth Token",
      "(Optional) Buy or configure a phone number",
      "Enter credentials and Test Connection",
    ],
    status: "builtin",
    sortOrder: 20,
  },
  {
    slug: "email",
    name: "Email",
    description:
      "Outbound + inbound email with per-address provisioning. Provider-neutral connector with Resend and SMTP adapters.",
    category: "email",
    channels: ["email"],
    capabilities: ["send", "receive", "webhook", "attachments", "dynamic_addresses", "threading", "delivery_status"],
    icon: "email",
    docsUrl: "https://resend.com/docs",
    setupSteps: [
      "Choose a provider: Resend (API) or SMTP",
      "Configure your sending domain",
      "Configure the receiving webhook / forwarding address",
      "Test Connection",
    ],
    status: "builtin",
    sortOrder: 30,
  },
  {
    slug: "whatsapp",
    name: "WhatsApp",
    description: "WhatsApp Business messaging. Future connector.",
    category: "messaging",
    channels: ["whatsapp"],
    capabilities: ["send", "receive", "attachments"],
    icon: "whatsapp",
    status: "future",
    sortOrder: 40,
  },
  {
    slug: "rcs",
    name: "RCS",
    description: "Rich Communication Services. Future connector.",
    category: "messaging",
    channels: ["rcs"],
    capabilities: ["send", "receive"],
    icon: "rcs",
    status: "future",
    sortOrder: 41,
  },
  {
    slug: "telegram",
    name: "Telegram",
    description: "Telegram bot messaging. Future connector.",
    category: "messaging",
    channels: ["telegram"],
    capabilities: ["send", "receive", "attachments"],
    icon: "telegram",
    status: "future",
    sortOrder: 42,
  },
  {
    slug: "slack",
    name: "Slack",
    description: "Slack workspace messaging. Future connector.",
    category: "chat",
    channels: ["slack"],
    capabilities: ["send", "receive"],
    icon: "slack",
    status: "future",
    sortOrder: 43,
  },
  {
    slug: "discord",
    name: "Discord",
    description: "Discord server messaging. Future connector.",
    category: "chat",
    channels: ["discord"],
    capabilities: ["send", "receive", "attachments"],
    icon: "discord",
    status: "future",
    sortOrder: 44,
  },
  {
    slug: "webchat",
    name: "Web Chat",
    description: "Embedded web chat widget. Future connector.",
    category: "chat",
    channels: ["webchat"],
    capabilities: ["send", "receive"],
    icon: "chat",
    status: "future",
    sortOrder: 45,
  },
];

export function providerEntry(slug: string): ProviderCatalogEntry | undefined {
  return PROVIDER_CATALOG.find((p) => p.slug === slug);
}

// =====================================================================
// Connector registry
// =====================================================================

const _instanceRegistry = new Map<string, Connector>();

export function registerConnector(c: Connector) {
  _instanceRegistry.set(c.metadata.providerSlug, c);
}

export function getConnectorClass(providerSlug: string): Connector | undefined {
  return _instanceRegistry.get(providerSlug);
}

export function listConnectorMetadata(): ConnectorMetadata[] {
  return [..._instanceRegistry.values()].map((c) => c.metadata);
}

export function collectCatalog(): ProviderCatalogEntry[] {
  return PROVIDER_CATALOG;
}