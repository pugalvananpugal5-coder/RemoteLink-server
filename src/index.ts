import 'dotenv/config';
import express from 'express';
import http from 'http';
import { attachSignalingServer } from './signaling/server';
import type { IceServerConfig } from './types/messages';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

const PORT = Number(process.env.PORT ?? 8443);
const SESSION_TOKEN_SECRET = requireEnv('SESSION_TOKEN_SECRET');

const iceServers: IceServerConfig[] = [
  { urls: process.env.STUN_URL ?? 'stun:stun.l.google.com:19302' },
];
if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
  iceServers.push({
    urls: process.env.TURN_URL,
    username: process.env.TURN_USERNAME,
    credential: process.env.TURN_CREDENTIAL,
  });
} else {
  // eslint-disable-next-line no-console
  console.warn(
    'WARNING: No TURN server configured. Devices behind symmetric NAT / carrier-grade NAT ' +
      '(common on mobile networks) will fail to establish a direct P2P connection and have no fallback. ' +
      'Set TURN_URL, TURN_USERNAME, TURN_CREDENTIAL in .env before production use.'
  );
}

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

const httpServer = http.createServer(app);

attachSignalingServer(httpServer, {
  pendingSessionTtlSeconds: Number(process.env.PENDING_SESSION_TTL_SECONDS ?? 60),
  maxSessionDurationSeconds: Number(process.env.MAX_SESSION_DURATION_SECONDS ?? 7200),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 10),
  rateLimitWindowSeconds: Number(process.env.RATE_LIMIT_WINDOW_SECONDS ?? 60),
  tokenSecret: SESSION_TOKEN_SECRET,
  iceServers,
});

httpServer.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`RemoteLink signaling server listening on :${PORT} (WebSocket path: /ws)`);
});

process.on('SIGTERM', () => {
  httpServer.close(() => process.exit(0));
});
