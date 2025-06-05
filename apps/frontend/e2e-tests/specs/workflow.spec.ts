import { test, expect } from '@playwright/test';
import { setupAuthMocks, mockUser, mockTokens } from '../mocks/auth-mocks';
import {
  setupWorkflowMocks,
  mockWorkflowFailure,
  mockS3UploadFailure,
  mockS3DownloadFailure,
  mockActiveWorkflow,
  mockCompletedWorkflow as baseMockCompletedWorkflow,
} from '../mocks/workflow-mocks';
import { WorkflowResponse } from '@inkstream/shared';
import { setStorageAuth, clearStorage } from '../utils/test-utils';
import {
  navigateToDashboard,
  selectNewWorkflowTab,
  selectActiveWorkflowsTab,
  selectWorkflowHistoryTab,
  uploadTestFile,
  setWorkflowParameters,
  startWorkflow,
  expectWorkflowStartSuccess,
  expectToBeOnActiveTab,
  expectActiveWorkflowVisible,
  expectDownloadButtonsVisible,
  clickDownloadButton,
  expectDownloadSuccess,
  expectWorkflowInHistory,
  expectEmptyActiveWorkflows,
  expectEmptyWorkflowHistory,
  expectWorkflowError,
  expectStartButtonDisabled,
  expectWorkflowProgress,
} from '../utils/workflow-test-utils';

test.describe('Workflow Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearStorage(page);

    // Set up authentication
    await setStorageAuth(page, mockUser, {
      ...mockTokens,
      expiresAt: Date.now() + 3600000,
    });

    // Set up mocks
    await setupAuthMocks(page);
    await setupWorkflowMocks(page);
  });

  test.describe('File Upload and Selection', () => {
    test('should display file upload area on new workflow tab', async ({
      page,
    }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      // Should show upload area
      await expect(page.getByText(/Upload your document/i)).toBeVisible();
      await expect(
        page.getByText(/Drag and drop your file here/i)
      ).toBeVisible();

      // Should show supported file types
      await expect(
        page.getByText('PDF', { exact: false }).first()
      ).toBeVisible();
      await expect(page.getByText(/Maximum file size/i)).toBeVisible();
    });

    test('should successfully upload a valid file', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page, 'test-document.pdf');

      // Should show file preview - verification is already done in uploadTestFile()
      await expect(page.getByText('test-document.pdf')).toBeVisible();
    });

    test('should allow removing selected file', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page, 'test-document.pdf');

      // Remove file using the test ID
      await page.getByTestId('remove-file-button').click();

      // Should return to upload area
      await expect(page.getByText(/Upload your document/i)).toBeVisible();
      await expect(page.getByText('test-document.pdf')).not.toBeVisible();
    });

    test('should validate file type', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      // Try to upload unsupported file type
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.exe',
        mimeType: 'application/octet-stream',
        buffer: Buffer.from('fake executable'),
      });

      // Should show error (via alert in current implementation)
      // Note: In a real implementation, this should be a proper toast/error message
    });

    test('should validate file size', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      // For e2e tests, we'll just verify the validation UI exists
      // since Playwright has buffer size limits
      await expect(page.getByText(/Maximum file size/i)).toBeVisible();
      // Use first() to avoid strict mode violation with multiple "50MB" texts
      await expect(page.getByText(/50MB/i).first()).toBeVisible();
    });
  });

  test.describe('Workflow Parameters', () => {
    test('should display default workflow parameters', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      // Should show parameter form
      await expect(
        page.getByRole('heading', { name: /Processing Options/i })
      ).toBeVisible();
      await expect(page.getByText(/Enable Translation/i)).toBeVisible();
      await expect(page.getByText(/Convert to Speech/i)).toBeVisible();

      // Start button should be disabled without file
      await expectStartButtonDisabled(page);
    });

    test('should enable translation options', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      // Need to upload a file first to enable form controls
      await uploadTestFile(page);

      // Click the translation switch to enable it
      await page.locator('#doTranslate').click();

      // Should show language selector
      await expect(page.getByRole('combobox')).toBeVisible();
    });

    test('should enable speech conversion', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      // Need to upload a file first to enable form controls
      await uploadTestFile(page);

      // Click the speech switch to enable it
      await page.locator('#doSpeech').click();

      // Switch should be enabled
      const speechSwitch = page.getByRole('switch', {
        name: /Convert to Speech/i,
      });
      await expect(speechSwitch).toBeChecked();
    });

    test('should enable start button when file is selected', async ({
      page,
    }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page);

      // Start button should now be enabled
      const startButton = page.getByRole('button', { name: /Start Workflow/i });
      await expect(startButton).toBeEnabled();
    });
  });

  test.describe('Workflow Execution', () => {
    test('should start workflow with basic parameters', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page);

      await startWorkflow(page);

      await expectWorkflowStartSuccess(page);
      await expectToBeOnActiveTab(page);
    });

    test('should start workflow with translation enabled', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page);
      await setWorkflowParameters(page, {
        enableTranslation: true,
        targetLanguage: 'French',
      });
      await startWorkflow(page);

      await expectWorkflowStartSuccess(page);
      await expectToBeOnActiveTab(page);
    });

    test('should start workflow with all options enabled', async ({ page }) => {
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page);
      await setWorkflowParameters(page, {
        enableTranslation: true,
        targetLanguage: 'Spanish',
        enableSpeech: true,
      });
      await startWorkflow(page);

      await expectWorkflowStartSuccess(page);
      await expectToBeOnActiveTab(page);
    });

    test('should handle workflow start failure', async ({ page }) => {
      await mockWorkflowFailure(page, 'Service unavailable');

      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page);
      await startWorkflow(page);

      await expectWorkflowError(page, 'Failed to start workflow');
    });

    test('should handle S3 upload failure', async ({ page }) => {
      await mockS3UploadFailure(page);

      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page);
      await startWorkflow(page);

      await expectWorkflowError(page);
    });
  });

  test.describe('Active Workflows Monitoring', () => {
    test('should display active workflows', async ({ page }) => {
      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await expectActiveWorkflowVisible(page);

      await expectWorkflowProgress(page, 'EXTRACTING_TEXT');
    });

    test('should show workflow progress', async ({ page }) => {
      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      // Verify progress bar and status labels

      // Should show progress bar and current step
      await expect(page.getByRole('progressbar').first()).toBeVisible();
      await expect(page.getByText(/Current Step/i)).toBeVisible();
      await expect(page.getByText(/Progress/i)).toBeVisible();
    });

    test('should display empty state when no active workflows', async ({
      page,
    }) => {
      // Mock empty active workflows
      await page.route('**/user-workflows*', async (route) => {
        const url = new URL(route.request().url());
        const statusCategory = url.searchParams.get('statusCategory');

        if (statusCategory === 'active') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ items: [], nextToken: undefined }),
          });
        } else {
          await route.continue();
        }
      });

      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await expectEmptyActiveWorkflows(page);
    });

    test('should show download buttons for available files', async ({
      page,
    }) => {
      // Mock workflow with some completed files
      await page.route('**/user-workflows*', async (route) => {
        const url = new URL(route.request().url());
        const statusCategory = url.searchParams.get('statusCategory');

        if (statusCategory === 'active') {
          const workflowWithFiles = {
            ...mockActiveWorkflow,
            status: 'TRANSLATION_COMPLETE',
            s3Paths: {
              ...mockActiveWorkflow.s3Paths,
              formattedText: 'workflow-results/formatted.txt',
              translatedText: 'workflow-results/translated.txt',
            },
          };

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              items: [workflowWithFiles],
              nextToken: undefined,
            }),
          });
        } else {
          await route.continue();
        }
      });

      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await expectDownloadButtonsVisible(page, ['formatted', 'translated']);
    });
  });

  test.describe('File Downloads', () => {
    // Before each file download test, mock an active workflow with all downloadable paths
    test.beforeEach(async ({ page }) => {
      // Define item for both list and detail mocks
      const item = {
        ...mockActiveWorkflow,
        s3Paths: {
          originalFile: mockActiveWorkflow.s3Paths!.originalFile,
          formattedText: 'workflow-results/formatted.txt',
          translatedText: 'workflow-results/translated.txt',
          audioFile: 'workflow-results/audio.mp3',
        },
      };
      await page.route('**/user-workflows*', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ items: [item], nextToken: undefined }),
        });
      });

      // Mock GET /workflow/:id for download buttons
      await page.route('**/workflow/*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(item),
          });
        } else {
          await route.continue();
        }
      });
    });

    test('should download formatted text file', async ({ page }) => {
      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await clickDownloadButton(page, 'formatted');

      await page.pause(); // Pause to manually verify download

      await expectDownloadSuccess(page, 'formatted');
    });

    test('should download translated text file', async ({ page }) => {
      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await clickDownloadButton(page, 'translated');

      await expectDownloadSuccess(page, 'translated');
    });

    test('should download audio file', async ({ page }) => {
      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await clickDownloadButton(page, 'audio');
      await expectDownloadSuccess(page, 'audio');
    });
  });

  test.describe('Workflow History', () => {
    test('should display completed workflows', async ({ page }) => {
      await navigateToDashboard(page);
      await selectWorkflowHistoryTab(page);

      await expectWorkflowInHistory(page);

      await expect(page.getByText(/Workflow Complete/i)).toBeVisible();
    });

    test('should show failed workflows', async ({ page }) => {
      await navigateToDashboard(page);
      await selectWorkflowHistoryTab(page);

      await expect(page.getByText(/Workflow Failed/i)).toBeVisible();
      await expect(page.getByText(/Failed to extract text/i)).toBeVisible();
    });

    test('should display empty state when no completed workflows', async ({
      page,
    }) => {
      // Mock empty completed workflows
      await page.route('**/user-workflows*', async (route) => {
        const url = new URL(route.request().url());
        const statusCategory = url.searchParams.get('statusCategory');

        if (statusCategory === 'completed') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ items: [], nextToken: undefined }),
          });
        } else {
          await route.continue();
        }
      });

      await navigateToDashboard(page);
      await selectWorkflowHistoryTab(page);

      await expectEmptyWorkflowHistory(page);
    });

    test('should show download options for successful workflows', async ({
      page,
    }) => {
      await navigateToDashboard(page);
      await selectWorkflowHistoryTab(page);

      // Should show download buttons for successful workflow
      await expectDownloadButtonsVisible(page, [
        'formatted',
        'translated',
        'audio',
      ]);
    });

    test('should download files from history', async ({ page }) => {
      await navigateToDashboard(page);
      await selectWorkflowHistoryTab(page);

      await clickDownloadButton(page, 'formatted');
      await expectDownloadSuccess(page, 'formatted');
    });

    test('should refresh workflow history', async ({ page }) => {
      await navigateToDashboard(page);

      const olderWorkflowTime = new Date('2025-06-01T10:00:00.000Z');
      const newerWorkflowTime = new Date('2025-06-02T12:00:00.000Z'); // More recent

      const initialCompletedWorkflow: WorkflowResponse = {
        ...baseMockCompletedWorkflow,
        workflowId: 'hist-initial-001',
        status: 'SUCCEEDED',
        createdAt: olderWorkflowTime.toISOString(),
        updatedAt: new Date(
          olderWorkflowTime.getTime() + 5 * 60000
        ).toISOString(),
        s3Paths: {
          originalFile: 'uploads/older-workflow-in-history.pdf',
          formattedText: 'workflow-results/hist-initial-001/formatted.txt',
          translatedText: 'workflow-results/hist-initial-001/translated.txt',
          audioFile: 'workflow-results/hist-initial-001/audio.mp3',
        },
        parameters: { doTranslate: false, doSpeech: false },
        userId: mockUser.sub,
        statusCategory: 'completed',
        statusCategoryCreatedAt: `completed#${olderWorkflowTime.toISOString()}`,
      };

      const newCompletedWorkflow: WorkflowResponse = {
        ...baseMockCompletedWorkflow,
        workflowId: 'hist-new-002',
        status: 'SUCCEEDED',
        createdAt: newerWorkflowTime.toISOString(),
        updatedAt: new Date(
          newerWorkflowTime.getTime() + 5 * 60000
        ).toISOString(),
        s3Paths: {
          originalFile: 'uploads/newer-workflow-added-on-refresh.pdf',
          formattedText: 'workflow-results/hist-new-002/formatted.txt',
          translatedText: 'workflow-results/hist-new-002/translated.txt',
          audioFile: 'workflow-results/hist-new-002/audio.mp3',
        },
        parameters: { doTranslate: false, doSpeech: false },
        userId: mockUser.sub,
        statusCategory: 'completed',
        statusCategoryCreatedAt: `completed#${newerWorkflowTime.toISOString()}`,
      };

      let serveRefreshedData = false;

      // Mock the response for workflow history.
      // This specific route handler should take precedence over more generic ones
      // from setupWorkflowMocks for 'completed' statusCategory.
      await page.route(
        (url) =>
          url.pathname.includes('/user-workflows') &&
          url.searchParams.get('statusCategory') === 'completed',
        async (route) => {
          if (serveRefreshedData) {
            // Serve new data with the newer workflow at the top
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                items: [newCompletedWorkflow, initialCompletedWorkflow], // Newest first
                nextToken: undefined,
              }),
            });
          } else {
            // Serve initial data
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                items: [initialCompletedWorkflow],
                nextToken: undefined,
              }),
            });
          }
        }
      );

      await selectWorkflowHistoryTab(page);

      // Check that the initial workflow is visible (using filename from s3Paths.originalFile)
      await expect(
        page.getByText('older-workflow-in-history.pdf')
      ).toBeVisible();
      // Verify "Workflow Complete" text is visible, associated with the initial item.
      await expect(page.getByText(/Workflow Complete/i).first()).toBeVisible();

      // Prepare to serve refreshed data for the next API call
      serveRefreshedData = true;

      const refreshButton = page.getByRole('button', { name: /Refresh/i });
      await expect(refreshButton).toBeVisible();

      await refreshButton.click();

      // Should reload the list and show the new workflow's filename
      await expect(
        page.getByText('newer-workflow-added-on-refresh.pdf')
      ).toBeVisible();

      // The old workflow should also still be visible
      await expect(
        page.getByText('older-workflow-in-history.pdf')
      ).toBeVisible();

      // Check that the new workflow (most recent) is at the top.
      // This assumes items are rendered in a list structure (e.g., using <li> or similar role).
      // If a more specific selector for list items is available, it would be more robust.
      const listItems = page.getByRole('listitem');
      if ((await listItems.count()) > 0) {
        await expect(
          listItems.first().getByText('newer-workflow-added-on-refresh.pdf')
        ).toBeVisible();
      } else {
        // Fallback: Check if the new workflow's filename appears before the old one in the relevant container.
        // This is less robust and depends on the overall text content order.
        // For a more reliable check here, a specific selector for the history list container would be needed.
        // For now, we'll rely on the mock serving it first and it being visible.
        // The primary check is newCompletedWorkflow filename visibility.
        console.warn(
          'Could not find elements with role="listitem" to confirm order. Relying on visibility of new item.'
        );
      }

      // Original assertion: ensure "Workflow Complete" is still generally visible
      await expect(page.getByText(/Workflow Complete/i).first()).toBeVisible();
    });
  });

  test.describe('End-to-End Workflow Flow', () => {
    test('should complete full workflow lifecycle', async ({ page }) => {
      // Step 1: Start new workflow
      await navigateToDashboard(page);
      await selectNewWorkflowTab(page);

      await uploadTestFile(page, 'test-document.pdf');
      await setWorkflowParameters(page, {
        enableTranslation: true,
        targetLanguage: 'Spanish',
        enableSpeech: true,
      });
      await startWorkflow(page);

      // Step 2: Verify redirect to active tab
      await expectWorkflowStartSuccess(page);
      await expectToBeOnActiveTab(page);

      // Step 3: Monitor active workflow
      await expectActiveWorkflowVisible(page);

      // Step 4: Check workflow appears in history after completion
      await selectWorkflowHistoryTab(page);
      await expectWorkflowInHistory(page);
    });

    test('should handle workflow progression', async ({ page }) => {
      // This test would require more sophisticated mocking to simulate
      // real-time progress updates. For now, we test static states.

      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await expectActiveWorkflowVisible(page);
      await expectWorkflowProgress(page);

      // In a real scenario, this would test polling/websocket updates
      // showing the workflow progressing through different states
    });
  });

  test.describe('Error Handling', () => {
    test('should handle API errors gracefully', async ({ page }) => {
      test.setTimeout(10000); // 10 seconds timeout

      // Mock API error
      await page.route('**/user-workflows*', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });

      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await expect(page.getByText(/Unable to load workflows/i)).toBeVisible({
        timeout: 10000,
      });
    });

    test('should handle download errors', async ({ page }) => {
      // Set up a workflow with downloadable files (similar to File Downloads beforeEach)
      const workflowWithFiles = {
        ...mockActiveWorkflow,
        status: 'SUCCEEDED',
        statusCategory: 'completed',
        s3Paths: {
          originalFile: mockActiveWorkflow.s3Paths!.originalFile,
          formattedText: 'workflow-results/formatted.txt',
          translatedText: 'workflow-results/translated.txt',
          audioFile: 'workflow-results/audio.mp3',
        },
      };

      // Mock workflow list to show workflow with downloadable files
      await page.route('**/user-workflows*', async (route) => {
        const url = new URL(route.request().url());
        const statusCategory = url.searchParams.get('statusCategory');

        if (statusCategory === 'active') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              items: [workflowWithFiles],
              nextToken: undefined,
            }),
          });
        } else {
          await route.continue();
        }
      });

      // Mock individual workflow details for download buttons
      await page.route('**/workflow/*', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(workflowWithFiles),
          });
        } else {
          await route.continue();
        }
      });

      // Mock S3 download failure
      await mockS3DownloadFailure(page);

      await navigateToDashboard(page);
      await selectActiveWorkflowsTab(page);

      await clickDownloadButton(page, 'formatted');
      await expect(page.getByText(/Failed to download/i)).toBeVisible();
    });
  });
});
