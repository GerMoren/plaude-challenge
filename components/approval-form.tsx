"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export function ApprovalForm({ token }: { token: string }) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(approved: boolean) {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/hooks/approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, approved, comment }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? `Request failed: ${response.status}`);
      }
      setResult(approved ? "approved" : "rejected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (result) {
    const approved = result === "approved";
    return (
      <Alert
        className={
          approved
            ? "border-emerald-300/60 bg-emerald-500/10 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400"
            : "border-red-300/60 bg-red-500/10 [&>svg]:text-red-600 dark:[&>svg]:text-red-400"
        }
      >
        {approved ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        <AlertTitle>Decision recorded: {result}</AlertTitle>
        <AlertDescription>The agent will resume automatically.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert className="border-red-300/60 bg-red-500/10 [&>svg]:text-red-600 dark:[&>svg]:text-red-400">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Couldn&apos;t submit your decision</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)..."
        rows={3}
        disabled={isSubmitting}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={() => submit(true)}
          disabled={isSubmitting}
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          Approve
        </Button>
        <Button
          type="button"
          onClick={() => submit(false)}
          disabled={isSubmitting}
          className="flex-1 bg-red-600 text-white hover:bg-red-700"
        >
          Reject
        </Button>
      </div>
    </div>
  );
}
