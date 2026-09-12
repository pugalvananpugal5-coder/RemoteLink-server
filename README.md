# RemoteLink Signaling Server

Handles device presence, connection requests, session approval, and WebRTC
offer/answer/ICE relay for the RemoteLink Android app. **It never touches
screen-share media** — that flows peer-to-peer (or through a TURN relay) via
WebRTC's encrypted DTLS-SRTP, which this server can't decode even if it
wanted to.

## What this server does NOT do

- No user accounts, no login, no password storage.
- No screen recording storage.
- No persistence across restarts (by design — see comments in
  `sessionManager.ts` and `deviceRegistry.ts`). If you need session *history*
  for the Android "Recent Sessions" list, store that client-side on each
  device, since it's inherently per-device UI state, not shared server state.

## Local setup

```bash
cd server
npm install
cp .env.example .env
# Generate a real secret and paste it into SESSION_TOKEN_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npm run dev
```

Health check: `GET http://localhost:8443/health`

## TURN server

STUN alone (the default in `.env.example`, Google's public STUN) is enough
for two devices on open/reasonably-permissive NATs. **It is not enough for
most real phone-to-phone connections**, because mobile carriers commonly use
carrier-grade NAT (CGNAT), which direct P2P WebRTC cannot traverse. Without a
TURN server, a large fraction of real-world connections between two phones on
cellular data will fail with `signal_ice_candidate` timing out and the
Android client eventually reporting "Unable to establish peer connection."

You need a TURN server for production use. Options:
- Run your own with [coturn](https://github.com/coturn/coturn) (open source,
  well-documented, runs fine on a small VPS).
- Use a managed TURN provider (Twilio Network Traversal Service, Cloudflare
  Calls, Xirsys, Metered).

Once you have credentials, set `TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`
in `.env`. The server will refuse to start silently missing TURN — it logs a
warning instead, since STUN-only can still work for same-network testing.

## Production deployment

1. **TLS is mandatory.** Android's `WebSocket` client and WebRTC's
   `DtlsSrtpTransport` both expect (and in the app's case, enforce) `wss://`.
   Terminate TLS at a reverse proxy (nginx, Caddy) or your cloud provider's
   load balancer in front of this Node process — don't try to do TLS
   termination in Node directly for anything beyond local testing.
2. Run behind a process manager (`pm2`, systemd, or a container
   orchestrator) so the process restarts on crash.
3. Set `SESSION_TOKEN_SECRET` from a secrets manager, not a committed `.env`.
4. This server keeps all state in a single process's memory. If you need to
   scale horizontally (multiple server instances behind a load balancer),
   you must either (a) use sticky sessions so a device's WebSocket always
   lands on the same instance, or (b) move `DeviceRegistry` and
   `SessionManager` state to a shared store (Redis pub/sub works well for
   this) so signaling messages can be routed across instances. The current
   code does neither — it's built for a single instance, which is enough for
   moderate concurrent session volume.
5. Put a firewall/security-group rule limiting inbound traffic to 443 (or
   your chosen port) and your TURN server's ports (typically 3478 and
   5349, plus a relay port range — see coturn docs).

## Rate limiting & abuse prevention

`RateLimiter` caps connection *requests* per device per time window
(`RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_SECONDS`). This stops a
compromised or malicious client from spamming `connect_request` at another
device to harass it with repeated approval prompts. It does not rate-limit
registration or signaling messages within an already-approved session,
since those are expected to be frequent (ICE candidates trickle in
individually).

This is process-local — see the scaling note above if you run multiple
instances.
