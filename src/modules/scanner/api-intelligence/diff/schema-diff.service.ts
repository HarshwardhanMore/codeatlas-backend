import { Injectable } from '@nestjs/common';

import type { ApiSchemaProperty } from '../types/api-intelligence.types';
import type {
  ApiSchemaObjectLike,
  SchemaDiffResult,
  SchemaFieldChange,
} from '../versioning/api-versioning.types';

@Injectable()
export class SchemaDiffService {
  diff(oldSchema: ApiSchemaProperty | null, newSchema: ApiSchemaProperty | null): SchemaDiffResult {
    const result: SchemaDiffResult = {
      added: [],
      removed: [],
      typeChanged: [],
    };

    this.compareSchema('', oldSchema, newSchema, result);

    return result;
  }

  private compareSchema(
    path: string,
    oldSchema: ApiSchemaProperty | null,
    newSchema: ApiSchemaProperty | null,
    result: SchemaDiffResult,
  ): void {
    if (!oldSchema && !newSchema) {
      return;
    }

    if (!oldSchema && newSchema) {
      this.collectFields(path, newSchema, result.added);
      return;
    }

    if (oldSchema && !newSchema) {
      this.collectFields(path, oldSchema, result.removed);
      return;
    }

    if (!oldSchema || !newSchema) {
      return;
    }

    if (oldSchema.type !== newSchema.type) {
      result.typeChanged.push({
        newType: newSchema.type,
        oldType: oldSchema.type,
        path: path || '$',
      });
      return;
    }

    if (oldSchema.type === 'array') {
      this.compareSchema(`${path}[]`, oldSchema.items ?? null, newSchema.items ?? null, result);
      return;
    }

    if (oldSchema.type !== 'object') {
      return;
    }

    const oldProperties = oldSchema.properties ?? {};
    const newProperties = newSchema.properties ?? {};
    const oldRequired = new Set(oldSchema.required ?? []);
    const newRequired = new Set(newSchema.required ?? []);
    const propertyNames = new Set([...Object.keys(oldProperties), ...Object.keys(newProperties)]);

    for (const propertyName of propertyNames) {
      const propertyPath = path ? `${path}.${propertyName}` : propertyName;
      const oldProperty = oldProperties[propertyName] ?? null;
      const newProperty = newProperties[propertyName] ?? null;

      if (!oldProperty && newProperty) {
        result.added.push({
          path: propertyPath,
          required: newRequired.has(propertyName),
          type: newProperty.type,
        });
        continue;
      }

      if (oldProperty && !newProperty) {
        result.removed.push({
          path: propertyPath,
          required: oldRequired.has(propertyName),
          type: oldProperty.type,
        });
        continue;
      }

      this.compareSchema(propertyPath, oldProperty, newProperty, result);
    }
  }

  private collectFields(
    path: string,
    schema: ApiSchemaProperty,
    target: SchemaFieldChange[],
  ): void {
    if (schema.type !== 'object') {
      target.push({
        path: path || '$',
        type: schema.type,
      });
      return;
    }

    const objectSchema = schema as ApiSchemaObjectLike;
    const required = new Set(objectSchema.required ?? []);

    for (const [propertyName, propertySchema] of Object.entries(objectSchema.properties ?? {})) {
      const propertyPath = path ? `${path}.${propertyName}` : propertyName;

      target.push({
        path: propertyPath,
        required: required.has(propertyName),
        type: propertySchema.type,
      });
      this.collectNestedFields(propertyPath, propertySchema, target);
    }
  }

  private collectNestedFields(
    path: string,
    schema: ApiSchemaProperty,
    target: SchemaFieldChange[],
  ): void {
    if (schema.type !== 'object') {
      return;
    }

    const required = new Set(schema.required ?? []);

    for (const [propertyName, propertySchema] of Object.entries(schema.properties ?? {})) {
      const propertyPath = `${path}.${propertyName}`;

      target.push({
        path: propertyPath,
        required: required.has(propertyName),
        type: propertySchema.type,
      });
      this.collectNestedFields(propertyPath, propertySchema, target);
    }
  }
}
