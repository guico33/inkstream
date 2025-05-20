# test-workflow/README.md

This folder contains all files related to the automated workflow integration test for InkStream.

- `create-or-reset-test-user.ts`: Utility to delete and re-create the Cognito test user (using .env.test config).
- `test-workflow.ts`: Main entry for the workflow test. Ensures the test user exists before running the workflow.
- `test-workflow.sh`: Shell script to run the full workflow test (user setup + workflow test) in one command.

**Usage:**

1. Place your `.env.test` file in the root of `aws-cdk-infra`.
2. Run the workflow test:

   ```zsh
   ./test-workflow/test-workflow.sh
   ```

This will:

- Delete and re-create the test user in Cognito
- Run the workflow test (edit `test-workflow.ts` to add your actual test logic)

You can also run the user setup directly:

   ```zsh
   npx ts-node ./test-workflow/create-or-reset-test-user.ts
   ```
