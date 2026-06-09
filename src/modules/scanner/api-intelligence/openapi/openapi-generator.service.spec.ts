import { ApiFramework, ApiHttpMethod } from '@prisma/client';

import { OpenApiGeneratorService } from './openapi-generator.service';

import type { DiscoveredApiRoute } from '../types/api-intelligence.types';

const route: DiscoveredApiRoute = {
  authMetadata: {
    authRequired: true,
    guards: ['JwtGuard'],
    middleware: [],
    roles: ['ADMIN'],
  },
  controllerName: 'UsersController',
  filePath: 'src/users.controller.ts',
  framework: ApiFramework.NESTJS,
  handlerName: 'getUser',
  lineNumber: 10,
  method: ApiHttpMethod.GET,
  path: '/users/:id',
  requestSchema: {
    body: null,
    parameters: [
      {
        in: 'path',
        name: 'id',
        required: true,
        schema: {
          type: 'string',
        },
      },
    ],
  },
  responseSchema: {
    body: {
      properties: {
        id: {
          type: 'string',
        },
      },
      required: ['id'],
      type: 'object',
    },
    confidence: 'HIGH',
    statusCode: 200,
    typeName: 'UserDto',
  },
};

describe(OpenApiGeneratorService.name, () => {
  it('generates a valid OpenAPI path with security and parameters', () => {
    const service = new OpenApiGeneratorService();

    const document = service.generateRepositoryDocument('owner/api', [route]);

    expect(document.openapi).toBe('3.1.0');
    expect(document.paths['/users/{id}']?.get).toEqual(
      expect.objectContaining({
        parameters: route.requestSchema.parameters,
        security: [
          {
            bearerAuth: [],
          },
        ],
        summary: 'GET /users/:id',
      }),
    );
  });
});
