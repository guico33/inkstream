// Environment configuration for frontend deployment

export interface DeploymentConfig {
  environment: string;
  region: string;
  frontendBucketName: string;
  cloudFrontDistributionId: string;
  stackPrefix: string;
  tags: {
    Environment: string;
    Project: string;
    Component: string;
  };
}

export function getDeploymentConfig(environment: string): DeploymentConfig {
  // Get bucket name and distribution ID from environment variables
  // These are set by the deployment script after fetching from infrastructure stacks
  const frontendBucketName = process.env.FRONTEND_BUCKET_NAME;
  const cloudFrontDistributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;

  if (!frontendBucketName || !cloudFrontDistributionId) {
    throw new Error(
      'Missing required environment variables: FRONTEND_BUCKET_NAME and CLOUDFRONT_DISTRIBUTION_ID must be set'
    );
  }

  const stackPrefix = environment === 'prod' ? 'Prod' : 'Dev';

  return {
    environment,
    region: 'eu-west-3',
    frontendBucketName,
    cloudFrontDistributionId,
    stackPrefix,
    tags: {
      Environment: environment === 'prod' ? 'Production' : 'Development',
      Project: 'Inkstream',
      Component: 'Frontend-Deployment',
    },
  };
}