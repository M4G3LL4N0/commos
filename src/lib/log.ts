import { sanitize } from "@/lib/utils/json";

type Level = "debug" | "info" | "warn" | "error";

let _requestId: string | null = null;
let _quiet = false;

export function setRequestId(id: string | null) {
  _requestId = id;
}

export function setQuiet(q: boolean) {
  _quiet = q;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (_quiet) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level,
    msg,
  };
  if (_requestId) entry.requestId = _requestId;
  if (fields) for (const [k, v] of Object.entries(fields)) entry[k] = sanitize(v);
  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export const log = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit("debug", msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit("error", msg, fields),
};

export function safeError(e: unknown): { message: string; name?: string } {
  if (e instanceof Error) return { message: e.message.slice(0, 300), name: e.name };
  return { message: String(e).slice(0, 300) };
}