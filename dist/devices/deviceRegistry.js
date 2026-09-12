"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceRegistry = void 0;
class DeviceRegistry {
    constructor() {
        this.devicesById = new Map();
    }
    register(deviceId, socket) {
        const existing = this.devicesById.get(deviceId);
        if (existing && existing.socket !== socket && existing.socket.readyState === existing.socket.OPEN) {
            // Same device ID reconnecting from a new socket (e.g. app restart) —
            // close the stale one so we don't leak sockets or double-deliver messages.
            try {
                existing.socket.close(4000, 'Replaced by new connection');
            }
            catch {
                // socket already dead; ignore
            }
        }
        const device = {
            deviceId,
            socket,
            connectedAt: Date.now(),
            activeSessionId: null,
        };
        this.devicesById.set(deviceId, device);
        return device;
    }
    unregister(deviceId, socket) {
        const existing = this.devicesById.get(deviceId);
        // Only remove if this call is for the socket we currently have on file —
        // avoids a race where an old socket's close event evicts a newer registration.
        if (existing && existing.socket === socket) {
            this.devicesById.delete(deviceId);
        }
    }
    get(deviceId) {
        return this.devicesById.get(deviceId);
    }
    isOnline(deviceId) {
        const device = this.devicesById.get(deviceId);
        return !!device && device.socket.readyState === device.socket.OPEN;
    }
    setActiveSession(deviceId, sessionId) {
        const device = this.devicesById.get(deviceId);
        if (device) {
            device.activeSessionId = sessionId;
        }
    }
    isBusy(deviceId) {
        const device = this.devicesById.get(deviceId);
        return !!device && device.activeSessionId !== null;
    }
    findByDeviceIdForSocket(socket) {
        for (const device of this.devicesById.values()) {
            if (device.socket === socket)
                return device;
        }
        return undefined;
    }
    get onlineCount() {
        return this.devicesById.size;
    }
}
exports.DeviceRegistry = DeviceRegistry;
//# sourceMappingURL=deviceRegistry.js.map