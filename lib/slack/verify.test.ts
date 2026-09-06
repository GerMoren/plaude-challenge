import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifySlackSignature } from "./verify";

const SECRET = "test-signing-secret";
const BODY = "payload=%7B%22type%22%3A%22block_actions%22%7D";

function sign(timestamp: number, body = BODY, secret = SECRET) {
  return `v0=${crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${body}`)
    .digest("hex")}`;
}

describe("verifySlackSignature", () => {
  const now = 1_788_700_000_000;
  const ts = Math.floor(now / 1000);

  it("accepts a correctly signed, fresh request", () => {
    const result = verifySlackSignature({
      signingSecret: SECRET,
      signature: sign(ts),
      timestamp: String(ts),
      rawBody: BODY,
      now,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects a signature made with the wrong secret", () => {
    const result = verifySlackSignature({
      signingSecret: SECRET,
      signature: sign(ts, BODY, "attacker-secret"),
      timestamp: String(ts),
      rawBody: BODY,
      now,
    });
    expect(result).toEqual({ valid: false, reason: "signature_mismatch" });
  });

  it("rejects a tampered body", () => {
    const result = verifySlackSignature({
      signingSecret: SECRET,
      signature: sign(ts),
      timestamp: String(ts),
      rawBody: `${BODY}&approved=true`,
      now,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a replayed old request", () => {
    const oldTs = ts - 60 * 10;
    const result = verifySlackSignature({
      signingSecret: SECRET,
      signature: sign(oldTs),
      timestamp: String(oldTs),
      rawBody: BODY,
      now,
    });
    expect(result).toEqual({ valid: false, reason: "stale_timestamp" });
  });

  it("rejects a request with no signature headers", () => {
    const result = verifySlackSignature({
      signingSecret: SECRET,
      signature: null,
      timestamp: null,
      rawBody: BODY,
      now,
    });
    expect(result).toEqual({ valid: false, reason: "missing_signature_headers" });
  });
});
