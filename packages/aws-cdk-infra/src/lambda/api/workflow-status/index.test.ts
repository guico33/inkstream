import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handler } from './index';
import { SFNClient } from '@aws-sdk/client-sfn';

let mockSend: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockSend = vi.fn();
  vi.spyOn(SFNClient.prototype, 'send').mockImplementation(mockSend);
});

describe('workflow-status Lambda handler', () => {
  it('returns 400 if executionArn is missing', async () => {
    const event = { queryStringParameters: {}, body: undefined } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/Missing executionArn/);
  });

  it('returns 400 if executionArn is missing in invalid JSON body', async () => {
    const event = { queryStringParameters: {}, body: '{invalidJson' } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(/Missing executionArn/);
  });

  it('returns 200 and workflow status if found', async () => {
    mockSend.mockResolvedValueOnce({
      status: 'SUCCEEDED',
      output: JSON.stringify({ foo: 'bar' }),
      input: JSON.stringify({ input: true }),
      startDate: '2025-05-22T00:00:00Z',
      stopDate: '2025-05-22T01:00:00Z',
      executionArn: 'arn:aws:states:execution:123',
    });
    const event = {
      queryStringParameters: { executionArn: 'arn:aws:states:execution:123' },
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.status).toBe('SUCCEEDED');
    expect(body.output).toEqual({ foo: 'bar' });
    expect(body.input).toEqual({ input: true });
    expect(body.executionArn).toBe('arn:aws:states:execution:123');
  });

  it('returns 500 if SFNClient.send throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('sfn error'));
    const event = {
      queryStringParameters: { executionArn: 'arn:aws:states:execution:123' },
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toMatch(/Failed to get workflow status/);
    expect(body.error).toMatch(/sfn error/);
  });
});
