# Frontend Deployment Package

This package handles the deployment of the Inkstream frontend application content to AWS S3 and CloudFront invalidation.

## Overview

This package is separate from the infrastructure deployment (`aws-cdk-infra`) and focuses solely on:
1. Fetching backend configuration from deployed infrastructure stacks
2. Building the frontend application with production environment variables  
3. Deploying the built frontend to the existing S3 bucket
4. Invalidating the CloudFront cache

## Architecture

```
Infrastructure (aws-cdk-infra)    Frontend Content (frontend-deployment)
├── S3 Bucket                 →  ├── Build frontend app
├── CloudFront Distribution   →  ├── Deploy to S3 bucket  
└── Route53 DNS Records       →  └── Invalidate CloudFront cache
```

## Prerequisites

1. **Infrastructure deployed**: Both backend and frontend infrastructure stacks must be deployed
2. **AWS CLI configured**: With appropriate profiles for dev/prod environments  
3. **Frontend buildable**: The `apps/frontend` must build successfully

## Usage

### One-Command Deployment

```bash
# Deploy to dev environment
npm run deploy:dev

# Deploy to prod environment  
npm run deploy:prod
```

### What the deployment script does:

1. **Fetches backend outputs** from CloudFormation:
   - API Gateway URL
   - Cognito User Pool IDs
   - Storage bucket name

2. **Fetches frontend infrastructure outputs**:
   - S3 bucket name for static hosting
   - CloudFront distribution ID

3. **Generates `.env.production`** with fetched values:
   ```bash
   VITE_API_URL=https://api.inkstream.cloud
   VITE_USER_POOL_ID=eu-west-3_abc123
   VITE_USER_POOL_CLIENT_ID=abc123def456
   # ... etc
   ```

4. **Builds frontend** with production configuration:
   ```bash
   cd apps/frontend
   npm ci && npm run build
   ```

5. **Deploys with CDK**:
   - Uses `BucketDeployment` to sync `dist/` to S3
   - Automatically invalidates CloudFront cache
   - Provides deployment status and timestamps

## Manual Steps (for debugging)

If you need to run steps individually:

```bash
# 1. Install dependencies
npm ci

# 2. Set environment variables (normally done by script)
export FRONTEND_BUCKET_NAME="dev-inkstream-static-website"
export CLOUDFRONT_DISTRIBUTION_ID="E1ABC23DEF456G"

# 3. Deploy only the CDK stack
npm run cdk:deploy:dev

# 4. Check what would be deployed
npm run cdk:diff:dev
```

## Environment Variables

The deployment script automatically sets these from infrastructure stack outputs:

- `FRONTEND_BUCKET_NAME` - S3 bucket for static hosting
- `CLOUDFRONT_DISTRIBUTION_ID` - CloudFront distribution for cache invalidation

## Outputs

After deployment, you'll see:
- ✅ **Deployment status** 
- 🌐 **Website URL** (custom domain for prod, CloudFront domain for dev)
- 📊 **Deployment timestamp**
- 🪣 **S3 bucket used**
- ☁️ **CloudFront distribution invalidated**

## Troubleshooting

**Backend outputs not found:**
- Ensure backend stack is deployed: `npm run cdk:deploy:backend:dev`
- Check AWS profile is correct for the environment

**Frontend build fails:**
- Check `apps/frontend` builds locally: `cd apps/frontend && npm run build`
- Verify all dependencies are installed

**CDK deployment fails:**
- Check AWS credentials: `aws sts get-caller-identity --profile dev`
- Ensure frontend infrastructure is deployed: `npm run cdk:deploy:frontend:dev`

## Integration with GitHub Actions

This package is designed to work seamlessly with GitHub Actions:

```yaml
- name: Deploy Frontend Content
  run: |
    cd packages/frontend-deployment
    npm run deploy:prod
```

The same script that works locally will work in CI/CD environments.