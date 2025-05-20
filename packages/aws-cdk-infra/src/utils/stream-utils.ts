/**
 * Stream utility functions for processing various stream types
 */
import { Readable } from 'stream';

/**
 * Converts a Readable stream to a string
 * @param stream The readable stream to convert
 * @returns Promise that resolves to the string content
 */
export async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * Converts a Readable stream to a Buffer
 * @param stream The readable stream to convert
 * @returns Promise that resolves to the Buffer content
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    );
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}
