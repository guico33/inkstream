/**
 * File utility functions for handling file names, paths and extensions
 */

/**
 * Gets the file extension from a file path
 * @param filePath The file path or name
 * @returns The file extension in lowercase without the dot, or undefined if no extension
 */
export function getFileExtension(filePath: string): string | undefined {
  return filePath.split('.').pop()?.toLowerCase();
}

/**
 * Extracts the filename from a path
 * @param filePath The file path
 * @returns The filename (without directory path)
 */
export function getFilename(filePath: string): string {
  return filePath.substring(filePath.lastIndexOf('/') + 1);
}

/**
 * Extracts the filename without extension
 * @param filePath The file path
 * @returns The filename without extension
 */
export function getFilenameWithoutExtension(filePath: string): string {
  const filename = getFilename(filePath);
  return filename.includes('.')
    ? filename.substring(0, filename.lastIndexOf('.'))
    : filename;
}

/**
 * Determines the mime type based on file extension
 * @param fileExt The file extension
 * @returns The mime type
 */
export function getMimeType(fileExt: string): string {
  const ext = fileExt.toLowerCase();
  const mimeTypes: Record<string, string> = {
    pdf: 'application/pdf',
    txt: 'text/plain',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
