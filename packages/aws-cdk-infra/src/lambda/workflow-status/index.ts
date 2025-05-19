import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SFNClient, DescribeExecutionCommand } from '@aws-sdk/client-sfn';

const sfnClient = new SFNClient({});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Get executionArn from query string or JSON body
    let executionArn = event.queryStringParameters?.executionArn;
    if (!executionArn && event.body) {
      try {
        const body = JSON.parse(event.body);
        executionArn = body.executionArn;
      } catch {
        // ignore JSON parse error
      }
    }
    if (!executionArn) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Missing executionArn parameter.' }),
      };
    }

    // Call Step Functions to get execution status
    const describeCmd = new DescribeExecutionCommand({ executionArn });
    const result = await sfnClient.send(describeCmd);

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: result.status,
        output: result.output ? JSON.parse(result.output) : undefined,
        startDate: result.startDate,
        stopDate: result.stopDate,
        input: result.input ? JSON.parse(result.input) : undefined,
        executionArn: result.executionArn,
      }),
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Failed to get workflow status',
        error: errorMessage,
      }),
    };
  }
};
