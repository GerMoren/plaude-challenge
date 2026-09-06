"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

export default function Home() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold">Plaude Challenge Agent</h1>
      <p className="text-sm text-gray-500">
        Ask for a refund, a high-value operation, or an ambiguous request. The
        agent will escalate to a human on Slack when the plain-text policy
        requires it.
      </p>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto rounded border p-4">
        {messages.map((message) => (
          <div key={message.id} className="flex flex-col gap-1">
            <span className="text-xs font-medium uppercase text-gray-400">
              {message.role}
            </span>
            {message.parts.map((part, i) => {
              if (part.type === "text") {
                return (
                  <p key={i} className="whitespace-pre-wrap text-sm">
                    {part.text}
                  </p>
                );
              }
              if (part.type === "tool-requestHumanApproval") {
                const output = (part as { output?: string }).output;
                return (
                  <div
                    key={i}
                    className="rounded border border-amber-300 bg-amber-50 p-3 text-sm"
                  >
                    <p className="font-medium">Human approval requested</p>
                    {output ? (
                      <p className="mt-1">{output}</p>
                    ) : (
                      <p className="mt-1">
                        Waiting on a human reviewer on Slack.
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. I need a $500 refund for order #123"
          className="flex-1 rounded border p-2 text-sm"
        />
        <button
          type="submit"
          disabled={status === "streaming" || status === "submitted"}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
