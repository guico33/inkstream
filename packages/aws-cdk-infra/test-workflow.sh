#!/bin/bash
# Script to run the workflow test

# Get the API Gateway URL from CDK outputs
echo "Getting API Gateway URL from CDK outputs..."
API_URL=$(aws cloudformation describe-stacks --stack-name Dev-InkstreamStack --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue" --output text --profile dev)

if [ -z "$API_URL" ]; then
  echo "Failed to get API Gateway URL from CloudFormation outputs."
  echo "Please set the API_GATEWAY_URL environment variable manually."
  exit 1
fi

echo "API Gateway URL: $API_URL"

# Set the environment variable for the test script
export API_GATEWAY_URL=$API_URL
export AWS_PROFILE=dev

# Check if a sample PDF exists, otherwise create a simple one
if [ ! -f "./test-files/sample.pdf" ]; then
  echo "Creating a sample PDF file..."
  
  # Try to create a simple PDF using different methods
  if command -v convert &> /dev/null; then
    convert -size 612x792 canvas:white -font Arial -pointsize 24 \
      -draw "text 50,100 'This is a sample PDF file for Inkstream workflow testing'" \
      ./test-files/sample.pdf
  elif command -v libreoffice &> /dev/null; then
    echo "This is a sample PDF file for Inkstream workflow testing." > ./test-files/sample.txt
    libreoffice --headless --convert-to pdf ./test-files/sample.txt --outdir ./test-files/
    mv ./test-files/sample.pdf ./test-files/sample.pdf
    rm ./test-files/sample.txt
  else
    echo "Please create a sample PDF file at ./test-files/sample.pdf"
    exit 1
  fi
fi

# Run the TypeScript file with ts-node
echo "Running the workflow test..."
npx ts-node src/test-workflow.ts
