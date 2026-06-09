import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { ApiContractSnapshot } from './api-versioning.types';
import type { DiscoveredApiRoute } from '../types/api-intelligence.types';

@Injectable()
export class ApiContractHashService {
  createContract(api: DiscoveredApiRoute): ApiContractSnapshot {
    return {
      authMetadata: api.authMetadata,
      controllerName: api.controllerName,
      filePath: api.filePath,
      framework: api.framework,
      handlerName: api.handlerName,
      lineNumber: api.lineNumber,
      method: api.method,
      path: api.path,
      requestSchema: api.requestSchema,
      responseSchema: api.responseSchema,
    };
  }

  hashContract(contract: ApiContractSnapshot): string {
    return createHash('sha256').update(this.stableStringify(contract)).digest('hex');
  }

  stableStringify(value: unknown): string {
    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableStringify(item)).join(',')}]`;
    }

    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;

      return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${this.stableStringify(record[key])}`)
        .join(',')}}`;
    }

    return JSON.stringify(value);
  }
}
