import type { ApiParameterSchema } from '../types/api-intelligence.types';

const PATH_PARAM_PATTERN = /:([A-Za-z0-9_]+)/g;

export function normalizeApiPath(...segments: (string | null | undefined)[]): string {
  const joined = segments
    .filter((segment): segment is string => Boolean(segment))
    .map((segment) => segment.trim().replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

  return `/${joined}`.replace(/\/+/g, '/');
}

export function extractPathParameters(path: string): ApiParameterSchema[] {
  const parameters: ApiParameterSchema[] = [];

  for (const match of path.matchAll(PATH_PARAM_PATTERN)) {
    const name = match[1];

    if (!name) {
      continue;
    }

    parameters.push({
      in: 'path',
      name,
      required: true,
      schema: {
        type: 'string',
      },
    });
  }

  return parameters;
}
