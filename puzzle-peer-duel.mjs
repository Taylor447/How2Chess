const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(code) {
  const normalized = String(code || "").replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function encodePeerCode(payload) {
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
}

export function decodePeerCode(code, expectedType) {
  const value = String(code || "").trim();
  if (!value || value.length > 20000) throw new Error("Invalid or oversized friend-duel code.");
  let payload;
  try { payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(value))); }
  catch { throw new Error("This friend-duel code is not valid."); }
  if (payload?.version !== 1 || !["offer", "answer"].includes(payload.type) || !payload.description?.type || !payload.description?.sdp) {
    throw new Error("This friend-duel code is incomplete or unsupported.");
  }
  if (expectedType && payload.type !== expectedType) throw new Error(`Expected a friend-duel ${expectedType} code.`);
  return payload;
}

export function waitForIceGathering(peer, timeoutMs = 15000) {
  if (peer.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      peer.removeEventListener?.("icegatheringstatechange", onStateChange);
    };
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") { cleanup(); resolve(); }
    };
    const timer = setTimeout(() => { cleanup(); reject(new Error("Peer connection setup timed out while collecting network candidates.")); }, timeoutMs);
    peer.addEventListener?.("icegatheringstatechange", onStateChange);
    onStateChange();
  });
}

function requirePeerConnection(PeerConnectionCtor) {
  const Ctor = PeerConnectionCtor || globalThis.RTCPeerConnection;
  if (!Ctor) throw new Error("This browser does not support WebRTC peer connections.");
  return Ctor;
}

export async function createPeerOffer({ PeerConnectionCtor, iceServers = DEFAULT_ICE_SERVERS, timeoutMs = 15000 } = {}) {
  const Ctor = requirePeerConnection(PeerConnectionCtor);
  const peer = new Ctor({ iceServers });
  const channel = peer.createDataChannel("h2c-puzzle-duel", { ordered: true });
  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);
  await waitForIceGathering(peer, timeoutMs);
  const description = peer.localDescription?.toJSON?.() || peer.localDescription;
  return { peer, channel, code: encodePeerCode({ version: 1, type: "offer", description }) };
}

export async function createPeerAnswer({ offerCode, PeerConnectionCtor, iceServers = DEFAULT_ICE_SERVERS, timeoutMs = 15000, onDataChannel } = {}) {
  const offer = decodePeerCode(offerCode, "offer");
  const Ctor = requirePeerConnection(PeerConnectionCtor);
  const peer = new Ctor({ iceServers });
  if (onDataChannel) peer.addEventListener?.("datachannel", event => onDataChannel(event.channel));
  await peer.setRemoteDescription(offer.description);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);
  await waitForIceGathering(peer, timeoutMs);
  const description = peer.localDescription?.toJSON?.() || peer.localDescription;
  return { peer, code: encodePeerCode({ version: 1, type: "answer", description }) };
}

export async function applyPeerAnswer(peer, answerCode) {
  const answer = decodePeerCode(answerCode, "answer");
  await peer.setRemoteDescription(answer.description);
  return true;
}
