import { Injectable } from '@nestjs/common';

import { GitSourceMaterializer } from './git-source-materializer.service';
import { SourceMaterializationError } from './source-materialization.error';
import { ZipSourceMaterializer } from './zip-source-materializer.service';

import type {
  MaterializedRepositorySource,
  MaterializeRepositorySourceInput,
  SourceMaterializer,
} from './source-materializer.interface';

@Injectable()
export class SourceMaterializerRegistryService {
  private readonly materializers: SourceMaterializer[];

  constructor(
    gitSourceMaterializer: GitSourceMaterializer,
    zipSourceMaterializer: ZipSourceMaterializer,
  ) {
    this.materializers = [gitSourceMaterializer, zipSourceMaterializer];
  }

  materialize(input: MaterializeRepositorySourceInput): Promise<MaterializedRepositorySource> {
    const materializer = this.materializers.find((candidate) =>
      candidate.supports(input.repository.provider),
    );

    if (!materializer) {
      throw new SourceMaterializationError('Repository provider is not supported for analysis.');
    }

    return materializer.materialize(input);
  }
}
