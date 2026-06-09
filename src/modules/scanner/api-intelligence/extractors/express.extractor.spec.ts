import { ApiFramework, ApiHttpMethod } from '@prisma/client';

import { ExpressExtractor } from './express.extractor';
import { createApiExtractionContext } from '../../../../../test/scanner/api-extractor-test.util';
import { SchemaExtractorService } from '../schemas/schema-extractor.service';

describe(ExpressExtractor.name, () => {
  it('extracts Express routes, middleware auth, and typed body schemas', async () => {
    const context = await createApiExtractionContext([ApiFramework.EXPRESS]);
    const extractor = new ExpressExtractor(new SchemaExtractorService());

    const routes = await extractor.extractRoutes(context);
    const getUser = routes.find(
      (route) => route.method === ApiHttpMethod.GET && route.path === '/users/:id',
    );
    const createUser = routes.find(
      (route) => route.method === ApiHttpMethod.POST && route.path === '/users',
    );

    expect(getUser?.authMetadata.authRequired).toBe(true);
    expect(getUser?.authMetadata.roles).toEqual(['ADMIN']);
    expect(getUser?.requestSchema.parameters).toEqual([
      expect.objectContaining({
        in: 'path',
        name: 'id',
      }),
    ]);
    expect(createUser).toEqual(
      expect.objectContaining({
        framework: ApiFramework.EXPRESS,
        handlerName: 'createUser',
      }),
    );
    expect(createUser?.requestSchema.body?.properties?.['email']).toEqual({
      type: 'string',
    });
    expect(createUser?.requestSchema.body?.properties?.['name']).toEqual({
      type: 'string',
    });
    expect(createUser?.responseSchema.body?.properties?.['id']).toEqual({
      type: 'string',
    });
  });
});
