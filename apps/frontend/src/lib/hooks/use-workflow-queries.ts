// Custom React Query hooks for workflow management
// Provides typed queries and mutations with caching and optimistic updates

import {
  type S3PathOutputFileKey,
  type StartWorkflowParams,
  type WorkflowResponse,
  type WorkflowStatusCategory,
  WORKFLOW_POLLING_INTERVAL,
} from '@inkstream/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useWorkflowApi } from '../api-service';
import { getWorkflowDisplayId } from '../display';

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

// Hook to get user's workflow list with pagination support
export const useUserWorkflows = (options?: {
  enableRefetchOnMount?: boolean;
  refetchOnWindowFocus?: boolean;
  limit?: number;
  nextToken?: string;
  sortBy?: 'createdAt' | 'updatedAt';
  status?: string;
  statusCategory?: WorkflowStatusCategory;
}) => {
  const apiService = useWorkflowApi();
  const {
    enableRefetchOnMount = false,
    refetchOnWindowFocus = true,
    limit,
    nextToken,
    sortBy,
    status,
    statusCategory,
  } = options || {};

  const queryKey = [
    ...workflowKeys.lists(),
    'paginated',
    {
      limit: limit,
      nextToken: nextToken,
      sortBy: sortBy,
      status: status,
      statusCategory: statusCategory,
    },
  ];

  return useQuery({
    queryKey,
    queryFn: async () => {
      try {
        const result = await apiService.listUserWorkflows({
          limit,
          nextToken,
          sortBy,
          status,
          statusCategory,
        });
        return result;
      } catch (error) {
        console.error('Failed to fetch user workflows:', error);
        throw error; // Let React Query handle the error instead of returning fallback data
      }
    },
    // Refetch every 30 seconds to catch new workflows
    refetchInterval: 30 * 1000, // 30 seconds
    // Enable refetch on mount if requested
    refetchOnMount: enableRefetchOnMount ? 'always' : true,
    // Enable refetch on window focus
    refetchOnWindowFocus,
    // Remove initialData to ensure proper pagination behavior
    staleTime: 0, // Consider data stale immediately to ensure fresh fetches
  });
};

// Hook for active workflows with pagination support and polling
export const useActiveWorkflowsPaginated = (options?: {
  limit?: number;
  nextToken?: string;
  onWorkflowCompleted?: (workflowId: string) => void;
}) => {
  const { onWorkflowCompleted, ...queryOptions } = options || {};
  const previousWorkflowIds = useRef<string[]>([]);

  const result = useUserWorkflows({
    enableRefetchOnMount: true,
    refetchOnWindowFocus: true,
    statusCategory: 'active',
    limit: queryOptions?.limit || 10,
    nextToken: queryOptions?.nextToken,
  });

  const currentWorkflows = result.data?.items || [];
  const currentWorkflowIds = currentWorkflows.map((w) => w.workflowId);

  // Detect completed workflows
  useEffect(() => {
    if (previousWorkflowIds.current.length > 0 && onWorkflowCompleted) {
      // Find workflows that were active but are no longer in the active list
      const completedWorkflowIds = previousWorkflowIds.current.filter(
        (id) => !currentWorkflowIds.includes(id)
      );

      // Notify about each completed workflow
      completedWorkflowIds.forEach((workflowId) => {
        onWorkflowCompleted(workflowId);
      });
    }

    // Update the previous workflow IDs
    previousWorkflowIds.current = currentWorkflowIds;
  }, [currentWorkflowIds, onWorkflowCompleted]);

  return {
    ...result,
    activeWorkflows: currentWorkflows,
    nextToken: result.data?.nextToken,
  };
};

// Hook to handle workflow completion notifications
export const useWorkflowCompletionNotification = (
  isActiveTab: boolean,
  onSwitchToHistory: () => void
) => {
  const handleWorkflowCompleted = (workflowId: string) => {
    if (!isActiveTab) return;

    const workflowDisplayId = getWorkflowDisplayId(workflowId);

    toast.success(`Workflow ${workflowDisplayId} completed!`, {
      description:
        'Your workflow has finished processing and results are ready for download.',
      action: {
        label: 'View in History',
        onClick: onSwitchToHistory,
      },
      duration: 15000, // 15 seconds
    });
  };

  return { handleWorkflowCompleted };
};

// Hook to download workflow results
export const useDownloadWorkflowResult = () => {
  const apiService = useWorkflowApi();

  return useMutation({
    mutationFn: async ({
      workflowId,
      outputFileType = 'formattedText',
    }: {
      workflowId: string;
      outputFileType: S3PathOutputFileKey;
    }) => {
      const downloadedFilename = apiService.downloadWorkflowResult(
        workflowId,
        outputFileType
      );
      return downloadedFilename;
    },
    onSuccess: (filename) => {
      toast.success(`File downloaded successfully: ${filename}`);
    },

    onError: (error) => {
      console.error('Failed to download file:', error);
      toast.error('Failed to download file. Please try again.');
    },
  });
};
