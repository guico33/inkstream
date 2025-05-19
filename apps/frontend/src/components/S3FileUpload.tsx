// S3FileUpload.tsx
// React component for uploading files to S3 using Cognito credentials.
// Uses shadcn/ui components for a modern UI and displays upload status.

import { useRef, useState } from 'react';
import { uploadFileToS3 } from '../lib/aws-s3';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Progress } from './ui/progress';
import { useAuth } from '@/lib/contexts/auth-context';

export function S3FileUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const [status, setStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [uploading, setUploading] = useState(false);

  // Retrieve the idToken from localStorage or from a custom hook/state if you store it there
  // If you do not store id_token separately, you should update handleCognitoCodeExchange to do so
  const idToken = localStorage.getItem('id_token');

  if (!user) {
    return (
      <div className="mt-8 text-gray-600 dark:text-gray-300">
        Please sign in to upload files to S3.
      </div>
    );
  }

  const handleUpload = async () => {
    if (!idToken) {
      setStatus('You must be signed in to upload files.');
      return;
    }
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setStatus('Please select a file.');
      return;
    }
    setStatus(null);
    setUploading(true);
    setProgress(0);
    try {
      // Progress is not natively supported by AWS SDK v3 PutObjectCommand in browser,
      // so we only show indeterminate progress for now.
      await uploadFileToS3({ file, user, idToken });
      setProgress(100);
      setStatus('Upload successful!');
    } catch (err) {
      setStatus('Upload failed: ' + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 items-start w-full max-w-md mt-8">
      <label className="font-medium">Upload a file to S3</label>
      <Input type="file" ref={fileInputRef} disabled={uploading} />
      <Button onClick={handleUpload} disabled={uploading}>
        {uploading ? 'Uploading...' : 'Upload to S3'}
      </Button>
      {uploading && <Progress value={progress} className="w-full" />}
      {status && (
        <div
          className={
            status.startsWith('Upload successful')
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }
        >
          {status}
        </div>
      )}
    </div>
  );
}
