const E164 = /^\+[1-9]\d{6,14}$/;

export function isE164(v: string): boolean {
  return E164.test(v.trim());
}

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

export function isIMessageHandle(v: string): boolean {
  const t = v.trim();
  return t.startsWith("+") || t.includes("@");
}

export function normalizePhone(v: string): string {
  let t = v.trim().replace(/[\s\-().]/g, "");
  if (t.startsWith("+")) return t;
  if (t.startsWith("011")) return "+" + t.slice(3);
  if (t === "1" || t.startsWith("1") && t.length >= 11) return "+" + t;
  return "+" + t;
}

export function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

export function normalizeHandle(v: string): string {
  return v.trim();
}

export function normalizeValue(channel: string, value: string): string {
  switch (channel) {
    case "sms":
    case "mms":
    case "voice":
    case "whatsapp":
      return normalizePhone(value);
    case "email":
      return normalizeEmail(value);
    default:
      return normalizeHandle(value);
  }
}

export function maskValue(channel: string, value: string): string {
  const n = normalizeValue(channel, value);
  if (channel === "email") {
    const [u, d] = n.split("@");
    return `${u.slice(0, 2)}…@${d}`;
  }
  if (n.startsWith("+")) {
    return `${n.slice(0, 4)}…${n.slice(-2)}`;
  }
  return `${n.slice(0, 3)}…`;
}