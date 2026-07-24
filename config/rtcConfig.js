/**
 * My Smart Door — RTC Configuration Module (Phase 0)
 * config/rtcConfig.js
 *
 * INFRASTRUCTURE VALIDATION ONLY. Nothing in this file is imported by any
 * visitor- or owner-facing code path yet, and nothing here makes a network
 * call, opens a peer connection, or requests media. It exists so the
 * shape of future RTC configuration (STUN/TURN servers, ICE policy,
 * monitoring event names) is decided and documented ahead of time,
 * without enabling any of it.
 *
 * Does NOT implement:
 *   - RTCPeerConnection / SDP / ICE candidate exchange (Phase 2+)
 *   - TURN credential issuance (a future Edge Function, Phase 4)
 *   - Any visitor-facing "Tap to Talk" WebRTC attempt (Phase 2)
 *
 * ── STUN/TURN PROVIDER RECOMMENDATION ──────────────────────────────────
 * Recommended: Twilio Network Traversal Service (STUN/TURN).
 *
 * Why Twilio specifically, over a standalone provider (Xirsys, Metered,
 * self-hosted coturn):
 *   - SmartDoor already has an approved, production Twilio vendor
 *     relationship as the secondary masked-call provider
 *     (services/twilio.js, supabase/functions/_shared/providers/twilio.ts).
 *     Reusing the same account/billing relationship avoids onboarding a
 *     new vendor, a new contract, and a new secrets-management surface.
 *   - Twilio's Network Traversal Service issues short-lived, per-request
 *     TURN credentials via a simple authenticated API call — this maps
 *     directly onto the "server-issues-short-lived-credentials" pattern
 *     already used for Exotel/Twilio call secrets in
 *     supabase/functions/initiate-call (secrets never reach the browser).
 *   - No infrastructure to self-host or patch (coturn would require
 *     standing up and maintaining a server SmartDoor doesn't operate
 *     today, which conflicts with the "minimal additive footprint"
 *     principle from the approved architecture audit).
 *
 * This recommendation is a decision record only. The actual TURN
 * credential-issuing Edge Function is explicitly out of scope until
 * Phase 4 and is NOT implemented here.
 *
 * ── ICE SERVER CONFIGURATION SHAPE (placeholder — inert) ───────────────
 * This object documents the shape a future RTCPeerConnection config would
 * use. It is exported for future phases to import, but nothing calls or
 * evaluates getIceServers() yet, and it reads only build-time env vars
 * that do not exist in any environment today — so it always safely
 * resolves to STUN-only (which itself is never used, since no
 * RTCPeerConnection exists yet).
 */

// Public STUN servers require no credentials and carry no vendor
// dependency — safe as a documented fallback shape, not currently used.
const PUBLIC_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

/**
 * Returns the ICE server list a future RTCPeerConnection would use.
 * NOT CALLED by any production code path today.
 *
 * @param {{ turnUsername?: string, turnCredential?: string }} [turnCreds]
 *   Short-lived credentials that would be issued by a future
 *   get-turn-credentials Edge Function (Phase 4, not implemented).
 */
export function getIceServers(turnCreds = null) {
  const servers = [...PUBLIC_STUN_SERVERS];

  // Placeholder only — VITE_TURN_URL is not set in any environment yet.
  // When Phase 4 introduces the credential-issuing Edge Function, this
  // block starts sourcing turnCreds from that function's response instead
  // of reading a static env var directly (a static shared TURN secret in
  // the browser would violate the same secret-isolation model
  // initiate-call already follows for Exotel/Twilio).
  const turnUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURN_URL) || null;
  if (turnUrl && turnCreds?.turnUsername && turnCreds?.turnCredential) {
    servers.push({
      urls: turnUrl,
      username: turnCreds.turnUsername,
      credential: turnCreds.turnCredential,
    });
  }

  return servers;
}

/**
 * Recommended RTCConfiguration defaults for a future RTCPeerConnection.
 * Not consumed anywhere yet — documents the intended policy only.
 */
export const RTC_CONFIG_DEFAULTS = {
  iceTransportPolicy: 'all', // will move to 'relay' only if ICE-failure metrics justify forcing TURN
  iceCandidatePoolSize: 0,
};

/**
 * Visitor-facing WebRTC connect timeout, in milliseconds, before the
 * (unmodified) masked-call fallback fires. Matches the ~15s window
 * agreed in the approved architecture audit. Documented here now so
 * Phase 2 has one canonical constant to import instead of a magic
 * number; not read by any running code yet.
 */
export const WEBRTC_CONNECT_TIMEOUT_MS = 15000;

/**
 * Production hardening (Fix 2 + Fix 4): once a call has successfully
 * connected, a transient ICE hiccup (connectionState briefly goes to
 * 'disconnected') should NOT immediately tear down the call — WebRTC/ICE
 * routinely recovers from short network blips on its own. This is the
 * grace window both webrtcCall.js (visitor) and webrtcOwnerCall.js (owner)
 * wait for `connectionState` to return to 'connected' before treating the
 * disconnect as permanent and running full cleanup (close peer connection,
 * stop mic tracks, leave signaling channel, reset UI). A hard 'failed' or
 * 'closed' state is always treated as permanent immediately, without
 * waiting out this window.
 */
export const RTC_RECONNECT_GRACE_MS = 12000;

/**
 * ── MONITORING EVENT NAME CONSTANTS (Phase 0/1 hook) ───────────────────
 * Canonical event-type strings for future RTC metrics, so Phase 1's
 * presence events and later phases' connection events use one shared
 * vocabulary instead of ad-hoc strings drifting apart across files.
 * Presence-related ones are already written today by services/presence.js;
 * the rtc_* ones are reserved names for later phases and are not written
 * by any code yet.
 */
export const RTC_MONITORING_EVENTS = Object.freeze({
  // Already emitted today (Phase 1), by services/presence.js:
  PRESENCE_CONNECT: 'connect',
  PRESENCE_DISCONNECT: 'disconnect',
  PRESENCE_RECONNECT: 'reconnect',
  PRESENCE_STALE_CLEANUP: 'stale_cleanup',

  // Reserved for future phases — not emitted by any code yet:
  RTC_OFFER_SENT: 'rtc_offer_sent',
  RTC_CONNECTED: 'rtc_connected',
  RTC_ICE_FAILED: 'rtc_ice_failed',
  RTC_TURN_FAILED: 'rtc_turn_failed',
  RTC_PERMISSION_DENIED: 'rtc_permission_denied',
  RTC_TIMEOUT_FALLBACK: 'rtc_timeout_fallback',
  RTC_OWNER_OFFLINE_SKIP: 'rtc_owner_offline_skip',
  RTC_VISITOR_CANCELLED: 'rtc_visitor_cancelled',

  // Added — Phase 2 (Tap to Talk). Additive only; nothing above this line
  // is renamed or removed.
  RTC_OWNER_REJECTED: 'rtc_owner_rejected',

  // Added — Phase 2 Production Hardening. Additive only; nothing above
  // this line is renamed or removed.
  RTC_RECONNECTING: 'rtc_reconnecting',           // transient disconnect, grace window started
  RTC_RECONNECTED: 'rtc_reconnected',             // recovered within the grace window
  RTC_POST_CONNECT_DISCONNECT: 'rtc_post_connect_disconnect', // permanent teardown after a live call
  RTC_CALL_CLAIMED_ELSEWHERE: 'rtc_call_claimed_elsewhere',   // another owner tab/device answered first

  // Added — Production Audit fix (getUserMedia hang in in-app browsers).
  RTC_GUM_TIMEOUT: 'rtc_gum_timeout',   // mic prompt never resolved/rejected within GUM_TIMEOUT_MS
});

/**
 * PRODUCTION FIX (Root Cause #2 — TURN support).
 *
 * getIceServers() above was STUN-only by design ("Phase 4 not built
 * yet"). STUN alone cannot traverse the symmetric / carrier-grade NAT
 * used by most Indian mobile carriers (Jio, Airtel, Vi), so even after
 * the ICE-candidate-delivery race fix in services/webrtcOwnerCall.js,
 * a visitor and owner who are both on mobile data (the overwhelmingly
 * common case for SmartDoor) can still fail to find a direct P2P path.
 * That failure looks identical to the reported symptom: "Connecting…"
 * never becomes "Connected", then the existing masked-call fallback
 * fires after WEBRTC_CONNECT_TIMEOUT_MS.
 *
 * fetchIceServers() calls the new get-turn-credentials Edge Function
 * (supabase/functions/get-turn-credentials), which issues short-lived
 * Twilio Network Traversal Service TURN credentials — reusing the
 * existing approved Twilio vendor relationship and the same
 * server-issues-short-lived-credentials pattern already used for
 * Exotel/Twilio call secrets in supabase/functions/initiate-call
 * (secrets never reach the browser).
 *
 * Contract: NEVER throws, NEVER blocks longer than TURN_FETCH_TIMEOUT_MS,
 * and ALWAYS resolves to at least the STUN-only list getIceServers()
 * already returned. Any failure — Edge Function not deployed, Twilio
 * secrets not configured yet, network error, timeout — fails open to
 * exactly the pre-existing STUN-only behavior, so this can only ever
 * improve connectivity, never regress it.
 */
const TURN_FETCH_TIMEOUT_MS = 2500;

/**
 * PRODUCTION FIX (getUserMedia hang in in-app browsers).
 *
 * Root cause of callers/owners stuck on "Connecting…" forever: in-app
 * WebViews (WhatsApp, Instagram, etc.) sometimes never resolve or reject
 * navigator.mediaDevices.getUserMedia() at all — the mic permission
 * prompt is silently swallowed by the host app chrome instead of being
 * shown, so the bare `await getUserMedia()` call in services/webrtcCall.js
 * and services/webrtcOwnerCall.js hangs indefinitely with no error to
 * catch and no timeout to fall back on.
 *
 * getUserMediaWithTimeout() wraps the call in the same
 * Promise.race(...)-with-setTimeout pattern already used by
 * fetchIceServers() above, so a hung prompt now rejects with a
 * `gum_timeout` Error after GUM_TIMEOUT_MS instead of hanging forever,
 * letting the existing masked-call fallback fire like any other
 * mic-unavailable reason.
 */
export const GUM_TIMEOUT_MS = 10000;

export function getUserMediaWithTimeout(constraints, timeoutMs = GUM_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('gum_timeout'));
    }, timeoutMs);

    navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      if (settled) {
        // Timeout already fired and the caller moved on — release the
        // mic immediately instead of leaving it held open in the background.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(stream);
    }).catch((err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function fetchIceServers(supabaseClient, { ownerId, plateId } = {}) {
  const stunOnly = getIceServers();
  if (!supabaseClient?.functions?.invoke) return stunOnly;

  let timer;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('turn_fetch_timeout')), TURN_FETCH_TIMEOUT_MS);
    });

    const { data, error } = await Promise.race([
      supabaseClient.functions.invoke('get-turn-credentials', {
        body: { ownerId: ownerId || null, plateId: plateId || null },
      }),
      timeoutPromise,
    ]);
    clearTimeout(timer);

    if (error || !Array.isArray(data?.iceServers) || data.iceServers.length === 0) {
      console.warn(`[RTC-TRACE] TURN fetch returned no servers, using STUN-only | File=config/rtcConfig.js Reason=${error?.message || 'empty iceServers'}`);
      return stunOnly;
    }

    console.log(`[RTC-TRACE] TURN credentials fetched | File=config/rtcConfig.js serverCount=${data.iceServers.length}`);
    return [...stunOnly, ...data.iceServers];
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[RTC-TRACE] TURN fetch failed, using STUN-only | File=config/rtcConfig.js Reason=${err?.message || err}`);
    return stunOnly;
  }
}

export default {
  getIceServers,
  fetchIceServers,
  getUserMediaWithTimeout,
  GUM_TIMEOUT_MS,
  RTC_CONFIG_DEFAULTS,
  WEBRTC_CONNECT_TIMEOUT_MS,
  RTC_MONITORING_EVENTS,
};
