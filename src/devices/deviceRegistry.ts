import type WebSocket from 'ws';

/**
 * In-memory device presence registry.
 *
 * Deliberately NOT a database-backed table of user accounts — RemoteLink has
 * no login system. A "device" here is just a generated ID that exists for as
 * long as the app is installed, plus its current live socket (if online).
 *
 * If you need persistence across server restarts (e.g. to remember recent
 * session history for the "Recent Sessions" UI list), that's a separate
 * concern — see sessions/sessionHistoryStore.ts note in README. This
 * registry only tracks *live presence*, which is inherently ephemeral.
 */

export interface ConnectedDevice {
  deviceId: string;
  passwordHash: string;
  socket: WebSocket;
  connectedAt: number;
  /** Set while this device is the target or initiator of an active session, to prevent double-booking. */
  activeSessionId: string | null;
}

export class DeviceRegistry {
  private devicesById = new Map<string, ConnectedDevice>();

  register(deviceId: string, passwordHash: string, socket: WebSocket): ConnectedDevice {
    const existing = this.devicesById.get(deviceId);
    if (existing && existing.socket !== socket && existing.socket.readyState === existing.socket.OPEN) {
      // Same device ID reconnecting from a new socket (e.g. app restart) —
      // close the stale one so we don't leak sockets or double-deliver messages.
      try {
        existing.socket.close(4000, 'Replaced by new connection');
      } catch {
        // socket already dead; ignore
      }
    }
    const device: ConnectedDevice = {
      deviceId,
      passwordHash,
      socket,
      connectedAt: Date.now(),
      activeSessionId: null,
    };
    this.devicesById.set(deviceId, device);
    return device;
  }

  unregister(deviceId: string, socket: WebSocket): void {
    const existing = this.devicesById.get(deviceId);
    // Only remove if this call is for the socket we currently have on file —
    // avoids a race where an old socket's close event evicts a newer registration.
    if (existing && existing.socket === socket) {
      this.devicesById.delete(deviceId);
    }
  }

  get(deviceId: string): ConnectedDevice | undefined {
    return this.devicesById.get(deviceId);
  }

  isOnline(deviceId: string): boolean {
    const device = this.devicesById.get(deviceId);
    return !!device && device.socket.readyState === device.socket.OPEN;
  }

  setActiveSession(deviceId: string, sessionId: string | null): void {
    const device = this.devicesById.get(deviceId);
    if (device) {
      device.activeSessionId = sessionId;
    }
  }

  isBusy(deviceId: string): boolean {
    const device = this.devicesById.get(deviceId);
    return !!device && device.activeSessionId !== null;
  }

  findByDeviceIdForSocket(socket: WebSocket): ConnectedDevice | undefined {
    for (const device of this.devicesById.values()) {
      if (device.socket === socket) return device;
    }
    return undefined;
  }

  get onlineCount(): number {
    return this.devicesById.size;
  }
}
