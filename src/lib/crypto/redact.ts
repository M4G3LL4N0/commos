import { sanitize } from "@/lib/utils/json";

export { sanitize };

/** Strips credential-bearing fields from a connector record before it is
 * returned to any consumer (UI/API). Preserves existence but never values. */
export function sanitizeConnector(
  c: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(c)) {
    if (k === "secret_json" || k === "secrets") {
      out[k === "secret_json" ? "secretsConfigured" : "secretsConfigured"] = Boolean(
        (v as string | undefined)?.length
      );
      continue;
    }
    if (k === "config" && v) {
      out[k] = sanitize(v);
      continue;
    }
    out[k] = sanitize(v);
  }
  return out;
}

export function redactHeaders(headers: Record<string, string | string[] | undefined>) {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /authorization|api-?key|token|secret|signature|cookie/i.test(k) ? "[redacted]" : v;
  }
  return out;
}