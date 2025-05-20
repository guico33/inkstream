import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { streamToString, streamToBuffer } from '../utils/stream-utils';

describe('stream-utils', () => {
  describe('streamToString', () => {
    it('converts a stream of buffers to a string', async () => {
      const data = ['Hello, ', 'world!'];
      const stream = Readable.from(data.map((d) => Buffer.from(d)));
      const result = await streamToString(stream);
      expect(result).toBe('Hello, world!');
    });
    it('converts a stream of strings to a string', async () => {
      const data = ['foo', 'bar'];
      const stream = Readable.from(data);
      const result = await streamToString(stream);
      expect(result).toBe('foobar');
    });
    it('handles empty stream', async () => {
      const stream = Readable.from([]);
      const result = await streamToString(stream);
      expect(result).toBe('');
    });
  });

  describe('streamToBuffer', () => {
    it('converts a stream of buffers to a single buffer', async () => {
      const data = [Buffer.from('a'), Buffer.from('b')];
      const stream = Readable.from(data);
      const result = await streamToBuffer(stream);
      expect(result).toEqual(Buffer.from('ab'));
    });
    it('converts a stream of strings to a buffer', async () => {
      const data = ['x', 'y', 'z'];
      const stream = Readable.from(data);
      const result = await streamToBuffer(stream);
      expect(result).toEqual(Buffer.from('xyz'));
    });
    it('handles empty stream', async () => {
      const stream = Readable.from([]);
      const result = await streamToBuffer(stream);
      expect(result).toEqual(Buffer.alloc(0));
    });
    it('rejects on stream error', async () => {
      const stream = new Readable({
        read() {
          this.emit('error', new Error('fail'));
        },
      });
      await expect(streamToBuffer(stream)).rejects.toThrow('fail');
    });
  });
});
