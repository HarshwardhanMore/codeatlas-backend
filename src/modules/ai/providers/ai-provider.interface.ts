export type AiMessageRole = 'assistant' | 'system' | 'user';

export interface AiProviderMessage {
  content: string;
  role: AiMessageRole;
}

export interface AiCompletionInput {
  messages: AiProviderMessage[];
  model: string;
  userId: string;
}

export interface AiCompletionUsage {
  completionTokens: number | null;
  promptTokens: number | null;
  totalTokens: number | null;
}

export interface AiCompletionResult {
  content: string;
  model: string;
  usage: AiCompletionUsage;
}

export interface AiProvider {
  complete(input: AiCompletionInput): Promise<AiCompletionResult>;
  stream(input: AiCompletionInput): AsyncIterable<string>;
}
