import { ApiFramework, ApiHttpMethod } from '@prisma/client';

import { NestJsExtractor } from './nest-js.extractor';
import { createApiExtractionContext } from '../../../../../test/scanner/api-extractor-test.util';
import { SchemaExtractorService } from '../schemas/schema-extractor.service';

describe(NestJsExtractor.name, () => {
  it('extracts NestJS controller routes, DTO schemas, and auth metadata', async () => {
    const context = await createApiExtractionContext([ApiFramework.NESTJS]);
    const extractor = new NestJsExtractor(new SchemaExtractorService());

    const routes = await extractor.extractRoutes(context);
    const getUser = routes.find(
      (route) => route.method === ApiHttpMethod.GET && route.path === '/users/:id',
    );
    const createUser = routes.find(
      (route) => route.method === ApiHttpMethod.POST && route.path === '/users',
    );

    expect(getUser?.authMetadata.authRequired).toBe(true);
    expect(getUser?.authMetadata.guards).toEqual(['JwtGuard']);
    expect(getUser?.controllerName).toBe('UsersController');
    expect(getUser?.handlerName).toBe('getUser');
    expect(getUser?.requestSchema.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          in: 'path',
          name: 'id',
        }),
        expect.objectContaining({
          in: 'query',
          name: 'include',
        }),
      ]),
    );
    expect(createUser?.authMetadata.roles).toEqual(['ADMIN']);
    expect(createUser?.requestSchema.body?.properties?.['email']).toEqual({
      type: 'string',
    });
    expect(createUser?.requestSchema.body?.properties?.['name']).toEqual({
      type: 'string',
    });
    expect(createUser?.requestSchema.body?.required).toEqual(['email', 'name']);
    expect(createUser?.requestSchema.body?.type).toBe('object');
    expect(createUser?.responseSchema.confidence).toBe('HIGH');
  });
});
