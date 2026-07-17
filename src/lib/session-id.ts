// NOTE: keep this file free of React imports — it's a plain browser utility.
// localStorage makes it inherently browser-only (unlike src/lib/quiz and
// src/lib/engine, which are pure enough for the future mobile app too).

const STORAGE_KEY = "pb.sessionId";

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sid-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function getOrCreateSessionId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const created = randomId();
    localStorage.setItem(STORAGE_KEY, created);
    return created;
  } catch {
    // localStorage unavailable (SSR, disabled storage, private mode edge cases) —
    // return a non-persisted id so the caller never breaks.
    return randomId();
  }
}
