import crypto from "node:crypto";

const VERSION = "v0";
const MAX_SKEW_SECONDS = 60 * 5;

/**
 * Verifies Slack's request signature.
 * https://api.slack.com/authentication/verifying-requests-from-slack
 *
 * This is what replaces "whoever holds the token in a URL can approve": only a
 * request Slack actually signed, within the last five minutes, can resolve an
 * approval.
 */
export function verifySlackSignature({
  signingSecret,
  signature,
  timestamp,
  rawBody,
  now = Date.now(),
}: {
  signingSecret: string;
  signature: string | null;
  timestamp: string | null;
  rawBody: string;
  now?: number;
}): { valid: boolean; reason?: string } {
  if (!signature || !timestamp) return { valid: false, reason: "missing_signature_headers" };

  const ts = Number.parseInt(timestamp, 10);
  if (Number.isNaN(ts)) return { valid: false, reason: "bad_timestamp" };

  // Reject replays of an old, legitimately-signed request.
  if (Math.abs(now / 1000 - ts) > MAX_SKEW_SECONDS) {
    return { valid: false, reason: "stale_timestamp" };
  }

  const expected = `${VERSION}=${crypto
    .createHmac("sha256", signingSecret)
    .update(`${VERSION}:${ts}:${rawBody}`)
    .digest("hex")}`;

  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return { valid: false, reason: "signature_mismatch" };
  if (!crypto.timingSafeEqual(a, b)) return { valid: false, reason: "signature_mismatch" };

  return { valid: true };
}
