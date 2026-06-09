import { Injectable } from '@nestjs/common';
import { ApiFramework, ApiHttpMethod } from '@prisma/client';
import { Node } from 'ts-morph';

import { extractPathParameters, normalizeApiPath } from '../discovery/api-route.util';
import { SchemaExtractorService } from '../schemas/schema-extractor.service';

import type {
  ApiAuthMetadata,
  ApiExtractionContext,
  ApiExtractionMetadata,
  ApiExtractor,
  ApiRequestSchema,
  ApiResponseSchema,
  ApiSchemaProperty,
  ApiSchemaRegistry,
  DiscoveredApiRoute,
} from '../types/api-intelligence.types';
import type {
  ClassDeclaration,
  Decorator,
  MethodDeclaration,
  ParameterDeclaration,
} from 'ts-morph';

const NEST_ROUTE_DECORATORS = new Map<string, ApiHttpMethod>([
  ['Delete', ApiHttpMethod.DELETE],
  ['Get', ApiHttpMethod.GET],
  ['Patch', ApiHttpMethod.PATCH],
  ['Post', ApiHttpMethod.POST],
  ['Put', ApiHttpMethod.PUT],
]);

@Injectable()
export class NestJsExtractor implements ApiExtractor {
  constructor(private readonly schemaExtractor: SchemaExtractorService) {}

  supports(context: ApiExtractionContext): boolean {
    return (
      context.codeIntelligence.frameworks.some((framework) => framework.framework === 'NestJS') ||
      context.codeIntelligence.files.some((file) =>
        file.imports.some((importDeclaration) =>
          importDeclaration.moduleSpecifier.startsWith('@nestjs/'),
        ),
      )
    );
  }

  extractRoutes(context: ApiExtractionContext): Promise<DiscoveredApiRoute[]> {
    const routes: DiscoveredApiRoute[] = [];

    for (const sourceFile of context.sourceProject.sourceFiles) {
      for (const classDeclaration of sourceFile.getClasses()) {
        const controllerDecorator = this.findDecorator(classDeclaration, 'Controller');

        if (!controllerDecorator) {
          continue;
        }

        const controllerPath = this.getDecoratorStringArgument(controllerDecorator);

        for (const methodDeclaration of classDeclaration.getMethods()) {
          for (const routeDecorator of this.findRouteDecorators(methodDeclaration)) {
            const routePath = this.getDecoratorStringArgument(routeDecorator.decorator);
            const path = normalizeApiPath(controllerPath, routePath);

            routes.push({
              authMetadata: this.extractAuthMetadata(classDeclaration, methodDeclaration),
              controllerName: classDeclaration.getName() ?? null,
              filePath: this.toRelativeFilePath(sourceFile.getFilePath()),
              framework: ApiFramework.NESTJS,
              handlerName: methodDeclaration.getName(),
              lineNumber: methodDeclaration.getStartLineNumber(),
              method: routeDecorator.method,
              path,
              requestSchema: this.extractRequestSchema(methodDeclaration, path),
              responseSchema: this.extractResponseSchema(methodDeclaration, routeDecorator.method),
            });
          }
        }
      }
    }

    return Promise.resolve(routes);
  }

  extractSchemas(context: ApiExtractionContext): Promise<ApiSchemaRegistry> {
    const schemas: Record<string, ApiSchemaProperty> = {};

    for (const sourceFile of context.sourceProject.sourceFiles) {
      if (!this.isNestSourceFile(sourceFile.getText())) {
        continue;
      }

      for (const classDeclaration of sourceFile.getClasses()) {
        const className = classDeclaration.getName();

        if (!className) {
          continue;
        }

        const schema = this.schemaExtractor.extractTypeSchema(classDeclaration.getType());

        if (schema) {
          schemas[className] = schema;
        }
      }

      for (const interfaceDeclaration of sourceFile.getInterfaces()) {
        const schema = this.schemaExtractor.extractTypeSchema(interfaceDeclaration.getType());

        if (schema) {
          schemas[interfaceDeclaration.getName()] = schema;
        }
      }

      for (const typeAlias of sourceFile.getTypeAliases()) {
        const schema = this.schemaExtractor.extractTypeSchema(typeAlias.getType());

        if (schema) {
          schemas[typeAlias.getName()] = schema;
        }
      }
    }

    return Promise.resolve({
      schemas,
    });
  }

  async extractMetadata(context: ApiExtractionContext): Promise<ApiExtractionMetadata> {
    const [routes, schemas] = await Promise.all([
      this.extractRoutes(context),
      this.extractSchemas(context),
    ]);

    return {
      framework: ApiFramework.NESTJS,
      routeCount: routes.length,
      schemaCount: Object.keys(schemas.schemas).length,
    };
  }

  private findRouteDecorators(
    methodDeclaration: MethodDeclaration,
  ): { decorator: Decorator; method: ApiHttpMethod }[] {
    return methodDeclaration
      .getDecorators()
      .map((decorator) => ({
        decorator,
        method: NEST_ROUTE_DECORATORS.get(decorator.getName()) ?? null,
      }))
      .filter(
        (route): route is { decorator: Decorator; method: ApiHttpMethod } => route.method !== null,
      );
  }

  private extractRequestSchema(
    methodDeclaration: MethodDeclaration,
    path: string,
  ): ApiRequestSchema {
    const parameters = extractPathParameters(path);
    let body: ApiSchemaProperty | null = null;

    for (const parameter of methodDeclaration.getParameters()) {
      const bodyDecorator = this.findDecorator(parameter, 'Body');
      const queryDecorator = this.findDecorator(parameter, 'Query');

      if (bodyDecorator) {
        body = this.schemaExtractor.extractParameterSchema(parameter);
      }

      if (queryDecorator) {
        const queryName = this.getDecoratorStringArgument(queryDecorator) ?? parameter.getName();

        parameters.push({
          in: 'query',
          name: queryName,
          required: !parameter.isOptional(),
          schema: this.schemaExtractor.extractParameterSchema(parameter) ?? {
            type: 'string',
          },
        });
      }
    }

    return {
      body,
      parameters,
    };
  }

  private extractResponseSchema(
    methodDeclaration: MethodDeclaration,
    method: ApiHttpMethod,
  ): ApiResponseSchema {
    const returnType = methodDeclaration.getReturnType();
    const body = this.schemaExtractor.extractTypeSchema(returnType);
    const typeName = this.schemaExtractor.getTypeName(returnType);

    return {
      body,
      confidence: body ? 'HIGH' : 'LOW',
      statusCode: method === ApiHttpMethod.POST ? 201 : 200,
      typeName,
    };
  }

  private extractAuthMetadata(
    classDeclaration: ClassDeclaration,
    methodDeclaration: MethodDeclaration,
  ): ApiAuthMetadata {
    const decorators = [...classDeclaration.getDecorators(), ...methodDeclaration.getDecorators()];
    const guards = decorators
      .filter((decorator) => decorator.getName() === 'UseGuards')
      .flatMap((decorator) => this.getDecoratorArgumentTexts(decorator));
    const roles = decorators
      .filter((decorator) => decorator.getName() === 'Roles')
      .flatMap((decorator) => this.getDecoratorStringArguments(decorator));

    return {
      authRequired:
        roles.length > 0 || guards.some((guard) => /AuthGuard|JwtGuard|Passport/i.test(guard)),
      guards,
      middleware: [],
      roles,
    };
  }

  private findDecorator(
    node: ClassDeclaration | MethodDeclaration | ParameterDeclaration,
    name: string,
  ): Decorator | null {
    return node.getDecorators().find((decorator) => decorator.getName() === name) ?? null;
  }

  private getDecoratorStringArgument(decorator: Decorator): string | null {
    return this.getStringLiteralText(decorator.getCallExpression()?.getArguments()[0] ?? null);
  }

  private getDecoratorStringArguments(decorator: Decorator): string[] {
    return (
      decorator
        .getCallExpression()
        ?.getArguments()
        .map((argument) => this.getStringLiteralText(argument))
        .filter((value): value is string => value !== null) ?? []
    );
  }

  private getDecoratorArgumentTexts(decorator: Decorator): string[] {
    return (
      decorator
        .getCallExpression()
        ?.getArguments()
        .map((argument) => argument.getText()) ?? []
    );
  }

  private getStringLiteralText(node: Node | null): string | null {
    if (!node) {
      return null;
    }

    if (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) {
      return node.getLiteralText();
    }

    return null;
  }

  private isNestSourceFile(sourceCode: string): boolean {
    return sourceCode.includes('@nestjs/') || sourceCode.includes('@Controller');
  }

  private toRelativeFilePath(filePath: string): string {
    return filePath.replace(/^\/+/, '');
  }
}
