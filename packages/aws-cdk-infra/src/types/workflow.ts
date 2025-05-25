export type WorkflowCommonState = {
  doTranslate?: boolean;
  doSpeech?: boolean;
  targetLanguage?: string;
  storageBucket: string;
  originalFileKey: string;
  userId: string;
  timestamp: number;
};
