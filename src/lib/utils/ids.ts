import { ulid } from "ulid";

export function id(prefix = "id"): string {
  return `${prefix}_${ulid().toLowerCase()}`;
}

export function now(): number {
  return Date.now();
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthKey(): string {
  return new Date().toISOString().slice(0, 7);
}