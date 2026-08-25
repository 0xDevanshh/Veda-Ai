import type { SessionData } from "./types";

const sessions = new Map<string, SessionData>();

export function setSession(session: SessionData): void {
  sessions.set(session.sessionId, session);
}

export function getSession(sessionId: string): SessionData | undefined {
  return sessions.get(sessionId);
}
