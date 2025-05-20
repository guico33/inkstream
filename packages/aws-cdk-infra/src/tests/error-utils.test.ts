import { describe, it, expect } from 'vitest';
import {
  getErrorMessage,
  formatErrorForLogging,
  createErrorResponse,
} from '../utils/error-utils';

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

  describe('createErrorResponse', () => {
    it('returns a response with statusCode and message', () => {
      const res = createErrorResponse(400, 'Bad request');
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body)).toEqual({ message: 'Bad request' });
    });
    it('includes error message if error is provided', () => {
      const res = createErrorResponse(
        500,
        'Internal error',
        new Error('fail!')
      );
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({
        message: 'Internal error',
        error: 'fail!',
      });
    });
    it('includes error string if error is a string', () => {
      const res = createErrorResponse(404, 'Not found', 'missing');
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.body)).toEqual({
        message: 'Not found',
        error: 'missing',
      });
    });
    it('handles unknown error types', () => {
      const res = createErrorResponse(418, 'I am a teapot', 123);
      expect(res.statusCode).toBe(418);
      expect(JSON.parse(res.body)).toEqual({
        message: 'I am a teapot',
        error: 'Unknown error occurred',
      });
    });
  });
});
