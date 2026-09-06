import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { UserRound, Bot, Clock, ShieldCheck, ShieldX, AlertTriangle } from "lucide-react";
import { classifyApprovalOutcome } from "@/lib/approval-outcome";
import type { UIMessage } from "ai";

type ToolPart = { type: string; toolCallId?: string; output?: string; state?: string };

function ApprovalCard({ output, errored }: { output?: string; errored?: boolean }) {
  const decision = classifyApprovalOutcome(output, errored);

  if (decision === "pending") {
    return (
      <Alert className="border-amber-300/60 bg-amber-500/10 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
        <Clock className="h-4 w-4" />
        <AlertTitle>Human approval requested</AlertTitle>
        <AlertDescription>Waiting on a human reviewer to respond.</AlertDescription>
      </Alert>
    );
  }

  // A failure to *reach* a reviewer is not a decision. Showing it as a rejection
  // would tell the customer a human turned them down when no human ever saw it.
  if (decision === "unavailable") {
    return (
      <Alert className="border-amber-300/60 bg-amber-500/10 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Couldn&apos;t reach a reviewer</AlertTitle>
        <AlertDescription>
          This request hasn&apos;t been decided yet. Nothing was approved or rejected.
        </AlertDescription>
      </Alert>
    );
  }

  const approved = decision === "approved";

  return (
    <Alert
      className={cn(
        approved
          ? "border-emerald-300/60 bg-emerald-500/10 [&>svg]:text-emerald-600 dark:[&>svg]:text-emerald-400"
          : "border-red-300/60 bg-red-500/10 [&>svg]:text-red-600 dark:[&>svg]:text-red-400",
      )}
    >
      {approved ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}
      <AlertTitle>{approved ? "Approved by reviewer" : "Rejected by reviewer"}</AlertTitle>
      <AlertDescription>{output}</AlertDescription>
    </Alert>
  );
}

export function ChatMessage({
  message,
  toolCallOwners,
}: {
  message: UIMessage;
  toolCallOwners?: Map<string, string>;
}) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={isUser ? "bg-primary text-primary-foreground" : "bg-muted"}>
          {isUser ? <UserRound className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn("flex max-w-[80%] flex-col gap-2", isUser && "items-end")}>
        <Badge variant="outline" className="w-fit text-[10px] font-medium uppercase tracking-wide">
          {isUser ? "You" : "Agent"}
        </Badge>

        {message.parts.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={cn(
                  "rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap",
                  isUser
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm",
                )}
              >
                {part.text}
              </div>
            );
          }
          if (part.type === "tool-requestHumanApproval") {
            const toolPart = part as ToolPart;
            const owner = toolPart.toolCallId
              ? toolCallOwners?.get(toolPart.toolCallId)
              : undefined;
            // A resumed run can replay the same call in a second message.
            if (owner && owner !== message.id) return null;
            return (
              <ApprovalCard
                key={i}
                output={toolPart.output}
                errored={toolPart.state === "output-error"}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
