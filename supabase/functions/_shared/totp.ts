/**
 * Smart Door — Shared TOTP Verifier (RFC 6238)
 * supabase/functions/_shared/totp.ts
 *
 * Admin 2FA ke liye. admin_users.totp_secret ek base32 secret hai
 * (Google Authenticator / Authy compatible). Koi external npm/deno
 * TOTP library use nahi ki — Deno's built-in Web Crypto (HMAC-SHA1)
 * se directly RFC 6238 implement kiya hai, taaki esm.sh resolution
 * failures se yeh function kabhi na toote (auth path is critical).
 *
 * Time step: 30s · Digits: 6 · Window: ±1 step (clock drift tolerance)
 */

function base32Decode(input: string): Uint8Array {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of clean) {
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return new Uint8Array(bytes);
}

async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const counterBuf = new ArrayBuffer(8);
  const view = new DataView(counterBuf);
  // JS numbers are safe up to 2^53; counter (time/30) never gets near that.
  view.setUint32(4, counter, false);

  const key = await crypto.subtle.importKey(
    'raw',
    secret as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );

  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBuf));
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binCode % 1_000_000).padStart(6, '0');
}

/**
 * Verify a 6-digit TOTP code against a base32 secret.
 * Allows ±1 time-step (30s) of clock drift, standard practice.
 */
export async function verifyTotp(base32Secret: string, code: string): Promise<boolean> {
  if (!base32Secret || !/^\d{6}$/.test(code)) return false;

  const secretBytes = base32Decode(base32Secret);
  const counter = Math.floor(Date.now() / 1000 / 30);

  for (const drift of [0, -1, 1]) {
    const expected = await hotp(secretBytes, counter + drift);
    if (expected === code) return true;
  }
  return false;
}

/** Generate a new random base32 secret (for enrolling a new admin in 2FA). */
export function generateTotpSecret(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let out = '';
  for (const b of bytes) out += alphabet[b % 32];
  return out;
}
