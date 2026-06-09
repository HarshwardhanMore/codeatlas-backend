import { BadGatewayException } from '@nestjs/common';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function assertRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadGatewayException(`${context} was not a valid object.`);
  }

  return value;
}

export function getStringProperty(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];

  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function getRequiredStringProperty(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = getStringProperty(record, key);

  if (!value) {
    throw new BadGatewayException(`${context} did not include ${key}.`);
  }

  return value;
}

export function getStringOrNumberProperty(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function getRequiredStringOrNumberProperty(
  record: Record<string, unknown>,
  key: string,
  context: string,
): string {
  const value = getStringOrNumberProperty(record, key);

  if (!value) {
    throw new BadGatewayException(`${context} did not include ${key}.`);
  }

  return value;
}

export function getNumberProperty(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];

  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getBooleanProperty(record: Record<string, unknown>, key: string): boolean | null {
  const value = record[key];

  return typeof value === 'boolean' ? value : null;
}

export function getRecordProperty(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = record[key];

  return isRecord(value) ? value : null;
}

export function splitScopeString(scope: string | null): string[] {
  if (!scope) {
    return [];
  }

  return scope
    .split(/[\s,]+/)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function readProviderJson(response: Response, context: string): Promise<unknown> {
  const text = await response.text();
  const payload = parseProviderJson(text, context);

  if (!response.ok) {
    throw new BadGatewayException(`${context} request failed.`);
  }

  return payload;
}

export async function fetchProviderJson(
  url: string | URL,
  init: RequestInit,
  context: string,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });

    return await readProviderJson(response, context);
  } catch (error) {
    if (error instanceof BadGatewayException) {
      throw error;
    }

    throw new BadGatewayException(`${context} request failed.`);
  } finally {
    clearTimeout(timeout);
  }
}

function parseProviderJson(text: string, context: string): unknown {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new BadGatewayException(`${context} response was not valid JSON.`);
  }
}
