// Shared constants used across frontend and backend
// These values should be kept in sync between all applications

// Supported languages for translation
export const SUPPORTED_LANGUAGES = [
  { code: 'english', name: 'English' },
  { code: 'spanish', name: 'Spanish' },
  { code: 'french', name: 'French' },
  { code: 'german', name: 'German' },
  { code: 'italian', name: 'Italian' },
  { code: 'portuguese', name: 'Portuguese' },
  { code: 'russian', name: 'Russian' },
  { code: 'chinese', name: 'Chinese (Simplified)' },
  { code: 'japanese', name: 'Japanese' },
  { code: 'korean', name: 'Korean' },
  { code: 'arabic', name: 'Arabic' },
  { code: 'hindi', name: 'Hindi' },
  { code: 'dutch', name: 'Dutch' },
  { code: 'polish', name: 'Polish' },
  { code: 'swedish', name: 'Swedish' },
  { code: 'norwegian', name: 'Norwegian' },
  { code: 'danish', name: 'Danish' },
  { code: 'finnish', name: 'Finnish' },
  { code: 'turkish', name: 'Turkish' },
  { code: 'thai', name: 'Thai' },
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['code'];

// Workflow polling interval (in milliseconds)
export const WORKFLOW_POLLING_INTERVAL = 5000; // 5 seconds

// File size limits
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Supported file types for upload
export const SUPPORTED_FILE_TYPES = ['.pdf', '.jpg', '.jpeg', '.png'] as const;

// MIME type mappings for supported files
export const FILE_TYPE_MIME_MAP = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
} as const;

// Default workflow parameters
export const DEFAULT_WORKFLOW_PARAMS = {
  doTranslate: false,
  doSpeech: false,
  targetLanguage: 'english' as SupportedLanguage,
} as const;

// Workflow step display names
export const WORKFLOW_STEP_NAMES = {
  STARTING: 'Starting Workflow',
  EXTRACTING_TEXT: 'Extracting Text',
  FORMATTING_TEXT: 'Formatting Text',
  TRANSLATING: 'Translating Content',
  CONVERTING_TO_SPEECH: 'Converting to Speech',
  TEXT_FORMATTING_COMPLETE: 'Text Formatting Complete',
  TRANSLATION_COMPLETE: 'Translation Complete',
  SUCCEEDED: 'Workflow Complete',
  FAILED: 'Workflow Failed',
} as const;

// File output types and their display names
export const OUTPUT_FILE_TYPES = {
  formattedText: {
    name: 'Formatted Text',
    extension: '.txt',
    description: 'Clean, formatted text extracted from your document',
  },
  translatedText: {
    name: 'Translated Text',
    extension: '.txt',
    description: 'Text translated to your target language',
  },
  audioFile: {
    name: 'Audio File',
    extension: '.mp3',
    description: 'Text converted to speech audio',
  },
} as const;
