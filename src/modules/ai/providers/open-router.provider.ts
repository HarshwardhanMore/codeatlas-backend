import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AiCompletionInput,
  AiCompletionResult,
  AiCompletionUsage,
  AiProvider,
} from './ai-provider.interface';

const OPENROUTER_CHAT_COMPLETIONS_URL = 'https://openrouter.ai/api/v1/chat/completions';
const CODEATLAS_TITLE = 'CodeAtlas';
const DEFAULT_COMPLETION_TOKENS = 1600;
const DEFAULT_TEMPERATURE = 0.2;

@Injectable()
export class OpenRouterProvider implements AiProvider {
  constructor(private readonly configService: ConfigService) {}

  async complete(input: AiCompletionInput): Promise<AiCompletionResult> {
    const apiKey = this.configService.getOrThrow<string>('ai.openRouterApiKey');

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OpenRouter is not configured. Set OPENROUTER_API_KEY before using the AI assistant.',
      );
    }

    const response = await this.fetchCompletion(apiKey, input);

    if (!response.ok) {
      if (response.status === 429) {
        throw new HttpException('AI provider rate limit reached.', HttpStatus.TOO_MANY_REQUESTS);
      }

      throw new BadGatewayException('AI provider request failed.');
    }

    return this.parseCompletion(await response.json());
  }

  async *stream(input: AiCompletionInput): AsyncIterable<string> {
    const completion = await this.complete(input);

    yield completion.content;
  }

  private async fetchCompletion(apiKey: string, input: AiCompletionInput): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.configService.getOrThrow<number>('ai.providerTimeoutMs'));

    try {
      return await fetch(OPENROUTER_CHAT_COMPLETIONS_URL, {
        body: JSON.stringify({
          max_tokens: DEFAULT_COMPLETION_TOKENS,
          messages: input.messages,
          model: input.model,
          temperature: DEFAULT_TEMPERATURE,
          user: input.userId,
        }),
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': this.configService.getOrThrow<string>('app.frontendOrigin'),
          'X-OpenRouter-Title': CODEATLAS_TITLE,
        },
        method: 'POST',
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('AI provider request timed out.');
      }

      throw new BadGatewayException('AI provider request failed.');
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseCompletion(payload: unknown): AiCompletionResult {
    const record = this.assertRecord(payload, 'OpenRouter response');
    const choices = record['choices'];
    const model = this.getString(record, 'model') ?? 'unknown';
    const usage = this.parseUsage(record['usage']);

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new BadGatewayException('AI provider response was empty.');
    }

    const firstChoice = this.assertRecord(choices[0], 'OpenRouter choice');
    const message = this.assertRecord(firstChoice['message'], 'OpenRouter message');
    const content = this.getString(message, 'content');

    if (!content) {
      throw new BadGatewayException('AI provider response content was empty.');
    }

    return {
      content,
      model,
      usage,
    };
  }

  private parseUsage(value: unknown): AiCompletionUsage {
    if (!this.isRecord(value)) {
      return {
        completionTokens: null,
        promptTokens: null,
        totalTokens: null,
      };
    }

    return {
      completionTokens: this.getNumber(value, 'completion_tokens'),
      promptTokens: this.getNumber(value, 'prompt_tokens'),
      totalTokens: this.getNumber(value, 'total_tokens'),
    };
  }

  private assertRecord(value: unknown, label: string): Record<string, unknown> {
    if (!this.isRecord(value)) {
      throw new BadGatewayException(`${label} was invalid.`);
    }

    return value;
  }

  private getNumber(record: Record<string, unknown>, key: string): number | null {
    const value = record[key];

    return typeof value === 'number' ? value : null;
  }

  private getString(record: Record<string, unknown>, key: string): string | null {
    const value = record[key];

    return typeof value === 'string' ? value : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
