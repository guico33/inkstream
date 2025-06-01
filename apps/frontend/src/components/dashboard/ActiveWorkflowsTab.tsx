// Active workflows tab component
// Shows real-time status of running workflows

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import {
  useActiveWorkflowsPolling,
  useDownloadWorkflowResult,
} from '@/lib/hooks/use-workflow-queries';
import { Download, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import {
  WORKFLOW_STEP_NAMES,
  type WorkflowStatus,
  type WorkflowStatusResponse,
} from '@inkstream/shared';

export function ActiveWorkflowsTab() {
  const { activeWorkflows, completedWorkflows, isLoading, errors } =
    useActiveWorkflowsPolling();

  console.log(
    'ActiveWorkflowsTab rendered - Active workflows:',
    activeWorkflows?.length || 0
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading workflows...</span>
      </div>
    );
  }

  // Show error state if there are errors
  if (errors.length > 0) {
    return (
      <div className="text-center py-8">
        <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Unable to load workflows</h3>
        <p className="text-muted-foreground">
          There was an error loading your workflows. Please try again later.
        </p>
      </div>
    );
  }

  const hasActiveWorkflows = activeWorkflows && activeWorkflows.length > 0;
  const hasCompletedWorkflows =
    completedWorkflows && completedWorkflows.length > 0;

  if (!hasActiveWorkflows && !hasCompletedWorkflows) {
    return (
      <div className="text-center py-8">
        <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
        <p className="text-muted-foreground">
          Start a new workflow from the "New Workflow" tab
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Active Workflows Section */}
      {hasActiveWorkflows && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Active Workflows ({activeWorkflows.length})
          </h3>
          <div className="space-y-4">
            {activeWorkflows.map((workflow) => (
              <WorkflowCard key={workflow.workflowId} workflow={workflow} />
            ))}
          </div>
        </div>
      )}

      {/* Completed Workflows Section */}
      {hasCompletedWorkflows && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center">
            <CheckCircle className="h-5 w-5 mr-2" />
            Recent Completed Workflows ({completedWorkflows.length})
          </h3>
          <div className="space-y-4">
            {completedWorkflows.map((workflow) => (
              <WorkflowCard key={workflow.workflowId} workflow={workflow} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkflowCard({ workflow }: { workflow: WorkflowStatusResponse }) {
  const downloadResult = useDownloadWorkflowResult();

  // Calculate progress percentage based on workflow status
  const getProgressPercentage = (status: WorkflowStatus): number => {
    const statusOrder: WorkflowStatus[] = [
      'STARTING',
      'EXTRACTING_TEXT',
      'FORMATTING_TEXT',
      'TRANSLATING',
      'CONVERTING_TO_SPEECH',
      'SUCCEEDED',
    ];
    const currentIndex = statusOrder.indexOf(status);
    return currentIndex >= 0
      ? ((currentIndex + 1) / statusOrder.length) * 100
      : 0;
  };

  const getStatusColor = (status: WorkflowStatus): string => {
    switch (status) {
      case 'SUCCEEDED':
        return 'bg-green-500';
      case 'FAILED':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'SUCCEEDED':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }
  };

  const getStepName = (status: string): string => {
    return (
      WORKFLOW_STEP_NAMES[status as keyof typeof WORKFLOW_STEP_NAMES] || status
    );
  };

  const handleDownload = (resultType: 'formatted' | 'translated' | 'audio') => {
    downloadResult.mutate({
      workflowId: workflow.workflowId,
      resultType,
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">
              Workflow {workflow.workflowId}
            </CardTitle>
            <CardDescription>
              Started{' '}
              {workflow.createdAt
                ? new Date(workflow.createdAt).toLocaleString()
                : 'Unknown time'}
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon(workflow.status)}
            <Badge
              variant="outline"
              className={getStatusColor(workflow.status)}
            >
              {getStepName(workflow.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-sm mb-2">
              <span>Progress</span>
              <span>{Math.round(getProgressPercentage(workflow.status))}%</span>
            </div>
            <Progress
              value={getProgressPercentage(workflow.status)}
              className="w-full"
            />
          </div>

          {/* Current Step */}
          <div>
            <p className="text-sm font-medium">Current Step:</p>
            <p className="text-sm text-muted-foreground">
              {getStepName(workflow.status)}
            </p>
          </div>

          {/* Download Buttons (if files are ready) */}
          {workflow.s3Paths && (
            <div className="flex flex-wrap gap-2">
              {workflow.s3Paths.formattedText && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload('formatted')}
                  disabled={downloadResult.isPending}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Formatted Text
                </Button>
              )}
              {workflow.s3Paths.translatedText && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload('translated')}
                  disabled={downloadResult.isPending}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Translated Text
                </Button>
              )}
              {workflow.s3Paths.audioFile && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownload('audio')}
                  disabled={downloadResult.isPending}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Audio File
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
