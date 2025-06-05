import { Page, expect } from '@playwright/test';

export async function navigateToDashboard(page: Page) {
  const timeout = process.env.CI ? 90000 : 60000; // Extended timeout for CI
  await page.goto('/dashboard', { timeout });
  await page.waitForLoadState('networkidle', { timeout });
}

export async function selectNewWorkflowTab(page: Page) {
  const timeout = process.env.CI ? 30000 : 20000;
  await page.getByRole('tab', { name: /New Workflow/i }).click();
  await expect(page.getByText(/Start New Workflow/i)).toBeVisible({ timeout });
}

export async function selectActiveWorkflowsTab(page: Page) {
  const timeout = process.env.CI ? 45000 : 30000;
  await page.getByRole('tab', { name: /Active/i }).click();
  await page.waitForLoadState('networkidle', { timeout });
}

export async function selectWorkflowHistoryTab(page: Page) {
  const timeout = process.env.CI ? 45000 : 30000;
  await page.getByRole('tab', { name: /History/i }).click();
  await page.waitForLoadState('networkidle', { timeout });
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
  const timeout = process.env.CI ? 30000 : 15000; // 30 seconds on CI, 15 seconds locally

  // Wait for the actual toast content to appear - Sonner renders toasts with data-title
  const toastTitleSelector =
    '[data-sonner-toaster] li[data-sonner-toast] div[data-title]';

  try {
    // First, wait for any toast title to appear
    await page.waitForSelector(toastTitleSelector, { timeout: 10000 });

    // Then look for the specific success message within the toast title
    await expect(
      page
        .locator(toastTitleSelector)
        .filter({ hasText: /Workflow started successfully!/i })
    ).toBeVisible({ timeout });
  } catch {
    // Fallback: try to find the text anywhere on the page
    console.warn('Toast title method failed, trying fallback approach');
    await expect(page.getByText(/Workflow started successfully!/i)).toBeVisible(
      {
        timeout,
      }
    );
  }

  await expect(page.getByRole('tab', { name: /Active/i })).toHaveAttribute(
    'aria-selected',
    'true'
  );
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
    let buttonText: string;
    switch (fileType) {
      case 'formatted':
        buttonText = 'Formatted Text';
        break;
      case 'translated':
        buttonText = 'Translated Text';
        break;
      case 'audio':
        buttonText = 'Audio File';
        break;
    }

    await expect(
      page.getByRole('button', { name: new RegExp(buttonText, 'i') })
    ).toBeVisible();
  }
}

export async function clickDownloadButton(
  page: Page,
  fileType: 'formatted' | 'translated' | 'audio'
) {
  let buttonText: string;
  switch (fileType) {
    case 'formatted':
      buttonText = 'Formatted Text';
      break;
    case 'translated':
      buttonText = 'Translated Text';
      break;
    case 'audio':
      buttonText = 'Audio File';
      break;
  }

  const downloadButton = page.getByRole('button', {
    name: new RegExp(buttonText, 'i'),
  });
  await downloadButton.click();
}

export async function expectDownloadSuccess(
  page: Page,
  fileType: 'formatted' | 'translated' | 'audio'
) {
  const timeout = process.env.CI ? 20000 : 10000; // 20 seconds on CI, 10 seconds locally

  // Wait for the actual toast content to appear - Sonner renders toasts with data-title
  const toastTitleSelector =
    '[data-sonner-toaster] li[data-sonner-toast] div[data-title]';

  try {
    // First, wait for any toast title to appear
    await page.waitForSelector(toastTitleSelector, { timeout: 10000 });

    // Then look for the specific download success message within the toast title
    await expect(
      page
        .locator(toastTitleSelector)
        .filter({
          hasText: new RegExp(
            `File downloaded successfully: .*${fileType}.*`,
            'i'
          ),
        })
    ).toBeVisible({ timeout });
  } catch {
    // Fallback: try to find the text anywhere on the page
    console.warn('Toast title method failed, trying fallback approach');
    await expect(
      page.getByText(
        new RegExp(`File downloaded successfully: .*${fileType}.*`, 'i')
      )
    ).toBeVisible({ timeout });
  }
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
