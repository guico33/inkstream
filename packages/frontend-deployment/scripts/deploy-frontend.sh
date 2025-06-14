#!/bin/bash

# Frontend Deployment Script
# Usage: ./deploy-frontend.sh <environment>
# Example: ./deploy-frontend.sh dev or ./deploy-frontend.sh prod

set -e  # Exit on any error

# Check if environment parameter is provided
if [ -z "$1" ]; then
    echo "❌ Error: Environment parameter required"
    echo "Usage: $0 <environment>"
    echo "Example: $0 dev or $0 prod"
    exit 1
fi

ENVIRONMENT=$1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
FRONTEND_DIR="$PROJECT_ROOT/apps/frontend"
DEPLOYMENT_DIR="$PROJECT_ROOT/packages/frontend-deployment"

# Validate environment
if [[ "$ENVIRONMENT" != "dev" && "$ENVIRONMENT" != "prod" ]]; then
    echo "❌ Error: Environment must be 'dev' or 'prod'"
    exit 1
fi

echo "🚀 Starting frontend deployment for $ENVIRONMENT environment..."

# Set AWS profile and stack names based on environment
# Use AWS profile only if we're not in CI (GitHub Actions)
if [ -n "$GITHUB_ACTIONS" ]; then
    # In CI, don't use AWS profiles
    AWS_PROFILE_FLAG=""
else
    # Locally, use AWS profiles
    if [ "$ENVIRONMENT" = "dev" ]; then
        AWS_PROFILE="dev"
        AWS_PROFILE_FLAG="--profile $AWS_PROFILE"
    elif [ "$ENVIRONMENT" = "prod" ]; then
        AWS_PROFILE="prod"
        AWS_PROFILE_FLAG="--profile $AWS_PROFILE"
    fi
fi

# Set stack names based on environment
if [ "$ENVIRONMENT" = "dev" ]; then
    BACKEND_STACK_NAME="Dev-InkstreamBackendStack"
    FRONTEND_STACK_NAME="Dev-InkstreamFrontendStack"
    DEPLOYMENT_STACK_NAME="Dev-InkstreamFrontendDeployment"
elif [ "$ENVIRONMENT" = "prod" ]; then
    BACKEND_STACK_NAME="Prod-InkstreamBackendStack"
    FRONTEND_STACK_NAME="Prod-InkstreamFrontendStack"
    DEPLOYMENT_STACK_NAME="Prod-InkstreamFrontendDeployment"
fi

echo "📊 Fetching backend stack outputs..."

# Fetch backend stack outputs
API_URL=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    $AWS_PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text 2>/dev/null || echo "")

USER_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    $AWS_PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

USER_POOL_CLIENT_ID=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    $AWS_PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`UserPoolWebClientId`].OutputValue' \
    --output text 2>/dev/null || echo "")

IDENTITY_POOL_ID=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    $AWS_PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`IdentityPoolId`].OutputValue' \
    --output text 2>/dev/null || echo "")

STORAGE_BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$BACKEND_STACK_NAME" \
    $AWS_PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`StorageBucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Fetch frontend stack outputs for bucket info
FRONTEND_BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name "$FRONTEND_STACK_NAME" \
    $AWS_PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`StaticWebsiteBucketName`].OutputValue' \
    --output text 2>/dev/null || echo "")

CLOUDFRONT_DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
    --stack-name "$FRONTEND_STACK_NAME" \
    $AWS_PROFILE_FLAG \
    --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
    --output text 2>/dev/null || echo "")

# Validate required outputs
if [ -z "$API_URL" ] || [ -z "$USER_POOL_ID" ] || [ -z "$USER_POOL_CLIENT_ID" ] || [ -z "$IDENTITY_POOL_ID" ]; then
    echo "❌ Error: Failed to fetch required backend stack outputs"
    echo "API_URL: $API_URL"
    echo "USER_POOL_ID: $USER_POOL_ID"
    echo "USER_POOL_CLIENT_ID: $USER_POOL_CLIENT_ID"
    echo "IDENTITY_POOL_ID: $IDENTITY_POOL_ID"
    echo "Make sure the backend stack is deployed and outputs are available"
    exit 1
fi

if [ -z "$FRONTEND_BUCKET_NAME" ] || [ -z "$CLOUDFRONT_DISTRIBUTION_ID" ]; then
    echo "❌ Error: Failed to fetch required frontend stack outputs"
    echo "FRONTEND_BUCKET_NAME: $FRONTEND_BUCKET_NAME"
    echo "CLOUDFRONT_DISTRIBUTION_ID: $CLOUDFRONT_DISTRIBUTION_ID"
    echo "Make sure the frontend infrastructure stack is deployed"
    exit 1
fi

echo "✅ Backend outputs fetched successfully:"
echo "  API_URL: $API_URL"
echo "  USER_POOL_ID: $USER_POOL_ID"
echo "  STORAGE_BUCKET: $STORAGE_BUCKET_NAME"

echo "✅ Frontend outputs fetched successfully:"
echo "  FRONTEND_BUCKET: $FRONTEND_BUCKET_NAME"
echo "  CLOUDFRONT_ID: $CLOUDFRONT_DISTRIBUTION_ID"

echo "📝 Generating frontend environment configuration..."

# Generate .env.production file
cat > "$FRONTEND_DIR/.env.production" << EOF
# Auto-generated by deploy-frontend.sh - DO NOT EDIT MANUALLY
VITE_API_ENDPOINT_URL=$API_URL
VITE_COGNITO_USER_POOL_ID=$USER_POOL_ID
VITE_COGNITO_CLIENT_ID=$USER_POOL_CLIENT_ID
VITE_COGNITO_IDENTITY_POOL_ID=$IDENTITY_POOL_ID
VITE_AWS_REGION=eu-west-3
VITE_S3_BUCKET=$STORAGE_BUCKET_NAME
VITE_COGNITO_DOMAIN=https://$ENVIRONMENT-inkstream.auth.eu-west-3.amazoncognito.com
EOF

echo "✅ Environment file generated: $FRONTEND_DIR/.env.production"

echo "🔨 Building shared package first..."

# Build shared package dependencies
SHARED_DIR="$PROJECT_ROOT/packages/shared"
cd "$SHARED_DIR"
npm ci
npm run build

echo "✅ Shared package built successfully"

echo "🔨 Building frontend application..."

# Build frontend
cd "$FRONTEND_DIR"
npm ci
npm run build

echo "✅ Frontend build completed"

echo "📦 Deploying frontend content with CDK..."

# Deploy with CDK
cd "$DEPLOYMENT_DIR"
npm ci

# Export environment variables for CDK
export FRONTEND_BUCKET_NAME="$FRONTEND_BUCKET_NAME"
export CLOUDFRONT_DISTRIBUTION_ID="$CLOUDFRONT_DISTRIBUTION_ID"

# Deploy the frontend content
if [ -n "$GITHUB_ACTIONS" ]; then
    # In CI, don't use AWS profiles
    npx cdk deploy "$DEPLOYMENT_STACK_NAME" \
        --context environment="$ENVIRONMENT" \
        --require-approval never
else
    # Locally, use AWS profiles
    npx cdk deploy "$DEPLOYMENT_STACK_NAME" \
        --context environment="$ENVIRONMENT" \
        --profile "$AWS_PROFILE" \
        --require-approval never
fi

echo "🎉 Frontend deployment completed successfully!"
echo "🌐 Your application should be available at:"
if [ "$ENVIRONMENT" = "prod" ]; then
    echo "   https://app.inkstream.cloud"
else
    CLOUDFRONT_DOMAIN=$(aws cloudformation describe-stacks \
        --stack-name "$FRONTEND_STACK_NAME" \
        $AWS_PROFILE_FLAG \
        --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionDomainName`].OutputValue' \
        --output text 2>/dev/null || echo "")
    if [ -n "$CLOUDFRONT_DOMAIN" ]; then
        echo "   https://$CLOUDFRONT_DOMAIN"
    fi
fi