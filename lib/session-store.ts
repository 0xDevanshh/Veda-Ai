import type { SessionData } from "./types";

// Each API route is compiled into its own bundle, so a plain module-level Map
// would give every route its own instance and lose sessions between requests.
// Hanging it off globalThis keeps one shared Map per server process (and also
// survives dev-mode hot reloads).
const globalStore = globalThis as typeof globalThis & {
  __vedaSessions?: Map<string, SessionData>;
};

const sessions = (globalStore.__vedaSessions ??= new Map<string, SessionData>());

export function setSession(session: SessionData): void {
  sessions.set(session.sessionId, session);
}

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}
