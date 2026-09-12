"use strict";
/**
 * Wire protocol between Android clients and the signaling server.
 *
 * Every message is a single JSON object over one persistent WebSocket
 * connection per device. The server never inspects or stores WebRTC media —
 * it only relays SDP/ICE payloads it cannot decode meaningfully, and manages
 * the presence/approval state machine around them.
 */
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=messages.js.map