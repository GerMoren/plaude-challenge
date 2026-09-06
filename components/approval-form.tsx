"use client";

import { useState } from "react";

export function ApprovalForm({ token }: { token: string }) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);

  async function submit(approved: boolean) {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/hooks/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, approved, comment }),
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      setResult(approved ? "approved" : "rejected");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    return (
      <p className="rounded border p-4 text-sm">
        Decision recorded: <strong>{result}</strong>. The agent will resume
        automatically.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)..."
        className="w-full rounded border p-2 text-sm"
        rows={3}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={isSubmitting}
          className="rounded bg-green-600 px-4 py-2 text-white hover:bg-green-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={isSubmitting}
          className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
    </div>
  );
}
