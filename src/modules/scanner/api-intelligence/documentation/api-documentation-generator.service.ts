import { Injectable } from '@nestjs/common';

import type { DiscoveredApiRoute } from '../types/api-intelligence.types';

@Injectable()
export class ApiDocumentationGeneratorService {
  generateMarkdown(api: DiscoveredApiRoute): string {
    return [
      `# ${api.method} ${api.path}`,
      '',
      `Source: ${api.controllerName ?? 'Express route'}.${api.handlerName ?? 'inline handler'}`,
      `File: ${api.filePath}:${api.lineNumber.toString()}`,
      '',
      '## Request',
      this.stringifySection(api.requestSchema),
      '',
      '## Response',
      this.stringifySection(api.responseSchema),
      '',
      '## Authentication',
      api.authMetadata.authRequired
        ? `Required${api.authMetadata.roles.length > 0 ? ` for roles: ${api.authMetadata.roles.join(', ')}` : ''}`
        : 'Not detected',
    ].join('\n');
  }

  private stringifySection(value: unknown): string {
    return ['```json', JSON.stringify(value, null, 2), '```'].join('\n');
  }
}
