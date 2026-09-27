import { safeError } from "@/lib/log";

export interface HttpOptions {
  timeoutMs?: number;
}

export async function fetchJson(
  url: string,
  init: RequestInit = {},
  opts: HttpOptions = {}
): Promise<{ ok: boolean; status: number; data: unknown; error?: string }> {
  const { timeoutMs = 15000 } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
    let data: unknown = null;
    const text = await res.text().catch(() => "");
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    const e = safeError(err);
    return { ok: false, status: 0, data: null, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

export function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}