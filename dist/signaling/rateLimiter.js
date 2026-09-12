"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiter = void 0;
/**
 * Minimal in-memory sliding-window rate limiter, keyed by device ID.
 *
 * Good enough for a single-process signaling server. If you horizontally
 * scale the server behind a load balancer, replace this with a shared store
 * (e.g. Redis) so limits apply across instances — noted in README.
 */
class RateLimiter {
    constructor(maxRequests, windowSeconds) {
        this.maxRequests = maxRequests;
        this.windowSeconds = windowSeconds;
        this.hits = new Map();
    }
    /** Returns true if the request is allowed, false if the caller is over the limit. */
    tryConsume(key) {
        const now = Date.now();
        const windowStart = now - this.windowSeconds * 1000;
        const timestamps = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
        if (timestamps.length >= this.maxRequests) {
            this.hits.set(key, timestamps);
            return false;
        }
        timestamps.push(now);
        this.hits.set(key, timestamps);
        return true;
    }
    /** Periodic cleanup so the map doesn't grow unbounded with stale device IDs. */
    sweep() {
        const windowStart = Date.now() - this.windowSeconds * 1000;
        for (const [key, timestamps] of this.hits.entries()) {
            const fresh = timestamps.filter((t) => t > windowStart);
            if (fresh.length === 0) {
                this.hits.delete(key);
            }
            else {
                this.hits.set(key, fresh);
            }
        }
    }
}
exports.RateLimiter = RateLimiter;
//# sourceMappingURL=rateLimiter.js.map