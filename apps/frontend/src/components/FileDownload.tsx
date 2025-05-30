// FileDownload.tsx
// Component for downloading processed workflow files
// Displays download buttons for completed workflow outputs

import { Button } from './ui/button';
import { downloadWorkflowFile } from '@/lib/aws-s3';
import { Download, FileText, Volume2, Languages } from 'lucide-react';
import type { WorkflowStatusResponse } from '@inkstream/shared';

interface FileDownloadProps {
  workflowStatus: WorkflowStatusResponse;
}

export function FileDownload({ workflowStatus }: FileDownloadProps) {
  const { s3Paths, parameters } = workflowStatus;

  if (!s3Paths) {
    return null;
  }

  const handleDownload = async (
    s3Path: string,
    filename: string,
    fileType: string
  ) => {
    try {
      console.log(`[FileDownload] Downloading ${fileType}:`, s3Path);
      await downloadWorkflowFile({
        s3Path,
        filename,
      });
    } catch (error) {
      console.error(`[FileDownload] Failed to download ${fileType}:`, error);
      // TODO: Add toast notification for errors
      alert(`Failed to download ${fileType}. Please try again.`);
    }
  };

  return (
    <div className="mt-4 p-4 border rounded-lg bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
      <h3 className="text-lg font-semibold mb-3 text-green-800 dark:text-green-200 flex items-center gap-2">
        <Download className="h-5 w-5" />
        Download Your Files
      </h3>

      <div className="grid gap-2">
        {/* Always show formatted text if available */}
        {s3Paths.formattedText && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() =>
              handleDownload(
                s3Paths.formattedText!,
                'formatted-text.txt',
                'formatted text'
              )
            }
          >
            <FileText className="h-4 w-4 mr-2" />
            Download Formatted Text
          </Button>
        )}

        {/* Show translated text if translation was enabled */}
        {s3Paths.translatedText && parameters?.doTranslate && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() =>
              handleDownload(
                s3Paths.translatedText!,
                `translated-text-${parameters.targetLanguage || 'english'}.txt`,
                'translated text'
              )
            }
          >
            <Languages className="h-4 w-4 mr-2" />
            Download Translated Text ({parameters.targetLanguage || 'english'})
          </Button>
        )}

        {/* Show audio file if speech conversion was enabled */}
        {s3Paths.audioFile && parameters?.doSpeech && (
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() =>
              handleDownload(
                s3Paths.audioFile!,
                'audio-output.mp3',
                'audio file'
              )
            }
          >
            <Volume2 className="h-4 w-4 mr-2" />
            Download Audio File
          </Button>
        )}
      </div>

      <p className="text-xs text-green-600 dark:text-green-400 mt-2">
        Files will be downloaded to your default downloads folder
      </p>
    </div>
  );
}
