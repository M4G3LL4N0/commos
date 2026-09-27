import { getDb } from "@/lib/db";
import { seedProviders } from "@/lib/db/seed";
import { ensureRegistered } from "@/lib/connectors";
import { setEventEmitter } from "@/lib/db/repositories";
import { emit, startWebhookWorker } from "@/lib/events/bus";
import { settingsRepo } from "@/lib/db/repositories";
import { loadEnv } from "@/lib/env";
import { log, safeError } from "@/lib/log";

let _booted = false;

/** Idempotent process bootstrap: DB, migrations, providers, event wiring. */
export function bootstrap() {
  if (_booted) return;
  loadEnv();
  try {
    getDb();
  } catch (err) {
    log.error("database bootstrap failed", { err: safeError(err) });
    throw err;
  }
  seedProviders();
  ensureRegistered();
  setEventEmitter((ev) => emit(ev));
  startWebhookWorker();
  _booted = true;
}

export function isBooted() {
  return _booted;
}

/** First-run setup: operator password + admin API key. Returns printed creds. */
export function ensureFirstRun() {
  bootstrap();
  const needsPassword = !settingsRepo.get("operator_password_hash") && !process.env.COMMOS_OPERATOR_PASSWORD;
  return { needsPassword };
}