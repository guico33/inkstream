import { describe, it, expect } from 'vitest';
import { getErrorMessage, formatErrorForLogging } from '../error-utils';

describe('Error Utils', () => {
  describe('getErrorMessage', () => {
    it('returns the message for an Error object', () => {
      expect(getErrorMessage(new Error('fail!'))).toBe('fail!');
    });
    it('returns the string if error is a string', () => {
      expect(getErrorMessage('something went wrong')).toBe(
        'something went wrong'
      );
    });
    it('returns a default message for unknown types', () => {
      expect(getErrorMessage(123)).toBe('Unknown error occurred');
      expect(getErrorMessage({})).toBe('Unknown error occurred');
      expect(getErrorMessage(undefined)).toBe('Unknown error occurred');
    });
  });

  describe('formatErrorForLogging', () => {
    it('formats error with context and message', () => {
      expect(formatErrorForLogging('myContext', new Error('fail!'))).toBe(
        'Error in myContext: fail!'
      );
      expect(formatErrorForLogging('api', 'bad request')).toBe(
        'Error in api: bad request'
      );
    });
    it('handles unknown error types', () => {
      expect(formatErrorForLogging('test', 42)).toBe(
        'Error in test: Unknown error occurred'
      );
    });
  });
});
