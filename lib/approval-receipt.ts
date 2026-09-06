import crypto from "node:crypto";

const TTL_MS = 15 * 60 * 1000;

/**
 * Proof that a human actually approved a specific amount.
 *
 * `issueRefund` used to take an `approvedByHuman: boolean` — an argument the
 * model itself supplies, which means the guard asked the attacker whether the
 * attacker was trustworthy. A receipt is minted server-side only after a real
 * reviewer answers, and is bound to the tool call and the amount, so the model
 * can carry it but cannot forge one, reuse it for a larger refund, or invent it
 * out of a prompt injection.
 */
export type ApprovalClaim = {
  toolCallId: string;
  amountUsd: number;
  issuedAt: number;
};

function signingSecret(): string {
  const secret = process.env.APPROVAL_SIGNING_SECRET ?? process.env.SLACK_SIGNING_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APPROVAL_SIGNING_SECRET (or SLACK_SIGNING_SECRET) must be set in production");
  }
  return "insecure-development-only-secret";
}

function sign(payload: string, secret = signingSecret()): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signApproval(claim: ApprovalClaim): string {
  const payload = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyApproval(
  receipt: string | undefined,
  expected: { toolCallId?: string; amountUsd: number; now?: number },
): { valid: true } | { valid: false; reason: string } {
  if (!receipt) return { valid: false, reason: "No approval receipt was provided." };

  const [payload, signature] = receipt.split(".");
  if (!payload || !signature) return { valid: false, reason: "Malformed approval receipt." };

  const expectedSignature = sign(payload);
  const a = Buffer.from(expectedSignature);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, reason: "Approval receipt signature does not match." };
  }

  let claim: ApprovalClaim;
  try {
    claim = JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return { valid: false, reason: "Unreadable approval receipt." };
  }

  const now = expected.now ?? Date.now();
  if (now - claim.issuedAt > TTL_MS) {
    return { valid: false, reason: "That approval has expired; ask for a fresh one." };
  }

  // An approval for $50 must not be spent on $500.
  if (claim.amountUsd !== expected.amountUsd) {
    return {
      valid: false,
      reason: `That approval was for $${claim.amountUsd}, not $${expected.amountUsd}.`,
    };
  }

  if (expected.toolCallId && claim.toolCallId !== expected.toolCallId) {
    return { valid: false, reason: "That approval belongs to a different request." };
  }

  return { valid: true };
}
