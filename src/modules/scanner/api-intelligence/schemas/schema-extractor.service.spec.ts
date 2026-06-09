import { Project } from 'ts-morph';

import { SchemaExtractorService } from './schema-extractor.service';

describe(SchemaExtractorService.name, () => {
  it('converts TypeScript DTO properties into JSON schema metadata', () => {
    const project = new Project({
      skipAddingFilesFromTsConfig: true,
      useInMemoryFileSystem: true,
    });
    const sourceFile = project.createSourceFile(
      'dto.ts',
      `
        export class CreateProjectDto {
          name: string;
          privateRepo?: boolean;
          score: number;
        }
      `,
    );
    const dto = sourceFile.getClassOrThrow('CreateProjectDto');
    const service = new SchemaExtractorService();

    expect(service.extractTypeSchema(dto.getType())).toEqual({
      properties: {
        name: {
          type: 'string',
        },
        privateRepo: {
          type: 'boolean',
        },
        score: {
          type: 'number',
        },
      },
      required: ['name', 'score'],
      type: 'object',
    });
  });
});
