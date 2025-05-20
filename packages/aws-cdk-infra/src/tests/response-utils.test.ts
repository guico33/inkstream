import { describe, it, expect } from 'vitest';
import { createSuccessResponse, createS3Response, createS3ErrorResponse, S3Path } from '../utils/response-utils';

describe('Response Utils', () => {
  describe('createSuccessResponse', () => {
    it('returns a success response with status and message', () => {
      const res = createSuccessResponse(200, 'OK');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ message: 'OK' });
    });
    it('includes additional data in the response', () => {
      const res = createSuccessResponse(201, 'Created', { foo: 'bar', count: 2 });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body)).toEqual({ message: 'Created', foo: 'bar', count: 2 });
      expect(res.foo).toBe('bar');
      expect(res.count).toBe(2);
    });
  });

  describe('createS3Response', () => {
    const s3Path: S3Path = { bucket: 'my-bucket', key: 'my/key.txt' };
    it('returns a 200 response with s3Path and message', () => {
      const res = createS3Response(s3Path, 'Saved!');
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ message: 'Saved!', s3Path });
      expect(res.s3Path).toEqual(s3Path);
    });
    it('includes additional data at top level and in body', () => {
      const res = createS3Response(s3Path, 'Done', { foo: 1 });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ message: 'Done', s3Path, foo: 1 });
      expect(res.foo).toBe(1);
    });
  });

  describe('createS3ErrorResponse', () => {
    it('returns an error response with status, message, and null s3Path', () => {
      const res = createS3ErrorResponse(500, 'Failed');
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ message: 'Failed' });
      expect(res.s3Path).toBeNull();
    });
    it('includes error message if error is provided', () => {
      const res = createS3ErrorResponse(400, 'Bad', new Error('fail!'));
      expect(JSON.parse(res.body)).toEqual({ message: 'Bad', error: 'fail!' });
    });
  });
});
