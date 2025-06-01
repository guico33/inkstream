// Main dashboard component with tabbed interface
// Provides navigation between new workflow, active workflows, and history

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { NewWorkflowTab } from './dashboard/NewWorkflowTab';
import { ActiveWorkflowsTab } from './dashboard/ActiveWorkflowsTab';
import { WorkflowHistoryTab } from './dashboard/WorkflowHistoryTab';
import { workflowKeys } from '@/lib/hooks/use-workflow-queries';
import { Plus, Activity, History } from 'lucide-react';

export function Dashboard() {
  const [activeTab, setActiveTab] = useState('new');
  const queryClient = useQueryClient();

  const handleTabChange = (value: string) => {
    setActiveTab(value);

    // Trigger fresh API call when switching to active or history tabs
    if (value === 'active' || value === 'history') {
      console.log(`Switching to ${value} tab - triggering fresh API call`);
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    }
  };

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h2 className="text-3xl font-bold tracking-tight">
          Workflow Dashboard
        </h2>
        <p className="text-muted-foreground">
          Manage your document processing workflows
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
          <TabsTrigger value="new">
            <div className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>New Workflow</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="active">
            <div className="flex items-center space-x-2">
              <Activity className="h-4 w-4" />
              <span>Active</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="history">
            <div className="flex items-center space-x-2">
              <History className="h-4 w-4" />
              <span>History</span>
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Start New Workflow</CardTitle>
              <CardDescription>
                Upload a document and configure processing options
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NewWorkflowTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="active" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Active Workflows</CardTitle>
              <CardDescription>
                Monitor your currently running workflows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ActiveWorkflowsTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Workflow History</CardTitle>
              <CardDescription>
                View and download from completed workflows
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WorkflowHistoryTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
