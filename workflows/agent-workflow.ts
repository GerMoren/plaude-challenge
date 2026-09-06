import { DurableAgent } from "@workflow/ai/agent";
import { getWritable } from "workflow";
import type { ModelMessage, UIMessageChunk } from "ai";
import { AGENT_SYSTEM_PROMPT } from "@/lib/instructions";
import { agentTools } from "@/lib/tools";

export async function agentWorkflow(messages: ModelMessage[]) {
  "use workflow";

  const writable = getWritable<UIMessageChunk>();

  const agent = new DurableAgent({
    model: process.env.AGENT_MODEL ?? "openai/gpt-4o-mini",
    instructions: AGENT_SYSTEM_PROMPT,
    tools: agentTools,
  });

  await agent.stream({
    messages,
    writable,
    maxSteps: 10,
  });
}
