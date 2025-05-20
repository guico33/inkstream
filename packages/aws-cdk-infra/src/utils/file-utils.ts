import { v4 as uuidv4 } from 'uuid';

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
 * Determines if a file is of a supported image type
 * @param fileExt The file extension
 * @returns True if supported image type
 */
export function isImageFile(fileExt: string): boolean {
  return ['jpeg', 'jpg', 'png'].includes(fileExt.toLowerCase());
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

/**
 * Generates a UUID-based file key for uploaded files
 * @param prefix The prefix for the file (e.g., 'uploads', 'output', etc.)
 * @param fileType The file extension (without the dot)
 * @returns A unique file key with the format: prefix/uuid-timestamp.fileType
 */
export function generateFileKey(prefix: string, fileType: string): string {
  const uuid = uuidv4();
  const timestamp = Date.now();
  return `${prefix}/${uuid}-${timestamp}.${fileType}`;
}

/**
 * Generates an audio file key from an existing workflow ID
 * @param workflowId The workflow ID to use (can be a UUID)
 * @param language The language of the audio (for organization)
 * @param originalName Optional original file name to include
 * @returns A unique file key for audio files
 */
export function generateAudioFileKey(
  workflowId: string,
  language: string,
  originalName?: string
): string {
  const fileName = originalName || 'audio';
  return `speech/${workflowId}-${language}-${fileName}.mp3`;
}

/**
 * Extracts the UUID from a file key if it exists
 * @param fileKey The file key to extract from
 * @returns The UUID if found, undefined otherwise
 */
export function extractUuidFromFileKey(fileKey: string): string | undefined {
  // Match UUID pattern in file key
  const matches = fileKey.match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i
  );
  return matches ? matches[1] : undefined;
}
