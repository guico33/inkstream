// Workflow history tab component
// Shows completed workflows with download options

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useUserWorkflows } from '@/lib/hooks/use-workflow-queries';
import { Download, History, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { WORKFLOW_STEP_NAMES } from '@inkstream/shared';
import { type DashboardWorkflow } from '@/types/dashboard';

export function WorkflowHistoryTab() {
  const {
    data: workflows = [],
    isLoading,
    error,
  } = useUserWorkflows({
    enableRefetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Filter for completed workflows (only SUCCEEDED or FAILED)
  const completedWorkflows = workflows.filter(
    (workflow) =>
      workflow.status === 'SUCCEEDED' || workflow.status === 'FAILED'
  );

  console.log(
    'WorkflowHistoryTab rendered - Completed workflows:',
    completedWorkflows.length
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading workflow history...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to load history</h3>
        <p className="text-muted-foreground">
          There was an error loading your workflow history
        </p>
      </div>
    );
  }

  if (completedWorkflows.length === 0) {
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
  const groupedWorkflows = completedWorkflows.reduce((acc, workflow) => {
    const date = new Date(workflow.createdAt || Date.now()).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push({
      ...workflow,
      createdAt: workflow.createdAt || new Date().toISOString(),
    });
    return acc;
  }, {} as Record<string, DashboardWorkflow[]>);

  return (
    <div className="space-y-6">
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
    </div>
  );
}

function CompletedWorkflowCard({ workflow }: { workflow: DashboardWorkflow }) {
  const isSuccessful = workflow.status === 'SUCCEEDED';

  const getStepName = (status: string): string => {
    return (
      WORKFLOW_STEP_NAMES[status as keyof typeof WORKFLOW_STEP_NAMES] || status
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">
              Workflow {workflow.workflowId}
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
            <Badge variant={isSuccessful ? 'default' : 'destructive'}>
              {getStepName(workflow.status)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      {isSuccessful && workflow.s3Data && (
        <CardContent>
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Available Downloads:</h4>
            <div className="flex flex-wrap gap-2">
              {workflow.s3Data.formattedTextKey && (
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Formatted Text
                </Button>
              )}
              {workflow.s3Data.translatedTextKey && (
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Translated Text
                </Button>
              )}
              {workflow.s3Data.audioFileKey && (
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Audio File
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
