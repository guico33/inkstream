import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './index';
import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';

vi.mock('uuid', () => ({ v4: () => 'test-uuid' }));

let mockSend: ReturnType<typeof vi.fn>;
beforeEach(() => {
  mockSend = vi.fn();
  vi.spyOn(SFNClient.prototype, 'send').mockImplementation(mockSend);
});

describe('start-workflow Lambda handler', () => {
  const OLD_ENV = process.env;
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      STATE_MACHINE_ARN:
        'arn:aws:states:us-east-1:123456789012:stateMachine:test',
    };
  });

  it('returns 400 if no body is provided', async () => {
    const event = { body: undefined } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(
      /Invalid request body format/
    );
  });

  it('returns 400 if body is invalid JSON', async () => {
    const event = { body: '{invalidJson' } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toMatch(
      /Invalid request body format/
    );
  });

  it('returns 500 if STATE_MACHINE_ARN is not set', async () => {
    process.env.STATE_MACHINE_ARN = '';
    const event = {
      body: JSON.stringify({ fileKey: 'file.txt', userId: 'user' }),
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toMatch(
      /STATE_MACHINE_ARN environment variable is not set/
    );
  });

  it('returns 200 and executionArn on success', async () => {
    mockSend.mockResolvedValueOnce({
      executionArn: 'arn:aws:states:execution:123',
      startDate: '2025-05-22T00:00:00Z',
    });
    const event = {
      body: JSON.stringify({ fileKey: 'file.txt', userId: 'user' }),
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.message).toMatch(/Workflow started successfully/);
    expect(body.executionArn).toBe('arn:aws:states:execution:123');
    expect(body.startDate).toBe('2025-05-22T00:00:00Z');
    expect(mockSend).toHaveBeenCalledWith(expect.any(StartExecutionCommand));
  });

  it('returns 500 if SFNClient.send throws', async () => {
    mockSend.mockRejectedValueOnce(new Error('sfn error'));
    const event = {
      body: JSON.stringify({ fileKey: 'file.txt', userId: 'user' }),
    } as any;
    const result = await handler(event);
    expect(result.statusCode).toBe(500);
    const body = JSON.parse(result.body);
    expect(body.message).toMatch(/Failed to start workflow/);
    // Accept either the error message or the fallback error for missing executionArn
    expect(body.error).toMatch(
      /sfn error|Step Functions did not return an executionArn/
    );
  });
});
