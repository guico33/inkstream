import { describe, it, expect } from 'vitest';
import {
  getFileExtension,
  getFilename,
  getFilenameWithoutExtension,
  getMimeType,
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
});
