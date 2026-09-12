"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.attachSignalingServer = attachSignalingServer;
const ws_1 = require("ws");
const deviceRegistry_1 = require("../devices/deviceRegistry");
const sessionManager_1 = require("../sessions/sessionManager");
const tokens_1 = require("../auth/tokens");
const rateLimiter_1 = require("./rateLimiter");
const DEVICE_ID_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
function attachSignalingServer(httpServer, config) {
    const wss = new ws_1.WebSocketServer({ server: httpServer, path: '/ws' });
    const devices = new deviceRegistry_1.DeviceRegistry();
    const sessions = new sessionManager_1.SessionManager();
    const tokens = new tokens_1.TokenService(config.tokenSecret);
    const rateLimiter = new rateLimiter_1.RateLimiter(config.rateLimitMaxRequests, config.rateLimitWindowSeconds);
    // Periodic sweep: drop expired pending sessions/requests and notify affected clients.
    const sweepInterval = setInterval(() => {
        rateLimiter.sweep();
        const expiredSessions = sessions.sweepExpired();
        for (const session of expiredSessions) {
            devices.setActiveSession(session.controllerDeviceId, null);
            devices.setActiveSession(session.remoteDeviceId, null);
            const reason = session.state === 'connected' ? 'max_duration_reached' : 'expired';
            sendTo(devices, session.controllerDeviceId, { type: 'session_ended', sessionId: session.sessionId, reason });
            sendTo(devices, session.remoteDeviceId, { type: 'session_ended', sessionId: session.sessionId, reason });
        }
    }, 5000);
    wss.on('connection', (socket) => {
        let registeredDeviceId = null;
        socket.on('message', (raw) => {
            let message;
            try {
                message = JSON.parse(raw.toString());
            }
            catch {
                send(socket, { type: 'error', code: 'invalid_json', message: 'Message was not valid JSON.' });
                return;
            }
            switch (message.type) {
                case 'register': {
                    if (!DEVICE_ID_PATTERN.test(message.deviceId)) {
                        send(socket, { type: 'registration_failed', reason: 'Device ID must be 9 digits.' });
                        socket.close(4001, 'Invalid device ID');
                        return;
                    }
                    registeredDeviceId = message.deviceId;
                    devices.register(message.deviceId, socket);
                    send(socket, { type: 'registered', deviceId: message.deviceId });
                    break;
                }
                case 'connect_request': {
                    if (!registeredDeviceId)
                        return sendUnregisteredError(socket);
                    if (!rateLimiter.tryConsume(registeredDeviceId)) {
                        send(socket, { type: 'request_failed', reason: 'rate_limited', targetDeviceId: message.targetDeviceId });
                        return;
                    }
                    if (registeredDeviceId === message.targetDeviceId) {
                        send(socket, { type: 'request_failed', reason: 'device_not_found', targetDeviceId: message.targetDeviceId });
                        return;
                    }
                    if (!devices.isOnline(message.targetDeviceId)) {
                        send(socket, { type: 'request_failed', reason: 'device_offline', targetDeviceId: message.targetDeviceId });
                        return;
                    }
                    if (devices.isBusy(message.targetDeviceId) || devices.isBusy(registeredDeviceId)) {
                        send(socket, { type: 'request_failed', reason: 'already_in_session', targetDeviceId: message.targetDeviceId });
                        return;
                    }
                    const request = sessions.createPendingRequest(registeredDeviceId, message.targetDeviceId);
                    send(socket, { type: 'request_sent', requestId: request.requestId, targetDeviceId: message.targetDeviceId });
                    sendTo(devices, message.targetDeviceId, {
                        type: 'incoming_request',
                        requestId: request.requestId,
                        fromDeviceId: registeredDeviceId,
                    });
                    break;
                }
                case 'approve_request': {
                    if (!registeredDeviceId)
                        return sendUnregisteredError(socket);
                    const request = sessions.getPendingRequest(message.requestId);
                    if (!request || request.toDeviceId !== registeredDeviceId) {
                        send(socket, { type: 'error', code: 'unknown_request', message: 'Connection request not found or expired.' });
                        return;
                    }
                    sessions.removePendingRequest(message.requestId);
                    const session = sessions.createSession(request.fromDeviceId, request.toDeviceId, config.pendingSessionTtlSeconds, config.maxSessionDurationSeconds);
                    devices.setActiveSession(request.fromDeviceId, session.sessionId);
                    devices.setActiveSession(request.toDeviceId, session.sessionId);
                    const controllerToken = tokens.issue(session.sessionId, config.pendingSessionTtlSeconds);
                    const remoteToken = tokens.issue(session.sessionId, config.pendingSessionTtlSeconds);
                    sendTo(devices, request.fromDeviceId, {
                        type: 'session_approved',
                        sessionId: session.sessionId,
                        sessionToken: controllerToken,
                        peerDeviceId: request.toDeviceId,
                        role: 'controller',
                        iceServers: config.iceServers,
                        expiresAt: session.pendingExpiresAt,
                    });
                    sendTo(devices, request.toDeviceId, {
                        type: 'session_approved',
                        sessionId: session.sessionId,
                        sessionToken: remoteToken,
                        peerDeviceId: request.fromDeviceId,
                        role: 'remote',
                        iceServers: config.iceServers,
                        expiresAt: session.pendingExpiresAt,
                    });
                    break;
                }
                case 'reject_request': {
                    if (!registeredDeviceId)
                        return sendUnregisteredError(socket);
                    const request = sessions.getPendingRequest(message.requestId);
                    if (!request || request.toDeviceId !== registeredDeviceId)
                        return;
                    sessions.removePendingRequest(message.requestId);
                    sendTo(devices, request.fromDeviceId, { type: 'request_rejected', requestId: message.requestId });
                    break;
                }
                case 'signal_offer':
                case 'signal_answer':
                case 'signal_ice_candidate': {
                    if (!registeredDeviceId)
                        return sendUnregisteredError(socket);
                    const session = sessions.getSession(message.sessionId);
                    if (!session) {
                        send(socket, { type: 'error', code: 'unknown_session', message: 'Session not found or expired.' });
                        return;
                    }
                    if (!tokens.verify(message.sessionToken, message.sessionId)) {
                        send(socket, { type: 'error', code: 'invalid_token', message: 'Session token invalid or expired.' });
                        return;
                    }
                    const peerDeviceId = registeredDeviceId === session.controllerDeviceId ? session.remoteDeviceId : session.controllerDeviceId;
                    if (registeredDeviceId !== session.controllerDeviceId && registeredDeviceId !== session.remoteDeviceId) {
                        send(socket, { type: 'error', code: 'not_a_participant', message: 'You are not part of this session.' });
                        return;
                    }
                    if (message.type === 'signal_offer') {
                        sessions.updateState(session.sessionId, 'establishing_connection');
                        sendTo(devices, peerDeviceId, { type: 'signal_offer', sessionId: session.sessionId, sdp: message.sdp });
                    }
                    else if (message.type === 'signal_answer') {
                        sendTo(devices, peerDeviceId, { type: 'signal_answer', sessionId: session.sessionId, sdp: message.sdp });
                    }
                    else {
                        sendTo(devices, peerDeviceId, {
                            type: 'signal_ice_candidate',
                            sessionId: session.sessionId,
                            candidate: message.candidate,
                            sdpMid: message.sdpMid,
                            sdpMLineIndex: message.sdpMLineIndex,
                        });
                    }
                    break;
                }
                case 'end_session': {
                    if (!registeredDeviceId)
                        return sendUnregisteredError(socket);
                    const session = sessions.getSession(message.sessionId);
                    if (!session)
                        return;
                    if (!tokens.verify(message.sessionToken, message.sessionId))
                        return;
                    const peerDeviceId = registeredDeviceId === session.controllerDeviceId ? session.remoteDeviceId : session.controllerDeviceId;
                    devices.setActiveSession(session.controllerDeviceId, null);
                    devices.setActiveSession(session.remoteDeviceId, null);
                    sessions.endSession(session.sessionId);
                    sendTo(devices, peerDeviceId, { type: 'session_ended', sessionId: session.sessionId, reason: 'peer_ended' });
                    break;
                }
                case 'ping': {
                    send(socket, { type: 'pong' });
                    break;
                }
            }
        });
        socket.on('close', () => {
            if (!registeredDeviceId)
                return;
            const device = devices.get(registeredDeviceId);
            if (device?.activeSessionId) {
                const session = sessions.getSession(device.activeSessionId);
                if (session) {
                    const peerDeviceId = registeredDeviceId === session.controllerDeviceId ? session.remoteDeviceId : session.controllerDeviceId;
                    devices.setActiveSession(session.controllerDeviceId, null);
                    devices.setActiveSession(session.remoteDeviceId, null);
                    sessions.endSession(session.sessionId);
                    sendTo(devices, peerDeviceId, {
                        type: 'session_ended',
                        sessionId: session.sessionId,
                        reason: 'peer_disconnected',
                    });
                }
            }
            devices.unregister(registeredDeviceId, socket);
        });
        socket.on('error', () => {
            // 'close' fires after 'error' for ws sockets; cleanup happens there.
        });
    });
    wss.on('close', () => clearInterval(sweepInterval));
}
function send(socket, message) {
    if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
    }
}
function sendTo(devices, deviceId, message) {
    const device = devices.get(deviceId);
    if (device)
        send(device.socket, message);
}
function sendUnregisteredError(socket) {
    send(socket, { type: 'error', code: 'not_registered', message: 'Send a register message first.' });
}
//# sourceMappingURL=server.js.map