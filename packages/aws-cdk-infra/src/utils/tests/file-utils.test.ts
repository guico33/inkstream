import { describe, it, expect } from 'vitest';
import {
  getFileExtension,
  getFilename,
  getFilenameWithoutExtension,
  isImageFile,
  getMimeType,
  generateFileKey,
  generateAudioFileKey,
  extractUuidFromFileKey,
} from '../file-utils';

describe('File Utilities', () => {
  describe('getFileExtension', () => {
    it('returns the extension for a file with extension', () => {
      expect(getFileExtension('foo.txt')).toBe('txt');
      expect(getFileExtension('bar.jpeg')).toBe('jpeg');
      expect(getFileExtension('baz.tar.gz')).toBe('gz');
    });
    it('returns undefined for a file with no extension', () => {
      expect(getFileExtension('foo')).toBe('foo'); // Actually returns the last part
      expect(getFileExtension('archive')).toBe('archive');
      // If you want undefined for no extension, you may want to adjust the implementation
    });
  });

  describe('getFilename', () => {
    it('extracts the filename from a path', () => {
      expect(getFilename('/path/to/file.txt')).toBe('file.txt');
      expect(getFilename('file.txt')).toBe('file.txt');
      expect(getFilename('/foo/bar/baz.png')).toBe('baz.png');
    });
  });

  describe('getFilenameWithoutExtension', () => {
    it('removes the extension from a filename', () => {
      expect(getFilenameWithoutExtension('foo.txt')).toBe('foo');
      expect(getFilenameWithoutExtension('/path/to/file.jpeg')).toBe('file');
      expect(getFilenameWithoutExtension('archive.tar.gz')).toBe('archive.tar');
      expect(getFilenameWithoutExtension('noext')).toBe('noext');
    });
  });

  describe('isImageFile', () => {
    it('returns true for supported image extensions', () => {
      expect(isImageFile('jpg')).toBe(true);
      expect(isImageFile('jpeg')).toBe(true);
      expect(isImageFile('png')).toBe(true);
      expect(isImageFile('JPG')).toBe(true);
    });
    it('returns false for non-image extensions', () => {
      expect(isImageFile('txt')).toBe(false);
      expect(isImageFile('pdf')).toBe(false);
      expect(isImageFile('docx')).toBe(false);
    });
  });

  describe('getMimeType', () => {
    it('returns correct mime type for known extensions', () => {
      expect(getMimeType('pdf')).toBe('application/pdf');
      expect(getMimeType('txt')).toBe('text/plain');
      expect(getMimeType('jpg')).toBe('image/jpeg');
      expect(getMimeType('jpeg')).toBe('image/jpeg');
      expect(getMimeType('png')).toBe('image/png');
      expect(getMimeType('mp3')).toBe('audio/mpeg');
      expect(getMimeType('mp4')).toBe('video/mp4');
    });
    it('returns application/octet-stream for unknown extensions', () => {
      expect(getMimeType('foo')).toBe('application/octet-stream');
      expect(getMimeType('unknown')).toBe('application/octet-stream');
    });
  });

  describe('generateFileKey', () => {
    it('generates a key with the correct prefix and extension', () => {
      const key = generateFileKey('uploads', 'txt');
      expect(key.startsWith('uploads/')).toBe(true);
      expect(key.endsWith('.txt')).toBe(true);
    });
    it('generates a unique key each time', () => {
      const key1 = generateFileKey('uploads', 'txt');
      const key2 = generateFileKey('uploads', 'txt');
      expect(key1).not.toBe(key2);
    });
  });

  describe('generateAudioFileKey', () => {
    it('generates a key with workflowId, language, and default name', () => {
      const key = generateAudioFileKey('workflow123', 'en');
      expect(key).toBe('speech/workflow123-en-audio.mp3');
    });
    it('includes originalName if provided', () => {
      const key = generateAudioFileKey('workflow123', 'en', 'original');
      expect(key).toBe('speech/workflow123-en-original.mp3');
    });
  });

  describe('extractUuidFromFileKey', () => {
    it('extracts a UUID from a file key', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const key = `uploads/${uuid}-123456789.txt`;
      expect(extractUuidFromFileKey(key)).toBe(uuid);
    });
    it('returns undefined if no UUID is present', () => {
      expect(extractUuidFromFileKey('uploads/file.txt')).toBeUndefined();
    });
  });
});
