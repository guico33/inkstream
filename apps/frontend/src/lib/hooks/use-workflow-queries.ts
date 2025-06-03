// Custom React Query hooks for workflow management
// Provides typed queries and mutations with caching and optimistic updates

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkflowApi } from '../api-service';
import {
  type StartWorkflowParams,
  type WorkflowResponse,
  WORKFLOW_POLLING_INTERVAL,
} from '@inkstream/shared';
import { toast } from 'sonner';

// Query keys for consistent caching
export const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (filters: string) => [...workflowKeys.lists(), { filters }] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
};

// Hook to start a new workflow
export const useStartWorkflow = () => {
  const apiService = useWorkflowApi();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: StartWorkflowParams) =>
      apiService.startWorkflow(params),
    onSuccess: (data) => {
      // Invalidate workflow lists to include new workflow
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });

      // Add new workflow to cache
      queryClient.setQueryData(workflowKeys.detail(data.workflowId), data);

      toast.success('Workflow started successfully');
    },
    onError: (error) => {
      console.error('Failed to start workflow:', error);
      toast.error('Failed to start workflow. Please try again.');
    },
  });
};

// Hook to get workflow status with optional polling
export const useWorkflowStatus = (
  workflowId: string | undefined,
  options: {
    enablePolling?: boolean;
    onStatusChange?: (status: WorkflowResponse) => void;
  } = {}
) => {
  const apiService = useWorkflowApi();
  const { enablePolling = false, onStatusChange } = options;

  const query = useQuery({
    queryKey: workflowKeys.detail(workflowId || ''),
    queryFn: () => apiService.getWorkflow({ workflowId: workflowId! }),
    enabled: !!workflowId,
    refetchInterval: enablePolling ? WORKFLOW_POLLING_INTERVAL : false,
  });

  // Handle status changes with useEffect
  useEffect(() => {
    if (query.data && onStatusChange) {
      onStatusChange(query.data);
    }
  }, [query.data, onStatusChange]);

  return query;
};

// Hook to get user's workflow list
export const useUserWorkflows = (options?: {
  enableRefetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
}) => {
  const apiService = useWorkflowApi();
  const { enableRefetchOnMount = false, refetchOnWindowFocus = true } =
    options || {};

  return useQuery({
    queryKey: workflowKeys.lists(),
    queryFn: async () => {
      console.log('Fetching user workflows from API...');
      try {
        const result = await apiService.listUserWorkflows();
        console.log(`Fetched ${result?.length || 0} workflows from API`);
        return result;
      } catch (error) {
        console.error('Failed to fetch user workflows:', error);
        // Return empty array as fallback for development
        return [];
      }
    },
    // Refetch every 30 seconds to catch new workflows
    refetchInterval: 30000,
    // Enable refetch on mount if requested
    refetchOnMount: enableRefetchOnMount ? 'always' : true,
    // Enable refetch on window focus
    refetchOnWindowFocus,
    // Ensure we always have an array
    initialData: [],
  });
};

// Hook for both active and recent workflows with polling
export const useActiveWorkflowsPolling = () => {
  const {
    data: workflows,
    isLoading,
    error,
  } = useUserWorkflows({
    enableRefetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  // Ensure workflows is always an array
  const workflowsArray = Array.isArray(workflows) ? workflows : [];

  console.log(
    'useActiveWorkflowsPolling - Total workflows:',
    workflowsArray.length
  );
  console.log(
    'Workflow statuses:',
    workflowsArray.map((w) => `${w.workflowId}: ${w.status}`)
  );

  // Get active workflows (anything that's not SUCCEEDED or FAILED)
  const activeWorkflows = workflowsArray.filter(
    (workflow) =>
      workflow.status !== 'SUCCEEDED' && workflow.status !== 'FAILED'
  );

  console.log(
    'Active workflows:',
    activeWorkflows.map((w) => `${w.workflowId}: ${w.status}`)
  );

  // Get recent completed workflows (only SUCCEEDED or FAILED)
  const completedWorkflows = workflowsArray
    .filter(
      (workflow) =>
        workflow.status === 'SUCCEEDED' || workflow.status === 'FAILED'
    )
    .sort((a, b) => {
      const dateA = a.updatedAt || a.createdAt || '0';
      const dateB = b.updatedAt || b.createdAt || '0';
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    })
    .slice(0, 3);

  console.log(
    'Completed workflows:',
    completedWorkflows.map((w) => `${w.workflowId}: ${w.status}`)
  );

  return {
    activeWorkflows,
    completedWorkflows,
    allWorkflows: workflowsArray,
    isLoading: isLoading,
    errors: error ? [error] : [],
  };
};

// Hook to download workflow results
export const useDownloadWorkflowResult = () => {
  const apiService = useWorkflowApi();

  return useMutation({
    mutationFn: async ({
      workflowId,
      resultType = 'formatted',
      filename,
    }: {
      workflowId: string;
      resultType?: 'formatted' | 'translated' | 'audio';
      filename?: string;
    }) => {
      await apiService.downloadWorkflowResult(workflowId, resultType, filename);
    },
    onSuccess: () => {
      toast.success('File download started');
    },
    onError: (error) => {
      console.error('Failed to download file:', error);
      toast.error('Failed to download file. Please try again.');
    },
  });
};
