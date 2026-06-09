import { Injectable } from '@nestjs/common';
import { ApiFramework, ApiHttpMethod } from '@prisma/client';
import { Node, SyntaxKind } from 'ts-morph';

import { extractPathParameters } from '../discovery/api-route.util';
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
  ArrowFunction,
  CallExpression,
  FunctionDeclaration,
  FunctionExpression,
  SourceFile,
} from 'ts-morph';

type ExpressHandlerDeclaration = ArrowFunction | FunctionDeclaration | FunctionExpression;

const EXPRESS_ROUTE_METHODS = new Map<string, ApiHttpMethod>([
  ['delete', ApiHttpMethod.DELETE],
  ['get', ApiHttpMethod.GET],
  ['patch', ApiHttpMethod.PATCH],
  ['post', ApiHttpMethod.POST],
  ['put', ApiHttpMethod.PUT],
]);

@Injectable()
export class ExpressExtractor implements ApiExtractor {
  constructor(private readonly schemaExtractor: SchemaExtractorService) {}

  supports(context: ApiExtractionContext): boolean {
    return (
      context.codeIntelligence.frameworks.some((framework) => framework.framework === 'Express') ||
      context.codeIntelligence.files.some((file) =>
        file.imports.some((importDeclaration) => importDeclaration.moduleSpecifier === 'express'),
      )
    );
  }

  extractRoutes(context: ApiExtractionContext): Promise<DiscoveredApiRoute[]> {
    const routes: DiscoveredApiRoute[] = [];

    for (const sourceFile of context.sourceProject.sourceFiles) {
      for (const callExpression of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const routeCall = this.parseRouteCall(callExpression);

        if (!routeCall) {
          continue;
        }

        routes.push({
          authMetadata: this.extractAuthMetadata(routeCall.middleware),
          controllerName: null,
          filePath: this.toRelativeFilePath(sourceFile.getFilePath()),
          framework: ApiFramework.EXPRESS,
          handlerName: this.getHandlerName(routeCall.handler),
          lineNumber: callExpression.getStartLineNumber(),
          method: routeCall.method,
          path: routeCall.path,
          requestSchema: this.extractRequestSchema(routeCall.handler, routeCall.path, sourceFile),
          responseSchema: this.extractResponseSchema(
            routeCall.handler,
            routeCall.method,
            sourceFile,
          ),
        });
      }
    }

    return Promise.resolve(routes);
  }

  extractSchemas(context: ApiExtractionContext): Promise<ApiSchemaRegistry> {
    const schemas: Record<string, ApiSchemaProperty> = {};

    for (const sourceFile of context.sourceProject.sourceFiles) {
      if (!sourceFile.getText().includes('express')) {
        continue;
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
      framework: ApiFramework.EXPRESS,
      routeCount: routes.length,
      schemaCount: Object.keys(schemas.schemas).length,
    };
  }

  private parseRouteCall(callExpression: CallExpression): {
    handler: Node;
    method: ApiHttpMethod;
    middleware: string[];
    path: string;
  } | null {
    const expression = callExpression.getExpression();

    if (!Node.isPropertyAccessExpression(expression)) {
      return null;
    }

    const method = EXPRESS_ROUTE_METHODS.get(expression.getName());
    const target = expression.getExpression().getText();

    if (!method || (target !== 'app' && target !== 'router')) {
      return null;
    }

    const args = callExpression.getArguments();
    const path = this.getStringLiteralText(args[0] ?? null);
    const handler = args[args.length - 1];

    if (!path || !handler || args.length < 2) {
      return null;
    }

    return {
      handler,
      method,
      middleware: args.slice(1, -1).map((argument) => argument.getText()),
      path,
    };
  }

  private extractRequestSchema(
    handler: Node,
    path: string,
    sourceFile: SourceFile,
  ): ApiRequestSchema {
    return {
      body: this.extractBodySchema(handler, sourceFile),
      parameters: extractPathParameters(path),
    };
  }

  private extractBodySchema(handler: Node, sourceFile: SourceFile): ApiSchemaProperty | null {
    const handlerDeclaration = this.resolveHandlerDeclaration(handler, sourceFile);
    const requestParameter = handlerDeclaration?.getParameters()[0];

    if (!requestParameter) {
      return null;
    }

    return this.schemaExtractor.extractPropertySchema(requestParameter.getType(), 'body');
  }

  private extractResponseSchema(
    handler: Node,
    method: ApiHttpMethod,
    sourceFile: SourceFile,
  ): ApiResponseSchema {
    const handlerDeclaration = this.resolveHandlerDeclaration(handler, sourceFile);
    const returnType = handlerDeclaration?.getReturnType();
    const body = returnType ? this.schemaExtractor.extractTypeSchema(returnType) : null;

    return {
      body,
      confidence: body ? 'MEDIUM' : 'LOW',
      statusCode: method === ApiHttpMethod.POST ? 201 : 200,
      typeName: returnType ? this.schemaExtractor.getTypeName(returnType) : null,
    };
  }

  private extractAuthMetadata(middleware: string[]): ApiAuthMetadata {
    const roles = middleware.flatMap((middlewareExpression) => {
      const matches = [...middlewareExpression.matchAll(/['"]([A-Z_]+)['"]/g)];

      return matches.map((match) => match[1]).filter((role): role is string => Boolean(role));
    });

    return {
      authRequired: middleware.some((value) => /auth|jwt|passport|session/i.test(value)),
      guards: [],
      middleware,
      roles,
    };
  }

  private resolveHandlerDeclaration(
    handler: Node,
    sourceFile: SourceFile,
  ): ExpressHandlerDeclaration | null {
    if (Node.isFunctionExpression(handler) || Node.isArrowFunction(handler)) {
      return handler;
    }

    if (!Node.isIdentifier(handler)) {
      return null;
    }

    const functionDeclaration = sourceFile.getFunction(handler.getText());

    if (functionDeclaration) {
      return functionDeclaration;
    }

    const variableDeclaration = sourceFile.getVariableDeclaration(handler.getText());
    const initializer = variableDeclaration?.getInitializer();

    if (
      initializer &&
      (Node.isFunctionExpression(initializer) || Node.isArrowFunction(initializer))
    ) {
      return initializer;
    }

    return null;
  }

  private getHandlerName(handler: Node): string | null {
    if (Node.isIdentifier(handler)) {
      return handler.getText();
    }

    if (Node.isFunctionExpression(handler)) {
      return handler.getName() ?? null;
    }

    return null;
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

  private toRelativeFilePath(filePath: string): string {
    return filePath.replace(/^\/+/, '');
  }
}
