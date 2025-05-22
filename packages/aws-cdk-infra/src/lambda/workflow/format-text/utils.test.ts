import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTextFromTextractS3, formatTextWithClaude } from './utils';

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(() => ({
      send: vi.fn(),
    })),
  };
});

describe('extractTextFromTextractS3', () => {
  let mockS3Client: any;
  beforeEach(() => {
    // Each test gets a fresh mock client with its own send mock
    mockS3Client = { send: vi.fn() };
  });

  it('should extract lines of text from Textract S3 output', async () => {
    const s3Path = { bucket: 'bucket', key: 'key' };
    const mockBlocks = [
      { BlockType: 'LINE', Text: 'Hello' },
      { BlockType: 'LINE', Text: 'World' },
      { BlockType: 'WORD', Text: 'Ignored' },
    ];
    mockS3Client.send.mockResolvedValue({
      Body: {
        transformToString: async () => JSON.stringify({ Blocks: mockBlocks }),
      },
    });
    const result = await extractTextFromTextractS3(s3Path, mockS3Client);
    expect(result).toBe('Hello\nWorld');
  });

  it('should throw if no Blocks in Textract output', async () => {
    const s3Path = { bucket: 'bucket', key: 'key' };
    mockS3Client.send.mockResolvedValue({
      Body: {
        transformToString: async () => JSON.stringify({ NotBlocks: [] }),
      },
    });
    await expect(
      extractTextFromTextractS3(s3Path, mockS3Client)
    ).rejects.toThrow('No Blocks in Textract output');
  });

  it('should throw if no response body from S3', async () => {
    const s3Path = { bucket: 'bucket', key: 'key' };
    mockS3Client.send.mockResolvedValue({});
    await expect(
      extractTextFromTextractS3(s3Path, mockS3Client)
    ).rejects.toThrow('No response body from S3');
  });
});

describe('formatTextWithClaude', () => {
  const mockBedrock = {
    send: vi.fn(),
  };

  beforeEach(() => {
    mockBedrock.send.mockReset();
  });

  it('should return a formatted string from Claude', async () => {
    const extractedText = 'This is a test.';
    const mockClaudeResponse = {
      body: new TextEncoder().encode(
        JSON.stringify({ content: [{ text: 'Formatted text.' }] })
      ),
    };
    mockBedrock.send.mockResolvedValue(mockClaudeResponse);
    const result = await formatTextWithClaude(mockBedrock, extractedText);
    expect(result).toBe('Formatted text.');
  });

  it('should return a message if no text content to format', async () => {
    const result = await formatTextWithClaude(mockBedrock, '');
    expect(result).toBe('No text content to format.');
  });

  it('should throw if Claude returns an error', async () => {
    mockBedrock.send.mockRejectedValue(new Error('Claude error'));
    await expect(
      formatTextWithClaude(mockBedrock, 'Some text')
    ).rejects.toThrow('Bedrock model invocation failed: Claude error');
  });
});
