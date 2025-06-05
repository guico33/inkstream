import { Page } from '@playwright/test';
import {
  WorkflowResponse,
  ListUserWorkflowsResponse,
  WorkflowStatus,
  getStatusCategory,
} from '@inkstream/shared';

export const mockWorkflowStartResponse: WorkflowResponse = {
  userId: 'test_user',
  workflowId: 'wf_test_12345',
  status: 'STARTING',
  statusHistory: [],
  statusCategory: 'active',
  statusCategoryCreatedAt: 'active#' + new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  parameters: {
    doTranslate: true,
    doSpeech: true,
    targetLanguage: 'es',
  },
  s3Paths: {
    originalFile: 'user-uploads/test-document.pdf',
  },
};

export const mockActiveWorkflow: WorkflowResponse = {
  userId: 'test_user',
  statusHistory: [],
  statusCategory: 'active',
  statusCategoryCreatedAt: 'active#' + new Date().toISOString(),
  workflowId: 'wf_active_12345',
  status: 'EXTRACTING_TEXT',
  createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
  updatedAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 minute ago
  parameters: {
    doTranslate: true,
    doSpeech: false,
    targetLanguage: 'fr',
  },
  s3Paths: {
    originalFile: 'user-uploads/test-doc.pdf',
  },
};

export const mockCompletedWorkflow: WorkflowResponse = {
  userId: 'test_user',
  workflowId: 'wf_completed_12345',
  status: 'SUCCEEDED',
  statusHistory: [],
  statusCategory: 'completed',
  statusCategoryCreatedAt: 'completed#' + new Date().toISOString(),
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
  updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
  parameters: {
    doTranslate: true,
    doSpeech: true,
    targetLanguage: 'es',
  },
  s3Paths: {
    originalFile: 'user-uploads/sample-document.pdf',
    formattedText: 'workflow-results/formatted.txt',
    translatedText: 'workflow-results/translated.txt',
    audioFile: 'workflow-results/audio.mp3',
  },
};

export const mockFailedWorkflow: WorkflowResponse = {
  userId: 'test_user',
  workflowId: 'wf_failed_12345',
  status: 'FAILED',
  statusHistory: [],
  statusCategory: 'completed',
  statusCategoryCreatedAt: 'completed#' + new Date().toISOString(),
  createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  parameters: {
    doTranslate: false,
    doSpeech: false,
  },
  error: 'Failed to extract text from document',
  s3Paths: {
    originalFile: 'user-uploads/corrupted-file.pdf',
  },
};

export const mockActiveWorkflowsList: ListUserWorkflowsResponse = {
  items: [mockActiveWorkflow],
  nextToken: undefined,
};

export const mockCompletedWorkflowsList: ListUserWorkflowsResponse = {
  items: [mockCompletedWorkflow, mockFailedWorkflow],
  nextToken: undefined,
};

export function createProgressingWorkflow(
  initialStatus: WorkflowStatus = 'STARTING'
): WorkflowResponse {
  const statusCategory = getStatusCategory(initialStatus);
  const date = new Date().toISOString();
  return {
    userId: 'test_user',
    workflowId: 'wf_progressing_' + Date.now(),
    statusHistory: [],
    statusCategory,
    statusCategoryCreatedAt: `${statusCategory}#${date}`,
    status: initialStatus,
    createdAt: date,
    updatedAt: date,
    parameters: {
      doTranslate: true,
      doSpeech: true,
      targetLanguage: 'fr',
    },
    s3Paths: {
      originalFile: 'user-uploads/test-document.pdf',
    },
  };
}

export async function setupWorkflowMocks(page: Page) {
  // Mock S3 upload endpoint - comprehensive mock for all S3 operations
  await page.route('**/*.s3.*.amazonaws.com/**', async (route) => {
    const request = route.request();

    if (request.method() === 'PUT') {
      // Mock successful S3 PUT response for file uploads
      await route.fulfill({
        status: 200,
        headers: {
          ETag: '"mock-etag-12345"',
          'x-amz-request-id': 'mock-request-id',
          'x-amz-id-2': 'mock-id-2',
          'Content-Type': 'application/xml',
        },
        body: '',
      });
    } else if (request.method() === 'POST') {
      // Mock S3 POST (multipart upload initiation)
      await route.fulfill({
        status: 200,
        contentType: 'application/xml',
        body: `<?xml version="1.0" encoding="UTF-8"?>
<InitiateMultipartUploadResult>
  <Bucket>mock-bucket</Bucket>
  <Key>mock-key</Key>
  <UploadId>mock-upload-id</UploadId>
</InitiateMultipartUploadResult>`,
      });
    } else if (request.method() === 'GET') {
      // Handle S3 downloads
      const url = request.url();
      let contentType = 'text/plain';
      let body = 'Mock file content';

      if (url.includes('audio')) {
        contentType = 'audio/mpeg';
        body = 'mock audio content';
      } else if (url.includes('translated')) {
        body = 'Contenido de texto traducido simulado';
      } else if (url.includes('formatted')) {
        body = 'Mock formatted text content';
      }

      await route.fulfill({
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': 'attachment; filename="mock-file.txt"',
        },
        body,
      });
    } else {
      // Mock other S3 operations
      await route.fulfill({
        status: 200,
        body: '',
      });
    }
  });

  // Mock workflow start endpoint - match any /workflow/start path
  await page.route('**/workflow/start', async (route) => {
    console.log('MOCKING WORKFLOW START:', route.request().url());
    const requestBody = route.request().postData();
    let response = mockWorkflowStartResponse;

    if (requestBody) {
      try {
        const params = JSON.parse(requestBody);
        response = {
          ...mockWorkflowStartResponse,
          parameters: {
            doTranslate: params.doTranslate || false,
            doSpeech: params.doSpeech || false,
            targetLanguage: params.targetLanguage,
          },
        };
      } catch {
        // Use default response if can't parse
      }
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });

  // Mock workflow status endpoint - match the full API Gateway URL
  await page.route('**execute-api*.amazonaws.com/workflow/*', async (route) => {
    if (route.request().method() === 'GET') {
      console.log('MOCKING WORKFLOW STATUS:', route.request().url());
      const url = route.request().url();
      const workflowId = url.split('/').pop();

      let workflow: WorkflowResponse;
      if (workflowId?.includes('active')) {
        workflow = mockActiveWorkflow;
      } else if (workflowId?.includes('completed')) {
        workflow = mockCompletedWorkflow;
      } else if (workflowId?.includes('failed')) {
        workflow = mockFailedWorkflow;
      } else {
        workflow = mockWorkflowStartResponse;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workflow),
      });
    } else {
      await route.continue();
    }
  });

  // Mock user workflows list endpoint - match any host path for /user-workflows
  await page.route('**/user-workflows*', async (route) => {
    console.log('MOCKING USER WORKFLOWS:', route.request().url());
    const url = new URL(route.request().url());
    const statusCategory = url.searchParams.get('statusCategory');

    let response: ListUserWorkflowsResponse;
    if (statusCategory === 'active') {
      response = mockActiveWorkflowsList;
    } else if (statusCategory === 'completed') {
      response = mockCompletedWorkflowsList;
    } else {
      // Return all workflows
      response = {
        items: [
          ...mockActiveWorkflowsList.items,
          ...mockCompletedWorkflowsList.items,
        ],
        nextToken: undefined,
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    });
  });
}

export async function setupWorkflowProgressMock(
  page: Page,
  progressSteps: WorkflowStatus[]
) {
  let currentStep = 0;

  await page.route('**/workflow/*', async (route) => {
    if (route.request().method() === 'GET') {
      const workflow = createProgressingWorkflow(
        progressSteps[currentStep] || 'SUCCEEDED'
      );

      // Add s3Paths based on progress
      if (currentStep >= 2) {
        // After FORMATTING_TEXT
        workflow.s3Paths!.formattedText = 'workflow-results/formatted.txt';
      }
      if (currentStep >= 4) {
        // After TRANSLATION_COMPLETE
        workflow.s3Paths!.translatedText = 'workflow-results/translated.txt';
      }
      if (currentStep >= 5) {
        // After CONVERTING_TO_SPEECH
        workflow.s3Paths!.audioFile = 'workflow-results/audio.mp3';
      }

      currentStep = Math.min(currentStep + 1, progressSteps.length - 1);

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workflow),
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockWorkflowFailure(
  page: Page,
  errorMessage: string = 'Workflow failed'
) {
  await page.route('**/workflow/start', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({
        error: 'InternalServerError',
        message: errorMessage,
      }),
    });
  });
}

export async function mockS3UploadFailure(page: Page) {
  const s3Pattern = '**/*.s3.*.amazonaws.com/**';
  // Remove any existing S3 mocks to override behavior
  await page.unroute(s3Pattern);
  // Mock all PUT (and browser OPTIONS) to S3 as failures
  await page.route(s3Pattern, async (route) => {
    const method = route.request().method();
    if (method === 'PUT' || method === 'OPTIONS') {
      await route.fulfill({
        status: 403,
        contentType: 'application/xml',
        body: '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>',
      });
    } else {
      await route.continue();
    }
  });
}

export async function mockS3DownloadFailure(page: Page) {
  const s3Pattern = '**/*.s3.*.amazonaws.com/**';
  // Remove any existing S3 mocks to override behavior
  await page.unroute(s3Pattern);
  // Mock all GET requests to S3 as failures
  await page.route(s3Pattern, async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 403,
        contentType: 'application/xml',
        body: '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>',
      });
    } else {
      await route.continue();
    }
  });
}
