import { describe, expect, it } from 'vitest';
import { extractUserId } from '../auth-utils';
import { ValidationError } from 'src/errors';

describe('Auth Utils', () => {
  describe('extractUserId', () => {
    it('extracts userId from valid JWT claims', () => {
      const event = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: 'user-123',
              },
            },
          },
        } as any,
      };

      const result = extractUserId(event);
      expect(result).toBe('user-123');
    });

    it('throws ValidationError when requestContext is missing', () => {
      const event = {};

      expect(() => extractUserId(event)).toThrow(ValidationError);
      expect(() => extractUserId(event)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when authorizer is missing', () => {
      const event = {
        requestContext: {} as any,
      };

      expect(() => extractUserId(event)).toThrow(ValidationError);
      expect(() => extractUserId(event)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when jwt is missing', () => {
      const event = {
        requestContext: {
          authorizer: {},
        } as any,
      };

      expect(() => extractUserId(event)).toThrow(ValidationError);
      expect(() => extractUserId(event)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when claims is missing', () => {
      const event = {
        requestContext: {
          authorizer: {
            jwt: {},
          },
        } as any,
      };

      expect(() => extractUserId(event)).toThrow(ValidationError);
      expect(() => extractUserId(event)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when sub is missing', () => {
      const event = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                other: 'value',
              },
            },
          },
        } as any,
      };

      expect(() => extractUserId(event)).toThrow(ValidationError);
      expect(() => extractUserId(event)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when sub is not a string', () => {
      const event = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: 123,
              },
            },
          },
        } as any,
      };

      expect(() => extractUserId(event)).toThrow(ValidationError);
      expect(() => extractUserId(event)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });

    it('throws ValidationError when sub is empty string', () => {
      const event = {
        requestContext: {
          authorizer: {
            jwt: {
              claims: {
                sub: '',
              },
            },
          },
        },
      };

      expect(() => extractUserId(event)).toThrow(ValidationError);
      expect(() => extractUserId(event)).toThrow(
        'Invalid or missing userId in JWT claims'
      );
    });
  });
});
