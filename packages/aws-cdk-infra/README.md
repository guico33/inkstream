# AWS CDK Infrastructure for Inkstream

This package contains the AWS CDK infrastructure code for the Inkstream application, supporting both development and production environments with separate frontend and backend deployment capabilities.

## Environment Configuration

The infrastructure supports multiple AI providers for text formatting and translation. Copy `.env.example` to `.env` and configure your environment variables.

### AI Provider Configuration

Inkstream supports two AI providers:

#### 1. AWS Bedrock (Default)
Uses Anthropic Claude models via AWS Bedrock:
```bash
AI_PROVIDER=bedrock
CLAUDE_MODEL_ID=anthropic.claude-3-haiku-20240307-v1:0
```

#### 2. OpenAI
Uses OpenAI GPT models via AWS Secrets Manager:
```bash
AI_PROVIDER=openai
OPENAI_API_KEY_SECRET_ARN=arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/openai/api-key-xxxxxx
OPENAI_MODEL=gpt-4o-mini
```

**Note**: OpenAI API keys are securely stored in AWS Secrets Manager. You must manually create the secret in AWS Secrets Manager before deployment.

### Switching Between Providers

You can switch between providers by:

1. **Environment Variables**: Set `AI_PROVIDER=openai` or `AI_PROVIDER=bedrock`
2. **Fallback Support**: The system can automatically fallback between providers on failures
3. **Runtime Configuration**: No code changes required, just environment variable updates

### Available Models

**Bedrock (Claude):**
- `anthropic.claude-3-haiku-20240307-v1:0` (default, fastest)
- `anthropic.claude-3-sonnet-20240229-v1:0` (balanced)
- `anthropic.claude-3-opus-20240229-v1:0` (most capable)

**OpenAI:**
- `gpt-4o-mini` (default, cost-effective)
- `gpt-4o` (more capable)
- `gpt-3.5-turbo` (legacy, fastest)

## Architecture Overview

### Stack Structure

The infrastructure is organized into **separate CDK stacks** for independent deployment of frontend and backend components:

#### Backend Stack (`BackendStack`)
Contains all application logic and API infrastructure:
- **API Gateway**: REST API with custom domain (`api.inkstream.cloud`)
- **Authentication**: Cognito User Pool and Identity Pool with Google OAuth
- **Storage**: DynamoDB tables for user workflows and S3 bucket for file uploads
- **Compute**: Lambda functions for workflow processing
- **Orchestration**: Step Functions for workflow execution
- **Events**: EventBridge rules for workflow state changes
- **Secrets**: AWS Secrets Manager for API keys and OAuth credentials

#### Frontend Stack (`FrontendStack`) 
Contains static website hosting infrastructure:
- **Storage**: S3 bucket for static website hosting
- **CDN**: CloudFront distribution with custom domain (`app.inkstream.cloud`)
- **DNS**: Route53 A/AAAA records pointing to CloudFront
- **Security**: SSL certificate (us-east-1) and security headers
- **Cache**: Optimized caching policies for SPA routing

### Deployment Strategy

**Independent Deployments:**
- Backend changes deploy only backend infrastructure
- Frontend changes deploy only frontend application
- No build-time dependencies between stacks
- Faster deployment cycles and reduced failure risk

**Shared Configuration:**
- Environment-specific configurations in `config/environments.ts`
- Consistent resource naming and tagging across stacks
- Cross-stack outputs for frontend configuration

### Directory Structure

```
packages/aws-cdk-infra/
├── bin/
│   └── inkstream.ts              # CDK app entry point (creates both stacks)
├── src/lib/
│   ├── backend-stack.ts          # Backend infrastructure stack
│   ├── frontend-stack.ts         # Frontend infrastructure stack
│   └── constructs/               # Reusable CDK constructs
│       ├── api-gateway-construct.ts
│       ├── auth-construct.ts
│       ├── storage-construct.ts
│       ├── static-website-construct.ts
│       └── ...
├── config/
│   └── environments.ts          # Environment-specific configurations
├── .env                         # Development environment variables
├── .env.prod                    # Production environment variables
└── package.json                 # CDK deployment scripts
```

## Deployment

### Environment Support

The infrastructure supports multiple environments with separate AWS accounts:

**Development Environment:**
- AWS Account: Development account
- Domain: CloudFront default domain
- SSL: None (development only)
- Resources: Dev-prefixed resource names

**Production Environment:**
- AWS Account: Production account (426361305135)
- Domain: `app.inkstream.cloud` with custom SSL certificate
- SSL: AWS Certificate Manager (us-east-1)
- Resources: Prod-prefixed resource names

### Deployment Commands

```bash
# Backend only deployment
npm run cdk:deploy:backend:dev    # Deploy dev backend stack
npm run cdk:deploy:backend:prod   # Deploy prod backend stack

# Frontend only deployment  
npm run cdk:deploy:frontend:dev   # Deploy dev frontend stack
npm run cdk:deploy:frontend:prod  # Deploy prod frontend stack

# Full deployment (both stacks)
npm run cdk:deploy:dev           # Deploy both dev stacks (--all flag)
npm run cdk:deploy:prod          # Deploy both prod stacks (--all flag)

# Stack synthesis and diff
npm run cdk:synth:dev            # Synthesize both dev stacks
npm run cdk:diff:backend:dev     # Show backend changes for dev
npm run cdk:diff:frontend:dev    # Show frontend changes for dev
npm run cdk:diff:backend:prod    # Show backend changes for prod  
npm run cdk:diff:frontend:prod   # Show frontend changes for prod

# Stack destruction
npm run cdk:destroy:dev          # Destroy both dev stacks
npm run cdk:destroy:prod         # Destroy both prod stacks
```

### Migration from Monolithic Stack

If you have an existing `Dev-InkstreamStack` or `Prod-InkstreamStack`, you'll need to:

1. **Backup important data** (DynamoDB export, S3 bucket contents)
2. **Delete existing stack**: `npm run cdk:destroy:dev` or `npm run cdk:destroy:prod`
3. **Deploy new separate stacks**: `npm run cdk:deploy:dev` or `npm run cdk:deploy:prod`

The new architecture creates two independent stacks:
- `Dev-InkstreamBackendStack` / `Prod-InkstreamBackendStack`
- `Dev-InkstreamFrontendStack` / `Prod-InkstreamFrontendStack`

### Prerequisites

Before deployment, you must manually create the required secrets in AWS Secrets Manager:

#### Google OAuth Credentials (Required)
```bash
# Create the Google Client Secret in AWS Secrets Manager
aws secretsmanager create-secret \
  --name "inkstream/dev/google-client-secret" \
  --description "Google OAuth Client Secret for Inkstream" \
  --secret-string "your-google-client-secret-value"
```

#### OpenAI API Key (Optional, only if using OpenAI provider)
```bash
# Create the OpenAI API Key in AWS Secrets Manager
aws secretsmanager create-secret \
  --name "inkstream/dev/openai-api-key" \
  --description "OpenAI API Key for Inkstream" \
  --secret-string "sk-your-openai-api-key-here"
```

### Environment Configuration

1. Configure your environment:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

   Required environment variables:
   ```bash
   # Google OAuth (required)
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET_SECRET_ARN=arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/google-client-secret-xxxxxx
   # OpenAI (optional, only if using OpenAI provider)
   OPENAI_API_KEY_SECRET_ARN=arn:aws:secretsmanager:eu-west-3:560756474135:secret:inkstream/dev/openai/api-key-xxxxxx

   # AWS Configuration
   AWS_REGION=us-west-3
   AI_PROVIDER=bedrock  # or 'openai'
   ```

### Deploy Infrastructure

2. Deploy the infrastructure:
   ```bash
   npm run cdk:deploy:dev
   ```

## Testing

Run the integration tests:
```bash
npm run test:workflow
```

For more details on testing, see `test-workflow/README.md`.

## Lambda Functions

The infrastructure deploys several Lambda functions:

- **format-text**: Formats extracted text using AI providers
- **translate-text**: Translates text using AI providers  
- **convert-to-speech**: Converts text to speech using Amazon Polly
- **start-textract-job**: Initiates text extraction jobs
- **process-textract-s3-event**: Processes Textract completion events

All AI-related Lambda functions support both Bedrock and OpenAI providers based on the `AI_PROVIDER` environment variable.
