import type { User } from '../lib/types/user-types';
import { getUserDisplayName } from '@/lib/display';
import { S3FileUpload } from '../components/FileUpload';

export function HomePage({ user }: { user: User | null }) {
  const displayName = getUserDisplayName(user);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <h2 className="text-2xl font-bold mb-4">
        Welcome{displayName ? `, ${displayName}` : ''}!
      </h2>
      <p className="text-gray-600 dark:text-gray-300">
        Inkstream can extract text from documents, images, and more. Use the
        form below to upload a file and start a workflow.
      </p>
      <S3FileUpload />
    </div>
  );
}
