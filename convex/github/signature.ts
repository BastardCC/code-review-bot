/**
 * Vérifie l’en-tête `X-Hub-Signature-256` envoyé par GitHub (HMAC-SHA256 du corps brut).
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export async function verifyGitHubWebhookSignature(
  payload: ArrayBuffer,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const theirHex = signatureHeader.slice("sha256=".length).trim().toLowerCase();
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, payload);
  const ourHex = bufferToHex(new Uint8Array(mac));

  try {
    const theirBytes = hexToBytes(theirHex);
    const ourBytes = hexToBytes(ourHex);
    if (theirBytes.length !== ourBytes.length) return false;
    return timingSafeEqual(theirBytes, ourBytes);
  } catch {
    return false;
  }
}

function bufferToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("invalid hex length");
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Comparaison en temps constant sur la longueur commune pour limiter les fuites par timing. */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a[i]! ^ b[i]!;
  return out === 0;
}
