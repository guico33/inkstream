import { APIGatewayProxyEvent } from 'aws-lambda';
import { z } from 'zod';
import { ExternalServiceError, ValidationError } from '../../../errors';
import { getWorkflow } from '../../../utils/user-workflows-db-utils';

// Zod schema for path parameters validation
const PathParametersSchema = z.object({
  workflowId: z
    .string({ required_error: 'workflowId is required' })
    .min(1, 'workflowId cannot be empty'),
});

/**
 * Extracts workflowId from path parameters
 */
export function extractWorkflowId(event: APIGatewayProxyEvent): string {
  if (!event.pathParameters || !('workflowId' in event.pathParameters)) {
    throw new ValidationError('workflowId is required as path parameter');
  }

  try {
    const { workflowId } = PathParametersSchema.parse(event.pathParameters);
    return workflowId;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(
        (err) => `${err.path.join('.')}: ${err.message}`
      );
      throw new ValidationError(
        `Invalid path parameters: ${errorMessages.join(', ')}`
      );
    }
    throw new ValidationError('Invalid path parameters');
  }
}

/**
 * Retrieves workflow record from DynamoDB
 */
export async function getWorkflowFromDatabase(
  userWorkflowsTable: string,
  userId: string,
  workflowId: string
) {
  try {
    return await getWorkflow(userWorkflowsTable, userId, workflowId);
  } catch (error) {
    throw new ExternalServiceError(
      'Failed to retrieve workflow from DynamoDB',
      'DynamoDB',
      error
    );
  }
}
