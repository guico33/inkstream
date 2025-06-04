// Custom React Query hooks for workflow management
// Provides typed queries and mutations with caching and optimistic updates

import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useWorkflowApi } from '../api-service';
import {
  type StartWorkflowParams,
  type WorkflowResponse,
  type WorkflowStatusCategory,
  WORKFLOW_POLLING_INTERVAL,
} from '@inkstream/shared';
import { toast } from 'sonner';
import { POLLING_INTERVAL } from '../constants';

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
      console.log('Fetching user workflows from API with params:', {
        limit,
        nextToken,
        sortBy,
        status,
        statusCategory,
      });
      try {
        const result = await apiService.listUserWorkflows({
          limit,
          nextToken,
          sortBy,
          status,
          statusCategory,
        });
        console.log(`Fetched ${result?.items?.length || 0} workflows from API`);
        return result;
      } catch (error) {
        console.error('Failed to fetch user workflows:', error);
        throw error; // Let React Query handle the error instead of returning fallback data
      }
    },
    // Refetch every 30 seconds to catch new workflows
    refetchInterval: POLLING_INTERVAL,
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
}) => {
  const result = useUserWorkflows({
    enableRefetchOnMount: true,
    refetchOnWindowFocus: true,
    statusCategory: 'active',
    limit: options?.limit || 10,
    nextToken: options?.nextToken,
  });

  return {
    ...result,
    activeWorkflows: result.data?.items || [],
    nextToken: result.data?.nextToken,
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
