#!/bin/zsh
# test-workflow.sh - Run the full workflow test, including user setup
set -e

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-${(%):-%N}}")" &> /dev/null && pwd)
cd "$SCRIPT_DIR/.."

# Load env vars
if [ -f .env.test ]; then
  export $(grep -v '^#' .env.test | xargs)
fi

# Create/reset test user
npx ts-node ./test-workflow/create-or-reset-test-user.ts

# Run the workflow test
npx ts-node ./test-workflow/test-workflow.ts
