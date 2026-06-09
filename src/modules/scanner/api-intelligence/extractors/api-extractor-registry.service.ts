import { Injectable } from '@nestjs/common';

import { ExpressExtractor } from './express.extractor';
import { NestJsExtractor } from './nest-js.extractor';

import type { ApiExtractionContext, ApiExtractor } from '../types/api-intelligence.types';

@Injectable()
export class ApiExtractorRegistryService {
  constructor(
    private readonly expressExtractor: ExpressExtractor,
    private readonly nestJsExtractor: NestJsExtractor,
  ) {}

  getSupportedExtractors(context: ApiExtractionContext): ApiExtractor[] {
    return [this.nestJsExtractor, this.expressExtractor].filter((extractor) =>
      extractor.supports(context),
    );
  }
}
