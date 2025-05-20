import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as s3Utils from '../utils/s3-utils';

// Use vi.hoisted to declare mockSend so it is available in the mock factory
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi
    .fn()
    .mockImplementation(() => ({
      send: (...args: any[]) => mockSend(...args),
    })),
  GetObjectCommand: vi.fn(),
  PutObjectCommand: vi.fn(),
}));
vi.mock('../utils/stream-utils', () => ({
  streamToString: vi.fn().mockResolvedValue('mocked string'),
  streamToBuffer: vi.fn().mockResolvedValue(Buffer.from('mocked buffer')),
}));
vi.mock('../utils/file-utils', () => {
  const original = vi.importActual('../utils/file-utils');
  return {
    ...original,
    getMimeType: vi.fn().mockReturnValue('mock/type'),
    getFilenameWithoutExtension: vi.fn().mockReturnValue('file'),
  };
});

describe('s3-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
  });

  it('getTextFromS3 returns string from stream', async () => {
    mockSend.mockResolvedValue({ Body: {} });
    const result = await s3Utils.getTextFromS3('bucket', 'key');
    expect(result).toBe('mocked string');
    expect(mockSend).toHaveBeenCalled();
  });

  it('getBufferFromS3 returns buffer from stream', async () => {
    mockSend.mockResolvedValue({ Body: {} });
    const result = await s3Utils.getBufferFromS3('bucket', 'key');
    expect(result).toEqual(Buffer.from('mocked buffer'));
    expect(mockSend).toHaveBeenCalled();
  });

  it('saveTextToS3 sends PutObjectCommand and returns s3 path', async () => {
    mockSend.mockResolvedValue({});
    const res = await s3Utils.saveTextToS3('bucket', 'key', 'content');
    expect(res).toEqual({ bucket: 'bucket', key: 'key' });
    expect(mockSend).toHaveBeenCalled();
  });

  it('saveBinaryToS3 sends PutObjectCommand and returns s3 path', async () => {
    mockSend.mockResolvedValue({});
    const res = await s3Utils.saveBinaryToS3(
      'bucket',
      'key.mp3',
      Buffer.from('data')
    );
    expect(res).toEqual({ bucket: 'bucket', key: 'key.mp3' });
    expect(mockSend).toHaveBeenCalled();
  });

  it('generateUserS3Key returns expected key', () => {
    const key = s3Utils.generateUserS3Key(
      'user',
      'type',
      'original/file.txt',
      'mp3',
      'extra'
    );
    expect(key).toMatch(/^users\/user\/type\/file-extra\.mp3$/);
  });
});
