"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
exports.generateDisplayDeviceId = generateDisplayDeviceId;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Short-lived, HMAC-signed session tokens.
 *
 * These are NOT JWTs (no need for the extra header/claims overhead here) —
 * just `${sessionId}.${expiresAt}.${signature}`. A device presents this
 * token on every signaling message for a session; the server verifies the
 * signature and expiry before relaying anything. This stops a third party
 * who merely guesses a sessionId from injecting SDP/ICE into someone else's
 * session.
 */
class TokenService {
    constructor(secret) {
        this.secret = secret;
        if (!secret || secret.length < 32) {
            throw new Error('SESSION_TOKEN_SECRET must be set to a random string of at least 32 characters. ' +
                'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
        }
    }
    issue(sessionId, ttlSeconds) {
        const expiresAt = Date.now() + ttlSeconds * 1000;
        const payload = `${sessionId}.${expiresAt}`;
        const signature = this.sign(payload);
        return `${payload}.${signature}`;
    }
    verify(token, expectedSessionId) {
        const parts = token.split('.');
        if (parts.length !== 3)
            return false;
        const [sessionId, expiresAtStr, signature] = parts;
        if (sessionId !== expectedSessionId)
            return false;
        const expiresAt = Number(expiresAtStr);
        if (!Number.isFinite(expiresAt) || Date.now() > expiresAt)
            return false;
        const expectedSignature = this.sign(`${sessionId}.${expiresAtStr}`);
        // Constant-time comparison to avoid timing side-channels.
        const a = Buffer.from(signature);
        const b = Buffer.from(expectedSignature);
        if (a.length !== b.length)
            return false;
        return crypto_1.default.timingSafeEqual(a, b);
    }
    sign(payload) {
        return crypto_1.default.createHmac('sha256', this.secret).update(payload).digest('hex');
    }
}
exports.TokenService = TokenService;
/**
 * Generates a display-friendly Remote ID: 9 digits, grouped as "123 456 789".
 * This is generated CLIENT-SIDE on first app launch in the real app (see
 * android/data/DeviceIdProvider.kt) — this server-side version exists only
 * for the server's own internal test/mock utilities, and is intentionally
 * identical logic so both sides agree on the format.
 */
function generateDisplayDeviceId() {
    const digits = crypto_1.default.randomInt(100000000, 999999999).toString();
    return digits;
}
//# sourceMappingURL=tokens.js.map