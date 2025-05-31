import { ValidationError } from '../errors';

/**
 * Extracts and validates user ID from JWT claims
 * @param event - The API Gateway event or Step Functions event
 */
export function extractUserId(event: any): string {
  const userId = event.requestContext?.authorizer?.jwt?.claims?.sub;

  if (!userId || typeof userId !== 'string' || userId.length === 0) {
    throw new ValidationError('Invalid or missing userId in JWT claims');
  }

  return userId;
}
