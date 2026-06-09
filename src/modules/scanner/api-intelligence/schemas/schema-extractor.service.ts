import { Injectable } from '@nestjs/common';
import { Node } from 'ts-morph';

import type { ApiSchemaProperty } from '../types/api-intelligence.types';
import type { ParameterDeclaration, Type } from 'ts-morph';

const MAX_SCHEMA_DEPTH = 4;

@Injectable()
export class SchemaExtractorService {
  extractParameterSchema(parameter: ParameterDeclaration): ApiSchemaProperty | null {
    return this.toSchema(parameter.getType(), new Set<string>(), 0);
  }

  extractTypeSchema(type: Type): ApiSchemaProperty | null {
    return this.toSchema(type, new Set<string>(), 0);
  }

  extractPropertySchema(type: Type, propertyName: string): ApiSchemaProperty | null {
    const property = type.getProperty(propertyName);
    const declaration = property?.getValueDeclaration() ?? property?.getDeclarations()[0];

    if (!declaration) {
      return null;
    }

    return this.toSchema(declaration.getType(), new Set<string>(), 0);
  }

  getTypeName(type: Type): string | null {
    const aliasSymbol = type.getAliasSymbol();
    const symbol = type.getSymbol();

    return aliasSymbol?.getName() ?? symbol?.getName() ?? this.cleanTypeText(type.getText());
  }

  private toSchema(type: Type, visitedTypes: Set<string>, depth: number): ApiSchemaProperty | null {
    if (depth > MAX_SCHEMA_DEPTH) {
      return {
        type: 'object',
      };
    }

    if (type.isUnion()) {
      const concreteTypes = type
        .getUnionTypes()
        .filter((unionType) => !this.isNullishType(unionType));

      if (concreteTypes.length === 1 && concreteTypes[0]) {
        return this.toSchema(concreteTypes[0], visitedTypes, depth + 1);
      }

      if (
        concreteTypes.length > 0 &&
        concreteTypes.every((concreteType) => concreteType.isBooleanLiteral())
      ) {
        return {
          type: 'boolean',
        };
      }
    }

    if (type.isString() || type.isStringLiteral()) {
      return {
        type: 'string',
      };
    }

    if (type.isNumber() || type.isNumberLiteral()) {
      return {
        type: 'number',
      };
    }

    if (type.isBoolean() || type.isBooleanLiteral()) {
      return {
        type: 'boolean',
      };
    }

    if (type.isArray()) {
      return {
        items: this.toSchema(type.getArrayElementTypeOrThrow(), visitedTypes, depth + 1) ?? {
          type: 'object',
        },
        type: 'array',
      };
    }

    const typeName = this.cleanTypeText(type.getText());

    if (typeName === 'Date') {
      return {
        format: 'date-time',
        type: 'string',
      };
    }

    if (typeName === 'void' || typeName === 'undefined' || typeName === 'null') {
      return null;
    }

    if (typeName.startsWith('Promise<')) {
      return this.toSchema(this.unwrapSingleGeneric(type), visitedTypes, depth + 1);
    }

    if (visitedTypes.has(typeName)) {
      return {
        type: 'object',
      };
    }

    const properties = type.getProperties();

    if (properties.length === 0) {
      return null;
    }

    visitedTypes.add(typeName);

    const schemaProperties: Record<string, ApiSchemaProperty> = {};
    const required: string[] = [];

    for (const property of properties) {
      const declaration = property.getValueDeclaration() ?? property.getDeclarations()[0];

      if (!declaration) {
        continue;
      }

      const propertyType = declaration.getType();
      const propertySchema = this.toSchema(propertyType, visitedTypes, depth + 1);

      if (!propertySchema) {
        continue;
      }

      schemaProperties[property.getName()] = propertySchema;

      if (!this.isOptionalDeclaration(declaration)) {
        required.push(property.getName());
      }
    }

    visitedTypes.delete(typeName);

    if (Object.keys(schemaProperties).length === 0) {
      return null;
    }

    return {
      properties: schemaProperties,
      required,
      type: 'object',
    };
  }

  private unwrapSingleGeneric(type: Type): Type {
    return type.getTypeArguments()[0] ?? type;
  }

  private cleanTypeText(typeText: string): string {
    return typeText.replace(/^import\("[^"]+"\)\./, '').trim();
  }

  private isNullishType(type: Type): boolean {
    const typeText = this.cleanTypeText(type.getText());

    return typeText === 'undefined' || typeText === 'null';
  }

  private isOptionalDeclaration(declaration: Node): boolean {
    if (
      Node.isPropertyDeclaration(declaration) ||
      Node.isPropertySignature(declaration) ||
      Node.isParameterDeclaration(declaration)
    ) {
      return declaration.hasQuestionToken();
    }

    return false;
  }
}
