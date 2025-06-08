import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from 'vitest';
import { PreSignUpTriggerEvent } from 'aws-lambda';

let handler: any;

// Mock console methods to capture logs
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
const mockConsoleWarn = vi.fn();

vi.stubGlobal('console', {
  log: mockConsoleLog,
  error: mockConsoleError,
  warn: mockConsoleWarn,
});

async function callHandler(event: PreSignUpTriggerEvent) {
  const context = {} as any;
  const callback = () => {};
  return handler(event, context, callback);
}

describe('pre-signup Lambda handler', () => {
  beforeAll(async () => {
    handler = (await import('./pre-signup.js')).handler;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  const createMockEvent = (email: string): PreSignUpTriggerEvent => ({
    version: '1',
    region: 'us-east-1',
    userPoolId: 'us-east-1_test',
    userName: 'test-user',
    callerContext: {
      awsSdkVersion: '1.0.0',
      clientId: 'test-client-id',
    },
    triggerSource: 'PreSignUp_SignUp',
    request: {
      userAttributes: {
        email: email,
      },
      validationData: {},
      clientMetadata: {},
    },
    response: {
      autoConfirmUser: false,
      autoVerifyEmail: false,
      autoVerifyPhone: false,
    },
  });

  describe('successful email validation', () => {
    beforeEach(() => {
      vi.stubEnv('ALLOWED_EMAILS', 'test@example.com,admin@company.com,user@domain.org');
    });

    it('should allow signup for whitelisted email (exact match)', async () => {
      const event = createMockEvent('test@example.com');
      
      const result = await callHandler(event);
      
      expect(result).toEqual(event);
      expect(mockConsoleLog).toHaveBeenCalledWith('Pre-signup validation for email: test@example.com');
      expect(mockConsoleLog).toHaveBeenCalledWith('Checking against 3 whitelisted emails');
      expect(mockConsoleLog).toHaveBeenCalledWith('Signup approved for whitelisted email: test@example.com');
    });

    it('should allow signup for whitelisted email (case insensitive)', async () => {
      const event = createMockEvent('TEST@EXAMPLE.COM');
      
      const result = await callHandler(event);
      
      expect(result).toEqual(event);
      expect(mockConsoleLog).toHaveBeenCalledWith('Pre-signup validation for email: test@example.com');
      expect(mockConsoleLog).toHaveBeenCalledWith('Signup approved for whitelisted email: test@example.com');
    });

    it('should handle emails with extra whitespace', async () => {
      vi.stubEnv('ALLOWED_EMAILS', ' test@example.com , admin@company.com , user@domain.org ');
      const event = createMockEvent('test@example.com');
      
      const result = await callHandler(event);
      
      expect(result).toEqual(event);
      expect(mockConsoleLog).toHaveBeenCalledWith('Signup approved for whitelisted email: test@example.com');
    });

    it('should handle single email in whitelist', async () => {
      vi.stubEnv('ALLOWED_EMAILS', 'single@email.com');
      const event = createMockEvent('single@email.com');
      
      const result = await callHandler(event);
      
      expect(result).toEqual(event);
      expect(mockConsoleLog).toHaveBeenCalledWith('Checking against 1 whitelisted emails');
    });
  });

  describe('email validation failures', () => {
    beforeEach(() => {
      vi.stubEnv('ALLOWED_EMAILS', 'allowed@example.com,admin@company.com');
    });

    it('should block signup for non-whitelisted email', async () => {
      const event = createMockEvent('blocked@example.com');
      
      await expect(callHandler(event)).rejects.toThrow(
        'Email blocked@example.com is not authorized for this environment. Please contact your administrator.'
      );
      
      expect(mockConsoleWarn).toHaveBeenCalledWith('Signup blocked for non-whitelisted email: blocked@example.com');
    });

    it('should throw error for missing email', async () => {
      const event = createMockEvent('');
      // @ts-expect-error - Testing undefined email case
      event.request.userAttributes.email = undefined;
      
      await expect(callHandler(event)).rejects.toThrow('Email address is required');
      
      expect(mockConsoleError).toHaveBeenCalledWith('No email provided in signup request');
    });

    it('should throw error for empty email', async () => {
      const event = createMockEvent('');
      
      await expect(callHandler(event)).rejects.toThrow('Email address is required');
      
      expect(mockConsoleError).toHaveBeenCalledWith('No email provided in signup request');
    });
  });

  describe('configuration errors', () => {
    it('should throw error when ALLOWED_EMAILS environment variable is not set', async () => {
      // Don't set ALLOWED_EMAILS env var
      const event = createMockEvent('test@example.com');
      
      await expect(callHandler(event)).rejects.toThrow('Email validation configuration error');
      
      expect(mockConsoleError).toHaveBeenCalledWith('ALLOWED_EMAILS environment variable not set');
    });

    it('should throw error when ALLOWED_EMAILS environment variable is empty', async () => {
      vi.stubEnv('ALLOWED_EMAILS', '');
      const event = createMockEvent('test@example.com');
      
      await expect(callHandler(event)).rejects.toThrow('Email validation configuration error');
      
      expect(mockConsoleError).toHaveBeenCalledWith('ALLOWED_EMAILS environment variable not set');
    });

    it('should handle comma-only ALLOWED_EMAILS (results in empty whitelist)', async () => {
      vi.stubEnv('ALLOWED_EMAILS', ',,,');
      const event = createMockEvent('test@example.com');
      
      // This will result in an empty whitelist, so any email should be blocked
      await expect(callHandler(event)).rejects.toThrow(
        'Email test@example.com is not authorized for this environment. Please contact your administrator.'
      );
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Checking against 0 whitelisted emails');
    });
  });

  describe('email parsing and normalization', () => {
    it('should handle mixed case emails in whitelist', async () => {
      vi.stubEnv('ALLOWED_EMAILS', 'Test@Example.COM,ADMIN@company.com');
      const event = createMockEvent('test@example.com');
      
      const result = await callHandler(event);
      
      expect(result).toEqual(event);
      expect(mockConsoleLog).toHaveBeenCalledWith('Signup approved for whitelisted email: test@example.com');
    });

    it('should filter out empty email entries from whitelist', async () => {
      vi.stubEnv('ALLOWED_EMAILS', 'valid@email.com,,, ,another@email.com,');
      const event = createMockEvent('valid@email.com');
      
      const result = await callHandler(event);
      
      expect(result).toEqual(event);
      expect(mockConsoleLog).toHaveBeenCalledWith('Checking against 2 whitelisted emails');
    });
  });

  describe('logging behavior', () => {
    beforeEach(() => {
      vi.stubEnv('ALLOWED_EMAILS', 'test@example.com');
    });

    it('should log email validation process for successful signup', async () => {
      const event = createMockEvent('test@example.com');
      
      await callHandler(event);
      
      expect(mockConsoleLog).toHaveBeenCalledWith('Pre-signup validation for email: test@example.com');
      expect(mockConsoleLog).toHaveBeenCalledWith('Checking against 1 whitelisted emails');
      expect(mockConsoleLog).toHaveBeenCalledWith('Signup approved for whitelisted email: test@example.com');
    });

    it('should log warning for blocked email', async () => {
      const event = createMockEvent('blocked@example.com');
      
      await expect(callHandler(event)).rejects.toThrow();
      
      expect(mockConsoleWarn).toHaveBeenCalledWith('Signup blocked for non-whitelisted email: blocked@example.com');
    });
  });
});