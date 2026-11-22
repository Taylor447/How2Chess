import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPeerAnswer, createPeerAnswer, createPeerOffer, decodePeerCode, encodePeerCode } from "../puzzle-peer-duel.mjs";

class FakePeerConnection {
  constructor(configuration) { this.configuration = configuration; this.iceGatheringState = "complete"; this.listeners = {}; this.connectionState = "new"; }
  createDataChannel(label) { this.channelLabel = label; return { label, readyState: "connecting" }; }
  async createOffer() { return { type: "offer", sdp: "fake-offer-sdp" }; }
  async createAnswer() { return { type: "answer", sdp: "fake-answer-sdp" }; }
  async setLocalDescription(description) { this.localDescription = description; }
  async setRemoteDescription(description) { this.remoteDescription = description; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  removeEventListener(type) { delete this.listeners[type]; }
}

test("friend-duel signaling codes round-trip and reject malformed or wrong-role codes", () => {
  const code = encodePeerCode({ version: 1, type: "offer", description: { type: "offer", sdp: "sample" } });
  assert.deepEqual(decodePeerCode(code, "offer"), { version: 1, type: "offer", description: { type: "offer", sdp: "sample" } });
  assert.throws(() => decodePeerCode("not-a-code", "offer"), /not valid/);
  assert.throws(() => decodePeerCode(code, "answer"), /Expected a friend-duel answer/);
  assert.throws(() => decodePeerCode("a".repeat(20001)), /oversized/);
});

test("host offer, guest answer, and host answer apply use WebRTC descriptions", async () => {
  const host = await createPeerOffer({ PeerConnectionCtor: FakePeerConnection });
  assert.equal(host.peer.channelLabel, "h2c-puzzle-duel");
  assert.equal(decodePeerCode(host.code).description.sdp, "fake-offer-sdp");
  let incomingChannel;
  const guest = await createPeerAnswer({ offerCode: host.code, PeerConnectionCtor: FakePeerConnection, onDataChannel: channel => { incomingChannel = channel; } });
  assert.deepEqual(guest.peer.remoteDescription, { type: "offer", sdp: "fake-offer-sdp" });
  assert.equal(decodePeerCode(guest.code).description.sdp, "fake-answer-sdp");
  assert.equal(await applyPeerAnswer(host.peer, guest.code), true);
  assert.deepEqual(host.peer.remoteDescription, { type: "answer", sdp: "fake-answer-sdp" });
  assert.equal(incomingChannel, undefined);
});
