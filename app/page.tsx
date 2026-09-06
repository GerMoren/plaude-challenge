"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ChatMessage } from "@/components/chat-message";
import { SendHorizonal, ShieldHalf } from "lucide-react";

export default function Home() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/agent" }),
  });

  const isBusy = status === "streaming" || status === "submitted";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isBusy) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col">
      <header className="flex flex-col gap-2 border-b px-6 py-5">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Plaude Challenge Agent</h1>
          <Badge variant="secondary" className="gap-1">
            <ShieldHalf className="h-3 w-3" />
            Human-in-the-loop
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Ask for a refund, a high-value operation, or an ambiguous request. The
          agent escalates to a human on Slack when the plain-text policy
          requires it.
        </p>
      </header>

      <ScrollArea className="flex-1 px-6">
        <div className="flex flex-col gap-5 py-6">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground">
              Try: &ldquo;I need a $500 refund for order #123&rdquo;
            </p>
          )}
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. I need a $500 refund for order #123"
          disabled={isBusy}
          className="h-11"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={isBusy}>
          <SendHorizonal className="h-4 w-4" />
          <span className="sr-only">Send</span>
        </Button>
      </form>
    </div>
  );
}
