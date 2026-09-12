import { randomUUID } from 'crypto';
import type { SessionState } from '../types/messages';

export interface PendingRequest {
  requestId: string;
  fromDeviceId: string; // controller
  toDeviceId: string; // remote device
  createdAt: number;
}

export interface Session {
  sessionId: string;
  controllerDeviceId: string;
  remoteDeviceId: string;
  state: SessionState;
  createdAt: number;
  /** Pending-approval token expiry — if WebRTC isn't established by then, the session is dropped. */
  pendingExpiresAt: number;
  /** Absolute hard cutoff regardless of activity, to prevent indefinite unattended access. */
  maxDurationExpiresAt: number;
  connectedAt: number | null;
}

/**
 * Tracks connection requests awaiting approval and established sessions.
 *
 * This is intentionally in-memory: sessions are short-lived (a support call,
 * not a persistent account relationship), and losing session state on a
 * server restart just means active calls need to be re-established, which is
 * the correct failure mode for something this security-sensitive anyway —
 * we don't want sessions surviving a server redeploy silently.
 */
export class SessionManager {
  private pendingRequests = new Map<string, PendingRequest>();
  private sessions = new Map<string, Session>();

  createPendingRequest(fromDeviceId: string, toDeviceId: string): PendingRequest {
    const request: PendingRequest = {
      requestId: randomUUID(),
      fromDeviceId,
      toDeviceId,
      createdAt: Date.now(),
    };
    this.pendingRequests.set(request.requestId, request);
    return request;
  }

  getPendingRequest(requestId: string): PendingRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  removePendingRequest(requestId: string): void {
    this.pendingRequests.delete(requestId);
  }

  createSession(
    controllerDeviceId: string,
    remoteDeviceId: string,
    pendingTtlSeconds: number,
    maxDurationSeconds: number
  ): Session {
    const now = Date.now();
    const session: Session = {
      sessionId: randomUUID(),
      controllerDeviceId,
      remoteDeviceId,
      state: 'approved',
      createdAt: now,
      pendingExpiresAt: now + pendingTtlSeconds * 1000,
      maxDurationExpiresAt: now + maxDurationSeconds * 1000,
      connectedAt: null,
    };
    this.sessions.set(session.sessionId, session);
    return session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  updateState(sessionId: string, state: SessionState): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    session.state = state;
    if (state === 'connected' && session.connectedAt === null) {
      session.connectedAt = Date.now();
    }
  }

  endSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Called on a timer. Returns sessions that just expired so the caller can notify clients. */
  sweepExpired(): Session[] {
    const now = Date.now();
    const expired: Session[] = [];
    for (const session of this.sessions.values()) {
      const neverConnected = session.state !== 'connected' && now > session.pendingExpiresAt;
      const pastMaxDuration = now > session.maxDurationExpiresAt;
      if (neverConnected || pastMaxDuration) {
        expired.push(session);
      }
    }
    for (const session of expired) {
      this.sessions.delete(session.sessionId);
    }

    // Also clear stale pending requests (never approved/rejected within TTL).
    for (const [id, req] of this.pendingRequests.entries()) {
      if (now - req.createdAt > pendingRequestTtlMs) {
        this.pendingRequests.delete(id);
      }
    }

    return expired;
  }
}

// Connection *requests* (before approval) get a fixed, short TTL separate
// from the approved-session pending TTL — no point waiting long for a human
// to tap "Approve".
const pendingRequestTtlMs = 45_000;
