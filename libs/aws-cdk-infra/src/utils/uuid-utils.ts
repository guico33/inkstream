/**
 * UUID utilities for the Inkstream application
 * Provides consistent file key generation across the application
 */
import { v4 as uuidv4 } from 'uuid';

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
