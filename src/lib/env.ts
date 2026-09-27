import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  try {
    const content = readFileSync(path, "utf-8");
    for (const line of content.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore unreadable env file */
  }
}

let _loaded = false;
export function loadEnv() {
  if (!_loaded) {
    loadEnvFile(join(process.cwd(), ".env.local"));
    loadEnvFile(join(process.cwd(), ".env"));
    _loaded = true;
  }
  return process.env as NodeJS.ProcessEnv;
}