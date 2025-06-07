# AWS CDK Infrastructure for Inkstream

This package contains the AWS CDK infrastructure code for the Inkstream application.

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

## Deployment

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
