import { SchemaDiffService } from './schema-diff.service';

import type { ApiSchemaProperty } from '../types/api-intelligence.types';

const oldSchema: ApiSchemaProperty = {
  properties: {
    name: {
      type: 'string',
    },
    profile: {
      properties: {
        age: {
          type: 'number',
        },
      },
      required: ['age'],
      type: 'object',
    },
  },
  required: ['name'],
  type: 'object',
};

describe(SchemaDiffService.name, () => {
  it('detects removed, added, and type-changed fields', () => {
    const service = new SchemaDiffService();

    const result = service.diff(oldSchema, {
      properties: {
        fullName: {
          type: 'string',
        },
        name: {
          type: 'number',
        },
        optionalCode: {
          type: 'string',
        },
      },
      required: ['fullName'],
      type: 'object',
    });

    expect(result.removed).toEqual(
      expect.arrayContaining([
        {
          path: 'profile',
          required: false,
          type: 'object',
        },
      ]),
    );
    expect(result.added).toEqual(
      expect.arrayContaining([
        {
          path: 'fullName',
          required: true,
          type: 'string',
        },
        {
          path: 'optionalCode',
          required: false,
          type: 'string',
        },
      ]),
    );
    expect(result.typeChanged).toEqual([
      {
        newType: 'number',
        oldType: 'string',
        path: 'name',
      },
    ]);
  });
});
