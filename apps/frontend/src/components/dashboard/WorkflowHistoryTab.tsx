// Workflow history tab component
// Shows completed workflows with download options and pagination

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useUserWorkflows } from '@/lib/hooks/use-workflow-queries';
import { downloadWorkflowFile, getDownloadFileName } from '@/lib/aws-s3';
import {
  Download,
  History,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import {
  WORKFLOW_STEP_NAMES,
  type S3PathOutputFileKey,
  type WorkflowRecord,
} from '@inkstream/shared';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 10;

export function WorkflowHistoryTab() {
  const [limit] = useState(ITEMS_PER_PAGE);
  const [nextTokens, setNextTokens] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const currentNextToken = nextTokens[currentPage - 1];

  const {
    data: response,
    error,
    refetch,
    isFetching,
  } = useUserWorkflows({
    statusCategory: 'completed',
    limit,
    nextToken: currentNextToken,
    enableRefetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const workflows = response?.items || [];
  const hasNextPage = !!response?.nextToken;

  const handleNextPage = () => {
    if (hasNextPage && response?.nextToken) {
      // Store the next token for this page
      const newNextTokens = [...nextTokens];
      newNextTokens[currentPage] = response.nextToken;
      setNextTokens(newNextTokens);
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleRefresh = () => {
    // Reset pagination and refetch
    setCurrentPage(0);
    setNextTokens([]);
    refetch();
  };

  // Show loading skeleton when fetching first page or when no data yet
  if (
    (isFetching && currentPage === 0 && workflows.length === 0) ||
    (!response && isFetching)
  ) {
    console.log('Rendering skeleton UI...');
    return <WorkflowHistorySkeleton />;
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to load history</h3>
        <p className="text-muted-foreground mb-4">
          There was an error loading your workflow history
        </p>
        <Button onClick={handleRefresh} variant="outline">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  if (workflows.length === 0 && currentPage === 0) {
    return (
      <div className="text-center py-8">
        <History className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No completed workflows</h3>
        <p className="text-muted-foreground">
          Completed workflows will appear here
        </p>
      </div>
    );
  }

  // Group workflows by date
  const groupedWorkflows = workflows.reduce((acc, workflow) => {
    const date = new Date(
      workflow.updatedAt || workflow.createdAt
    ).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(workflow);
    return acc;
  }, {} as Record<string, typeof workflows>);

  return (
    <div className="space-y-6">
      {/* Refresh button under heading on the left */}
      <div className="flex justify-start">
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          disabled={isFetching}
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`}
          />
          Refresh
        </Button>
      </div>

      {/* Workflow groups */}
      {Object.entries(groupedWorkflows)
        .sort(([a], [b]) => new Date(b).getTime() - new Date(a).getTime())
        .map(([date, dateWorkflows]) => (
          <div key={date}>
            <h3 className="text-lg font-semibold mb-3">{date}</h3>
            <div className="space-y-3">
              {dateWorkflows.map((workflow) => (
                <CompletedWorkflowCard
                  key={workflow.workflowId}
                  workflow={workflow}
                />
              ))}
            </div>
          </div>
        ))}

      {/* Pagination controls */}
      {(hasNextPage || currentPage > 0) && (
        <Pagination className="mt-6">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={handlePrevPage}
                className={
                  currentPage === 0
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>
            <PaginationItem>
              <span className="flex items-center px-4 text-sm text-muted-foreground">
                Page {currentPage + 1}
              </span>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext
                onClick={handleNextPage}
                className={
                  !hasNextPage || isFetching
                    ? 'pointer-events-none opacity-50'
                    : 'cursor-pointer'
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}

function CompletedWorkflowCard({ workflow }: { workflow: WorkflowRecord }) {
  const [downloadingFiles, setDownloadingFiles] = useState<Set<string>>(
    new Set()
  );
  const isSuccessful = workflow.status === 'SUCCEEDED';

  const getStepName = (status: string): string => {
    return (
      WORKFLOW_STEP_NAMES[status as keyof typeof WORKFLOW_STEP_NAMES] || status
    );
  };

  const handleDownload = async (
    fileType: S3PathOutputFileKey,
    s3Path: string
  ) => {
    if (downloadingFiles.has(fileType)) return;

    try {
      setDownloadingFiles((prev) => new Set(prev).add(fileType));

      const downloadedFilename = await downloadWorkflowFile({
        s3Path,
        filename: getDownloadFileName({
          originalFilePath: workflow.s3Paths?.originalFile,
          outputFileType: fileType,
        }),
      });

      toast.success(`File downloaded successfully: ${downloadedFilename}`);
    } catch (error) {
      console.error(`Failed to download ${fileType}:`, error);
      toast.error(`Failed to download ${fileType}. Please try again.`);
    } finally {
      setDownloadingFiles((prev) => {
        const newSet = new Set(prev);
        newSet.delete(fileType);
        return newSet;
      });
    }
  };

  // Extract available files from s3Paths
  const availableFiles: {
    type: S3PathOutputFileKey;
    path: string;
    name: string;
  }[] = [];
  if (workflow.s3Paths?.formattedText) {
    availableFiles.push({
      type: 'formattedText',
      path: workflow.s3Paths.formattedText,
      name: 'Formatted Text',
    });
  }
  if (workflow.s3Paths?.translatedText) {
    availableFiles.push({
      type: 'translatedText',
      path: workflow.s3Paths.translatedText,
      name: 'Translated Text',
    });
  }
  if (workflow.s3Paths?.audioFile) {
    availableFiles.push({
      type: 'audioFile',
      path: workflow.s3Paths.audioFile,
      name: 'Audio File',
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              {(() => {
                // Extract filename from S3 path
                if (workflow.s3Paths?.originalFile) {
                  const pathParts = workflow.s3Paths.originalFile.split('/');
                  const filename = pathParts[pathParts.length - 1];
                  // Remove timestamp prefix if present (format: timestamp-filename)
                  const cleanFilename = filename.replace(/^\d+-/, '');
                  // Decode any URL encoding and replace underscores with spaces
                  return decodeURIComponent(cleanFilename).replace(/_/g, ' ');
                }
                return 'Workflow';
              })()}
            </CardTitle>
            <CardDescription>
              Completed at{' '}
              {new Date(
                workflow.updatedAt || workflow.createdAt
              ).toLocaleString()}
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            {isSuccessful ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            <Badge
              variant={isSuccessful ? 'default' : 'destructive'}
              className={`text-sm font-semibold px-2.5 py-0.5 ${
                isSuccessful ? 'bg-green-500 text-white border-green-500' : ''
              }`}
            >
              {getStepName(workflow.status)}
            </Badge>
          </div>
        </div>

        {/* Workflow parameters */}
        {workflow.parameters && (
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            {workflow.parameters.doTranslate && (
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                Translation
              </span>
            )}
            {workflow.parameters.doSpeech && (
              <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                Speech
              </span>
            )}
            {workflow.parameters.targetLanguage && (
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                {workflow.parameters.targetLanguage}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      {isSuccessful && availableFiles.length > 0 && (
        <CardContent>
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Available Downloads:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {availableFiles.map((file) => (
                <Button
                  key={file.type}
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload(file.type, file.path)}
                  disabled={downloadingFiles.has(file.type)}
                  className="justify-start "
                >
                  {downloadingFiles.has(file.type) ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  {file.name}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      )}

      {!isSuccessful && workflow.error && (
        <CardContent>
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded">
            <strong>Error:</strong> {workflow.error}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function WorkflowHistorySkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-32 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-20" />
      </div>

      {/* Date group skeleton */}
      <div>
        <Skeleton className="h-6 w-24 mb-3" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-6 w-16" />
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-12" />
                </div>
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-32 mb-3" />
                <div className="flex space-x-2">
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-8 w-24" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
