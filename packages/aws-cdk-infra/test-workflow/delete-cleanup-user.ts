// packages/aws-cdk-infra/test-workflow/delete-cleanup-user.ts
import { deleteUserIfExists } from './create-or-reset-test-user';

async function main() {
  console.log('Attempting to delete test user as part of workflow cleanup...');
  try {
    await deleteUserIfExists();
    console.log(
      'Test user deletion attempt completed successfully during cleanup.'
    );
  } catch (error) {
    // Log the error but don't cause the cleanup step to fail the entire workflow,
    // as the primary tests might have already passed or failed.
    console.error('Error during test user deletion in cleanup:', error);
  }
}

main().catch((error) => {
  // Catch any unhandled promise rejection from main, though main itself catches.
  console.error('Unhandled error in delete-cleanup-user.ts:', error);
});
