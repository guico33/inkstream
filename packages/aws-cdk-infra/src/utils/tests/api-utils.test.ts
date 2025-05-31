import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  handleError,
  validateRequestBody,
  createSuccessResponse,
} from '../api-utils';
import { ValidationError, ExternalServiceError } from '../../errors';

describe('API Utils', () => {
  describe('handleError', () => {
    it('handles ValidationError with 400 status', () => {
      const error = new ValidationError('Invalid input data');

      const result = handleError(error);

      expect(result.statusCode).toBe(400);
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(result.body)).toEqual({
        message: 'Validation error',
        error: 'Invalid input data',
      });
    });

    it('handles ZodError with 400 status and formatted messages', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });

      let zodError: z.ZodError;
      try {
        schema.parse({ name: 123, age: 'invalid' });
      } catch (error) {
        zodError = error as z.ZodError;
      }

      const result = handleError(zodError!);

      expect(result.statusCode).toBe(400);
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
      });

      const body = JSON.parse(result.body);
      expect(body.message).toBe('Validation error');
      expect(body.error).toContain('name: Expected string, received number');
      expect(body.error).toContain('age: Expected number, received string');
    });

    it('handles ExternalServiceError with 500 status', () => {
      const error = new ExternalServiceError(
        'Database connection failed',
        'DynamoDB'
      );

      const result = handleError(error);

      expect(result.statusCode).toBe(500);
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(result.body)).toEqual({
        message: 'Internal server error',
        error: '[DynamoDB] Database connection failed',
      });
    });

    it('handles generic Error with 500 status', () => {
      const error = new Error('Unexpected error occurred');

      const result = handleError(error);

      expect(result.statusCode).toBe(500);
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(result.body)).toEqual({
        message: 'Internal server error',
        error: 'Unexpected error occurred',
      });
    });

    it('handles non-Error exceptions with 500 status', () => {
      const error = 'String error';

      const result = handleError(error);

      expect(result.statusCode).toBe(500);
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(result.body)).toEqual({
        message: 'Internal server error',
        error: 'Unknown error',
      });
    });

    it('handles null/undefined errors', () => {
      const result1 = handleError(null);
      const result2 = handleError(undefined);

      for (const result of [result1, result2]) {
        expect(result.statusCode).toBe(500);
        expect(result.headers).toEqual({
          'Content-Type': 'application/json',
        });
        expect(JSON.parse(result.body)).toEqual({
          message: 'Internal server error',
          error: 'Unknown error',
        });
      }
    });

    it('handles object errors without message property', () => {
      const error = { code: 'SOME_ERROR', details: 'Complex error object' };

      const result = handleError(error);

      expect(result.statusCode).toBe(500);
      expect(result.headers).toEqual({
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(result.body)).toEqual({
        message: 'Internal server error',
        error: 'Unknown error',
      });
    });
  });

  describe('validateRequestBody', () => {
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string().email().optional(),
    });

    it('successfully validates and parses valid JSON body', () => {
      const body = JSON.stringify({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      });

      const result = validateRequestBody(body, testSchema);

      expect(result).toEqual({
        name: 'John Doe',
        age: 30,
        email: 'john@example.com',
      });
    });

    it('successfully validates body without optional fields', () => {
      const body = JSON.stringify({
        name: 'Jane Doe',
        age: 25,
      });

      const result = validateRequestBody(body, testSchema);

      expect(result).toEqual({
        name: 'Jane Doe',
        age: 25,
      });
    });

    it('throws ValidationError when body is null', () => {
      expect(() => validateRequestBody(null, testSchema)).toThrow(
        ValidationError
      );
      expect(() => validateRequestBody(null, testSchema)).toThrow(
        'Request body is required'
      );
    });

    it('throws ValidationError when body is empty string', () => {
      expect(() => validateRequestBody('', testSchema)).toThrow(
        ValidationError
      );
      expect(() => validateRequestBody('', testSchema)).toThrow(
        'Request body is required'
      );
    });

    it('throws ValidationError when body is invalid JSON', () => {
      const invalidJson = '{ invalid json }';

      expect(() => validateRequestBody(invalidJson, testSchema)).toThrow(
        ValidationError
      );
      expect(() => validateRequestBody(invalidJson, testSchema)).toThrow(
        'Invalid request body format - must be valid JSON'
      );
    });

    it('throws ValidationError when body fails schema validation', () => {
      const body = JSON.stringify({
        name: 123, // Should be string
        age: 'thirty', // Should be number
      });

      expect(() => validateRequestBody(body, testSchema)).toThrow(
        ValidationError
      );

      try {
        validateRequestBody(body, testSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          'Invalid request body:'
        );
        expect((error as ValidationError).message).toContain(
          'name: Expected string, received number'
        );
        expect((error as ValidationError).message).toContain(
          'age: Expected number, received string'
        );
      }
    });

    it('throws ValidationError when required fields are missing', () => {
      const body = JSON.stringify({
        email: 'john@example.com',
        // Missing name and age
      });

      expect(() => validateRequestBody(body, testSchema)).toThrow(
        ValidationError
      );

      try {
        validateRequestBody(body, testSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          'Invalid request body:'
        );
        expect((error as ValidationError).message).toContain('name: Required');
        expect((error as ValidationError).message).toContain('age: Required');
      }
    });

    it('throws ValidationError for invalid email format', () => {
      const body = JSON.stringify({
        name: 'John Doe',
        age: 30,
        email: 'invalid-email',
      });

      expect(() => validateRequestBody(body, testSchema)).toThrow(
        ValidationError
      );

      try {
        validateRequestBody(body, testSchema);
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect((error as ValidationError).message).toContain(
          'Invalid request body:'
        );
        expect((error as ValidationError).message).toContain(
          'email: Invalid email'
        );
      }
    });

    it('handles nested object validation', () => {
      const nestedSchema = z.object({
        user: z.object({
          profile: z.object({
            firstName: z.string(),
            lastName: z.string(),
          }),
        }),
      });

      const body = JSON.stringify({
        user: {
          profile: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      });

      const result = validateRequestBody(body, nestedSchema);

      expect(result).toEqual({
        user: {
          profile: {
            firstName: 'John',
            lastName: 'Doe',
          },
        },
      });
    });

    it('handles array validation', () => {
      const arraySchema = z.object({
        items: z.array(z.string()),
        numbers: z.array(z.number()),
      });

      const body = JSON.stringify({
        items: ['item1', 'item2', 'item3'],
        numbers: [1, 2, 3],
      });

      const result = validateRequestBody(body, arraySchema);

      expect(result).toEqual({
        items: ['item1', 'item2', 'item3'],
        numbers: [1, 2, 3],
      });
    });
  });

  describe('createSuccessResponse', () => {
    it('creates response with default 200 status code', () => {
      const data = { message: 'Success', id: 123 };

      const result = createSuccessResponse(data);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    });

    it('creates response with custom status code', () => {
      const data = { message: 'Created', id: 456 };

      const result = createSuccessResponse(data, 201);

      expect(result).toEqual({
        statusCode: 201,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    });

    it('handles null data', () => {
      const result = createSuccessResponse(null);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'null',
      });
    });

    it('handles array data', () => {
      const data = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
      ];

      const result = createSuccessResponse(data);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
    });

    it('handles string data', () => {
      const data = 'Simple string response';

      const result = createSuccessResponse(data);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: '"Simple string response"',
      });
    });

    it('handles number data', () => {
      const data = 42;

      const result = createSuccessResponse(data);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: '42',
      });
    });

    it('handles boolean data', () => {
      const data = true;

      const result = createSuccessResponse(data);

      expect(result).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        body: 'true',
      });
    });

    it('handles complex nested objects', () => {
      const data = {
        workflow: {
          id: 'wf-123',
          status: 'SUCCEEDED',
          parameters: {
            doTranslate: true,
            targetLanguage: 'spanish',
          },
          timestamps: {
            created: '2024-01-01T00:00:00.000Z',
            updated: '2024-01-01T01:00:00.000Z',
          },
        },
        metadata: {
          version: '1.0',
          features: ['translation', 'formatting'],
        },
      };

      const result = createSuccessResponse(data, 202);

      expect(result).toEqual({
        statusCode: 202,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      // Verify the JSON is valid and can be parsed back
      const parsedBody = JSON.parse(result.body);
      expect(parsedBody).toEqual(data);
    });
  });
});
