import { anthropic } from "@/lib/anthropic";
import { buildPlanningSystemPrompt } from "./prompts";
import type { HubspotAccountState } from "@/lib/hubspot/reader";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function streamPlanningChat(
  messages: ChatMessage[],
  accountState: HubspotAccountState,
  onChunk: (chunk: string) => void,
  onComplete: (fullText: string) => void
) {
  const systemPrompt = buildPlanningSystemPrompt(accountState);

  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  let fullText = "";

  for await (const chunk of stream) {
    if (
      chunk.type === "content_block_delta" &&
      chunk.delta.type === "text_delta"
    ) {
      fullText += chunk.delta.text;
      onChunk(chunk.delta.text);
    }
  }

  onComplete(fullText);
  return fullText;
}

export function extractPlanFromMessage(message: string): object | null {
  // Look for JSON plan block in assistant message
  const jsonMatch = message.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (parsed.apiTasks && parsed.manualTasks) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
