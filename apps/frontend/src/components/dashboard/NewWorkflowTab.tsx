// New workflow tab component
// Combines file upload with workflow parameters form

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileUploadSection } from './FileUploadSection';
import { WorkflowParametersForm } from './WorkflowParametersForm';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useWorkflowApi } from '@/lib/api-service';
import { type WorkflowFormData } from '@/types/dashboard';

export function NewWorkflowTab() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const workflowApi = useWorkflowApi();

  const handleFileSelect = (file: File | null) => {
    setSelectedFile(file);
  };

  const handleWorkflowSubmit = async (params: WorkflowFormData) => {
    if (!selectedFile) {
      toast.error('Please select a file first');
      return;
    }

    setIsSubmitting(true);
    try {
      toast.loading('Starting workflow...', { id: 'workflow-start' });

      const response = await workflowApi.startWorkflowWithFile({
        file: selectedFile,
        doTranslate: params.doTranslate,
        doSpeech: params.doSpeech,
        targetLanguage: params.targetLanguage,
      });

      toast.success(
        `Workflow started successfully! ID: ${response.workflowId}`,
        {
          id: 'workflow-start',
        }
      );

      // Reset form
      setSelectedFile(null);
    } catch (error) {
      console.error('Failed to start workflow:', error);
      toast.error('Failed to start workflow. Please try again.', {
        id: 'workflow-start',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* File Upload Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          <FileUploadSection
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
          />
        </CardContent>
      </Card>

      <Separator />

      {/* Workflow Parameters Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Processing Options</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkflowParametersForm
            onSubmit={handleWorkflowSubmit}
            isLoading={isSubmitting}
            disabled={!selectedFile}
          />
        </CardContent>
      </Card>
    </div>
  );
}
