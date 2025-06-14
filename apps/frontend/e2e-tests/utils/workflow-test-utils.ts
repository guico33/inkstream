import { Page, expect } from '@playwright/test';
import { type OutputFileType } from '@inkstream/shared';
import { TEST_TIMEOUTS } from './test-config';

// Constants for download validation
const EXPECTED_FILE_EXTENSIONS = {
  formatted: ['.txt', '.docx', '.pdf'],
  translated: ['.txt', '.docx', '.pdf'],
  audio: ['.mp3', '.wav', '.m4a'],
} as const;

const DOWNLOAD_BUTTON_TEXT = {
  formatted: 'Formatted Text',
  translated: 'Translated Text',
  audio: 'Audio File',
} as const;

export async function navigateToDashboard(page: Page) {
  await page.goto('/dashboard', { timeout: TEST_TIMEOUTS.NAVIGATION });
  await page.waitForLoadState('networkidle', { timeout: TEST_TIMEOUTS.NAVIGATION });
}

export async function selectNewWorkflowTab(page: Page) {
  await page.getByRole('tab', { name: /New Workflow/i }).click();
  await expect(page.getByText(/Start New Workflow/i)).toBeVisible({ timeout: TEST_TIMEOUTS.DEFAULT });
}

export async function selectActiveWorkflowsTab(page: Page) {
  await page.getByRole('tab', { name: /Active/i }).click();
  await page.waitForLoadState('networkidle', { timeout: TEST_TIMEOUTS.NETWORK_IDLE });
}

export async function selectWorkflowHistoryTab(page: Page) {
  await page.getByRole('tab', { name: /History/i }).click();
  await page.waitForLoadState('networkidle', { timeout: TEST_TIMEOUTS.NETWORK_IDLE });
}

export async function uploadTestFile(
  page: Page,
  filename: string = 'test-document.pdf'
) {
  // Create a test file blob
  const testFileContent = 'This is a test PDF content for e2e testing';

  // Find the file input and upload
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'application/pdf',
    buffer: Buffer.from(testFileContent),
  });

  // Verify file is selected - wait for file preview to appear
  await expect(page.getByText(filename)).toBeVisible();

  // File upload complete - verify the remove button is present
  await expect(page.getByTestId('remove-file-button')).toBeVisible();
}

export async function setWorkflowParameters(
  page: Page,
  options: {
    enableTranslation?: boolean;
    targetLanguage?: string;
    enableSpeech?: boolean;
  }
) {
  if (options.enableTranslation !== undefined) {
    // Click the switch directly instead of the label (which may be disabled)
    const translationSwitch = page.locator('#doTranslate');
    await translationSwitch.click();

    if (options.enableTranslation && options.targetLanguage) {
      // Wait for language selector to appear - use the actual combobox instead of name attribute
      await expect(page.getByRole('combobox')).toBeVisible();
      await page.getByRole('combobox').click();
      await page
        .getByRole('option', { name: new RegExp(options.targetLanguage, 'i') })
        .click();
    }
  }

  if (options.enableSpeech !== undefined) {
    // Click the switch directly instead of the label (which may be disabled)
    const speechSwitch = page.locator('#doSpeech');
    await speechSwitch.click();
  }
}

export async function startWorkflow(page: Page) {
  const startButton = page.getByRole('button', { name: /Start Workflow/i });
  await expect(startButton).toBeEnabled();
  await startButton.click();
}

export async function expectWorkflowStartSuccess(page: Page) {
  const timeout = TEST_TIMEOUTS.WORKFLOW_START;

  // Primary method: Wait for automatic tab switch to Active tab
  // This is more reliable than toast detection in CI environments
  try {
    // Wait for the Active tab to become selected (automatic redirect after successful workflow start)
    await expect(page.getByRole('tab', { name: /Active/i })).toHaveAttribute(
      'aria-selected',
      'true',
      { timeout }
    );

    // Ensure we're actually on the Active tab content
    await expect(
      page
        .locator('h3')
        .filter({ hasText: /Active Workflows/ })
        .first()
    ).toBeVisible({ timeout: 5000 });

    console.log('✅ Workflow start success detected via tab switch');
    return;
  } catch {
    console.warn(
      '❌ Tab switch detection failed, trying toast detection as fallback'
    );
  }

  // Fallback method: Try to detect toast messages (less reliable in CI)
  const toastTitleSelector =
    '[data-sonner-toaster] li[data-sonner-toast] div[data-title]';

  try {
    // First, wait for any toast title to appear
    await page.waitForSelector(toastTitleSelector, { timeout: 8000 });

    // Then look for the specific success message within the toast title
    await expect(
      page
        .locator(toastTitleSelector)
        .filter({ hasText: /Workflow started successfully!/i })
    ).toBeVisible({ timeout: 5000 });

    console.log('✅ Workflow start success detected via toast message');
  } catch {
    // Final fallback: try to find the text anywhere on the page
    console.warn('Toast title method failed, trying text search fallback');
    await expect(page.getByText(/Workflow started successfully!/i)).toBeVisible(
      {
        timeout: 5000,
      }
    );

    console.log('✅ Workflow start success detected via text search');
  }
}

export async function expectToBeOnActiveTab(page: Page) {
  await expect(page.getByRole('tab', { name: /Active/i })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  // Use a more specific selector to avoid strict mode violations
  await expect(
    page
      .locator('h3')
      .filter({ hasText: /Active Workflows/ })
      .first()
  ).toBeVisible();
}

export async function expectActiveWorkflowVisible(
  page: Page,
  workflowId?: string
) {
  // Use a more specific selector to avoid strict mode violations
  await expect(
    page
      .locator('h3')
      .filter({ hasText: /Active Workflows/ })
      .first()
  ).toBeVisible();

  if (workflowId) {
    await expect(page.getByText(new RegExp(workflowId, 'i'))).toBeVisible();
  }

  // Should show at least one workflow card - look for Card components
  await expect(
    page.locator('[class*="card"], [data-testid="workflow-card"]').first()
  ).toBeVisible();
}

export async function expectWorkflowProgress(page: Page, status?: string) {
  if (status) {
    // Convert raw status (e.g. EXTRACTING_TEXT) to display-friendly string
    const displayStatus = status.includes('_')
      ? status.replace(/_/g, ' ')
      : status;

    // Only assert the first matching status element to avoid strict mode violations
    await expect(
      page.getByText(new RegExp(displayStatus, 'i')).first()
    ).toBeVisible();
  }

  // Should show progress bar - look for Progress component
  await expect(
    page.locator('[class*="progress"], [role="progressbar"]').first()
  ).toBeVisible();
}

export async function expectDownloadButtonsVisible(
  page: Page,
  fileTypes: ('formatted' | 'translated' | 'audio')[]
) {
  for (const fileType of fileTypes) {
    const buttonText = DOWNLOAD_BUTTON_TEXT[fileType];
    await expect(
      page.getByRole('button', { name: new RegExp(buttonText, 'i') })
    ).toBeVisible();
  }
}

export async function clickDownloadButton(
  page: Page,
  fileType: OutputFileType
) {
  const buttonText = DOWNLOAD_BUTTON_TEXT[fileType];
  const downloadButton = page.getByRole('button', {
    name: new RegExp(buttonText, 'i'),
  });
  await downloadButton.click();
}

export async function expectDownloadSuccess(
  page: Page,
  fileType: OutputFileType,
  timeout: number = TEST_TIMEOUTS.DOWNLOAD
) {
  // Set up download event listener
  const downloadPromise = page.waitForEvent('download', { timeout });

  // Wait for and verify the download
  try {
    const download = await downloadPromise;

    // Verify the download object exists and has a filename
    const filename = download.suggestedFilename();
    expect(filename).toBeTruthy();

    // Verify the filename contains the expected file type
    const extensions = EXPECTED_FILE_EXTENSIONS[fileType];
    const hasValidExtension = extensions.some((ext) =>
      filename.toLowerCase().includes(ext)
    );
    expect(hasValidExtension).toBe(true);

    const hasValidName = filename.toLowerCase().includes(fileType);
    expect(hasValidName).toBe(true);

    console.log(`✅ Download success for ${fileType} verified: ${filename}`);
    return download;
  } catch (error) {
    throw new Error(`Failed to detect download for ${fileType}: ${error}`);
  }
}

export async function clickDownloadButtonAndExpectSuccess(
  page: Page,
  fileType: OutputFileType
) {
  // Set up download event listener BEFORE clicking
  const downloadPromise = expectDownloadSuccess(page, fileType);

  // Click the download button
  await clickDownloadButton(page, fileType);

  // Wait for download success
  return await downloadPromise;
}

export async function expectWorkflowInHistory(page: Page, workflowId?: string) {
  if (workflowId) {
    await expect(page.getByText(new RegExp(workflowId, 'i'))).toBeVisible();
  }

  // Should show at least one completed workflow - look for Card components in history
  await expect(
    page.locator('[class*="card"], [data-testid="completed-workflow"]').first()
  ).toBeVisible();
}

export async function expectEmptyActiveWorkflows(page: Page) {
  await expect(page.getByText(/No active workflows/i)).toBeVisible();
  await expect(page.getByText(/Start a new workflow/i)).toBeVisible();
}

export async function expectEmptyWorkflowHistory(page: Page) {
  await expect(page.getByText(/No completed workflows/i)).toBeVisible();
  await expect(
    page.getByText(/Completed workflows will appear here/i)
  ).toBeVisible();
}

export async function expectWorkflowError(page: Page, errorMessage?: string) {
  await expect(page.getByText(/Failed to start workflow/i)).toBeVisible();

  if (errorMessage) {
    await expect(page.getByText(new RegExp(errorMessage, 'i'))).toBeVisible();
  }
}

export async function expectFileUploadError(page: Page, errorMessage: string) {
  await expect(page.getByText(new RegExp(errorMessage, 'i'))).toBeVisible();
}

export async function expectWorkflowCardStatus(page: Page, status: string) {
  await expect(page.getByText(new RegExp(status, 'i'))).toBeVisible();
}

export async function expectWorkflowParameters(
  page: Page,
  params: {
    translation?: boolean;
    speech?: boolean;
    language?: string;
  }
) {
  if (params.translation) {
    await expect(page.getByText(/Translation/i)).toBeVisible();
  }

  if (params.speech) {
    await expect(page.getByText(/Speech/i)).toBeVisible();
  }

  if (params.language) {
    await expect(
      page.getByText(new RegExp(params.language, 'i'))
    ).toBeVisible();
  }
}

export async function waitForWorkflowProgress(
  page: Page,
  targetStatus: string,
  timeout: number = 10000
) {
  await expect(page.getByText(new RegExp(targetStatus, 'i'))).toBeVisible({
    timeout,
  });
}

export async function simulateWorkflowProgress(
  page: Page,
  steps: string[],
  intervalMs: number = 1000
) {
  for (const step of steps) {
    await page.waitForTimeout(intervalMs);
    // This would be used with setupWorkflowProgressMock
    await page.reload();
    await expectWorkflowCardStatus(page, step);
  }
}

export async function refreshWorkflowList(page: Page) {
  const refreshButton = page.getByRole('button', { name: /Refresh/i });
  if (await refreshButton.isVisible()) {
    await refreshButton.click();
  } else {
    await page.reload();
  }
  await page.waitForLoadState('networkidle');
}

export async function expectValidationError(page: Page, errorMessage: string) {
  const errorText = page.getByText(new RegExp(errorMessage, 'i'));
  await expect(errorText).toBeVisible();
}

export async function expectStartButtonDisabled(page: Page) {
  const startButton = page.getByRole('button', { name: /Start Workflow/i });
  await expect(startButton).toBeDisabled();
}
