// Peer-to-peer voice chat (WebRTC). Audio goes directly between players'
// devices; the room's WebSocket only relays the connection set-up messages.
// With up to 10 players everyone connects to everyone (a mesh), which is fine
// for audio-only.
//
// To avoid both sides calling at once, the player whose id sorts first always
// makes the offer.

let iceServers = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
let iceLoaded = false;
let localStream = null;
let muted = false;
let me = null;
let send = () => {};
let lastState = null;
let onChange = () => {};
const peers = new Map(); // pid -> { pc, audio, pending: [], level }

let actx = null;
const meters = new Map(); // pid -> analyser
const heldUntil = new Map(); // pid -> ms timestamp the speaking glow lasts until
let meterTimer = null;

export const inVoice = () => Boolean(localStream);
export const isMicMuted = () => muted;

export function setup({ sendFn, changed }) {
  send = sendFn;
  onChange = changed;
}

async function loadIce() {
  if (iceLoaded) return;
  iceLoaded = true;
  try {
    const res = await fetch('/api/ice');
    if (res.ok) {
      const body = await res.json();
      if (Array.isArray(body.iceServers) && body.iceServers.length) iceServers = body.iceServers;
    }
  } catch {}
}

export async function join() {
  if (localStream) return;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Voice chat needs a secure (https) page and a browser that supports it.');
  await loadIce();
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  muted = false;
  actx ??= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') await actx.resume();
  meter(me, localStream);
  startMeters();
  send({ type: 'voice', on: true });
  if (lastState) sync(lastState);
  onChange();
}

export function leave() {
  if (!localStream) return;
  for (const pid of [...peers.keys()]) drop(pid);
  localStream.getTracks().forEach((t) => t.stop());
  localStream = null;
  meters.clear();
  clearInterval(meterTimer);
  meterTimer = null;
  document.querySelectorAll('.seat[data-speaking]').forEach((el) => el.removeAttribute('data-speaking'));
  send({ type: 'voice', on: false });
  onChange();
}

export function toggleMute() {
  if (!localStream) return;
  muted = !muted;
  localStream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  send({ type: 'voice', on: true, muted });
  onChange();
}

// Called with every room state: connect to everyone in voice, drop anyone who left.
export function sync(state) {
  lastState = state;
  me = state.you;
  if (!localStream) return;
  const wanted = new Set(state.players.filter((p) => p.id !== me && p.voice && p.connected).map((p) => p.id));
  for (const pid of wanted) ensurePeer(pid);
  for (const pid of [...peers.keys()]) if (!wanted.has(pid)) drop(pid);
}

// A relayed set-up message from another player.
export async function onSignal(from, data) {
  if (!localStream || !data) return;
  const peer = ensurePeer(from);
  const { pc } = peer;
  try {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
      if (data.sdp.type === 'offer') {
        await pc.setLocalDescription(await pc.createAnswer());
        send({ type: 'rtc', to: from, data: { sdp: pc.localDescription } });
      }
      for (const c of peer.pending.splice(0)) await pc.addIceCandidate(c).catch(() => {});
    } else if (data.ice) {
      if (pc.remoteDescription) await pc.addIceCandidate(data.ice).catch(() => {});
      else peer.pending.push(data.ice);
    }
  } catch (err) {
    console.warn('voice signalling failed', err);
  }
}

function ensurePeer(pid) {
  if (peers.has(pid)) return peers.get(pid);
  const pc = new RTCPeerConnection({ iceServers });
  const peer = { pc, audio: null, pending: [] };
  peers.set(pid, peer);
  localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
  pc.onicecandidate = (e) => { if (e.candidate) send({ type: 'rtc', to: pid, data: { ice: e.candidate } }); };
  pc.ontrack = (e) => {
    const stream = e.streams[0];
    if (!peer.audio) {
      peer.audio = new Audio();
      peer.audio.autoplay = true;
      peer.audio.playsInline = true;
    }
    peer.audio.srcObject = stream;
    peer.audio.play().catch(() => {});
    meter(pid, stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') {
      // Try again from scratch shortly (networks change, phones sleep…).
      drop(pid);
      setTimeout(() => lastState && sync(lastState), 2000);
    }
    onChange();
  };
  if (me < pid) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => send({ type: 'rtc', to: pid, data: { sdp: pc.localDescription } }))
      .catch((err) => console.warn('voice offer failed', err));
  }
  return peer;
}

function drop(pid) {
  const peer = peers.get(pid);
  if (!peer) return;
  peers.delete(pid);
  meters.delete(pid);
  try { peer.pc.close(); } catch {}
  if (peer.audio) { peer.audio.srcObject = null; peer.audio.remove(); }
  document.querySelector(`.seat[data-id="${CSS.escape(pid)}"]`)?.removeAttribute('data-speaking');
}

export function connectedCount() {
  return [...peers.values()].filter((p) => p.pc.connectionState === 'connected').length;
}

// ---- who's talking: light up their seat ------------------------------------

function meter(pid, stream) {
  if (!actx || !pid) return;
  const src = actx.createMediaStreamSource(stream);
  const an = actx.createAnalyser();
  an.fftSize = 512;
  src.connect(an);
  meters.set(pid, an);
}

function startMeters() {
  if (meterTimer) return;
  const buf = new Uint8Array(512);
  meterTimer = setInterval(() => {
    for (const [pid, an] of meters) {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += (v - 128) ** 2;
      const rms = Math.sqrt(sum / buf.length);
      // Hold the glow briefly after each loud moment so it doesn't flicker between words.
      if (rms > 3 && !(pid === me && muted)) heldUntil.set(pid, Date.now() + 350);
      const talking = (heldUntil.get(pid) ?? 0) > Date.now();
      const seat = document.querySelector(`.seat[data-id="${CSS.escape(pid)}"]`);
      if (!seat) continue;
      if (talking) seat.setAttribute('data-speaking', '');
      else seat.removeAttribute('data-speaking');
    }
  }, 120);
}
