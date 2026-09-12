/**
 * Wire protocol between Android clients and the signaling server.
 *
 * Every message is a single JSON object over one persistent WebSocket
 * connection per device. The server never inspects or stores WebRTC media —
 * it only relays SDP/ICE payloads it cannot decode meaningfully, and manages
 * the presence/approval state machine around them.
 */

// ---- Connection lifecycle states (mirrors what the Android UI displays) ----
export type SessionState =
  | 'offline'
  | 'online'
  | 'connecting'
  | 'waiting_for_approval'
  | 'approved'
  | 'establishing_connection'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed';

// ---- Client -> Server messages ----

export interface RegisterDeviceMessage {
  type: 'register';
  deviceId: string; // client-generated, e.g. "123456789"
  password: string;
}

export interface ConnectRequestMessage {
  type: 'connect_request';
  targetDeviceId: string;
}

export interface ApproveRequestMessage {
  type: 'approve_request';
  requestId: string;
}

export interface RejectRequestMessage {
  type: 'reject_request';
  requestId: string;
}

export interface SignalOfferMessage {
  type: 'signal_offer';
  sessionId: string;
  sessionToken: string;
  sdp: string;
}

export interface SignalAnswerMessage {
  type: 'signal_answer';
  sessionId: string;
  sessionToken: string;
  sdp: string;
}

export interface SignalIceCandidateMessage {
  type: 'signal_ice_candidate';
  sessionId: string;
  sessionToken: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface EndSessionMessage {
  type: 'end_session';
  sessionId: string;
  sessionToken: string;
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage =
  | RegisterDeviceMessage
  | ConnectRequestMessage
  | ApproveRequestMessage
  | RejectRequestMessage
  | SignalOfferMessage
  | SignalAnswerMessage
  | SignalIceCandidateMessage
  | EndSessionMessage
  | PingMessage;

// ---- Server -> Client messages ----

export interface RegisteredMessage {
  type: 'registered';
  deviceId: string;
}

export interface RegistrationFailedMessage {
  type: 'registration_failed';
  reason: string;
}

export interface IncomingRequestMessage {
  type: 'incoming_request';
  requestId: string;
  fromDeviceId: string; // truncated/display form, never PII
}

export interface RequestSentMessage {
  type: 'request_sent';
  requestId: string;
  targetDeviceId: string;
}

export interface RequestRejectedMessage {
  type: 'request_rejected';
  requestId: string;
}

export interface RequestTimedOutMessage {
  type: 'request_timed_out';
  requestId: string;
}

export interface RequestFailedMessage {
  type: 'request_failed';
  reason: 'device_offline' | 'device_not_found' | 'rate_limited' | 'already_in_session';
  targetDeviceId?: string;
}

export interface SessionApprovedMessage {
  type: 'session_approved';
  sessionId: string;
  sessionToken: string;
  peerDeviceId: string;
  role: 'controller' | 'remote';
  iceServers: IceServerConfig[];
  expiresAt: number; // epoch millis — pending-session TTL if WebRTC isn't established by then
}

export interface SignalOfferRelayMessage {
  type: 'signal_offer';
  sessionId: string;
  sdp: string;
}

export interface SignalAnswerRelayMessage {
  type: 'signal_answer';
  sessionId: string;
  sdp: string;
}

export interface SignalIceCandidateRelayMessage {
  type: 'signal_ice_candidate';
  sessionId: string;
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

export interface SessionStateChangedMessage {
  type: 'session_state_changed';
  sessionId: string;
  state: SessionState;
}

export interface SessionEndedMessage {
  type: 'session_ended';
  sessionId: string;
  reason: 'peer_disconnected' | 'peer_ended' | 'expired' | 'max_duration_reached' | 'server_shutdown';
}

export interface ErrorMessage {
  type: 'error';
  code: string;
  message: string;
}

export interface PongMessage {
  type: 'pong';
}

export type ServerMessage =
  | RegisteredMessage
  | RegistrationFailedMessage
  | IncomingRequestMessage
  | RequestSentMessage
  | RequestRejectedMessage
  | RequestTimedOutMessage
  | RequestFailedMessage
  | SessionApprovedMessage
  | SignalOfferRelayMessage
  | SignalAnswerRelayMessage
  | SignalIceCandidateRelayMessage
  | SessionStateChangedMessage
  | SessionEndedMessage
  | ErrorMessage
  | PongMessage;

export interface IceServerConfig {
  urls: string;
  username?: string;
  credential?: string;
}
