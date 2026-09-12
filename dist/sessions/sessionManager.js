"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const crypto_1 = require("crypto");
/**
 * Tracks connection requests awaiting approval and established sessions.
 *
 * This is intentionally in-memory: sessions are short-lived (a support call,
 * not a persistent account relationship), and losing session state on a
 * server restart just means active calls need to be re-established, which is
 * the correct failure mode for something this security-sensitive anyway —
 * we don't want sessions surviving a server redeploy silently.
 */
class SessionManager {
    constructor() {
        this.pendingRequests = new Map();
        this.sessions = new Map();
    }
    createPendingRequest(fromDeviceId, toDeviceId) {
        const request = {
            requestId: (0, crypto_1.randomUUID)(),
            fromDeviceId,
            toDeviceId,
            createdAt: Date.now(),
        };
        this.pendingRequests.set(request.requestId, request);
        return request;
    }
    getPendingRequest(requestId) {
        return this.pendingRequests.get(requestId);
    }
    removePendingRequest(requestId) {
        this.pendingRequests.delete(requestId);
    }
    createSession(controllerDeviceId, remoteDeviceId, pendingTtlSeconds, maxDurationSeconds) {
        const now = Date.now();
        const session = {
            sessionId: (0, crypto_1.randomUUID)(),
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
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    updateState(sessionId, state) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return;
        session.state = state;
        if (state === 'connected' && session.connectedAt === null) {
            session.connectedAt = Date.now();
        }
    }
    endSession(sessionId) {
        this.sessions.delete(sessionId);
    }
    /** Called on a timer. Returns sessions that just expired so the caller can notify clients. */
    sweepExpired() {
        const now = Date.now();
        const expired = [];
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
exports.SessionManager = SessionManager;
// Connection *requests* (before approval) get a fixed, short TTL separate
// from the approved-session pending TTL — no point waiting long for a human
// to tap "Approve".
const pendingRequestTtlMs = 45000;
//# sourceMappingURL=sessionManager.js.map