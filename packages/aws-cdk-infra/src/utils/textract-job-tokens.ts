// /packages/aws-cdk-infra/src/utils/textract-job-tokens.ts
// DynamoDB Toolbox utilities for the Textract Job Tokens table

import { Table } from 'dynamodb-toolbox/table';
import { Entity } from 'dynamodb-toolbox/entity';
import { item } from 'dynamodb-toolbox/schema/item';
import { string } from 'dynamodb-toolbox/schema/string';
import { map } from 'dynamodb-toolbox/schema/map';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { PutItemCommand } from 'dynamodb-toolbox/entity/actions/put';
import { GetItemCommand } from 'dynamodb-toolbox/entity/actions/get';

export interface TextractJobToken {
  JobId: string;
  TaskToken: string;
  FileType?: string;
  WorkflowId?: string;
  UserId?: string;
  S3Input?: { bucket: string; key: string };
  ExpirationTime: string;
}

export function getJobTokenTableAndEntity(
  tableName: string,
  documentClient?: DynamoDBDocumentClient
) {
  const client =
    documentClient || DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const table = new Table({
    name: tableName,
    partitionKey: { name: 'JobId', type: 'string' },
    documentClient: client,
  });
  const entity = new Entity({
    name: 'JOBTOKEN',
    table,
    schema: item({
      JobId: string().key(),
      TaskToken: string(),
      FileType: string().optional(),
      WorkflowId: string().optional(),
      UserId: string().optional(),
      S3Input: map({
        bucket: string(),
        key: string(),
      }).optional(),
      ExpirationTime: string(),
    }),
  });
  return { table, entity };
}

export async function putJobToken(
  tableName: string,
  record: TextractJobToken,
  documentClient?: DynamoDBDocumentClient
) {
  const { entity } = getJobTokenTableAndEntity(tableName, documentClient);
  await entity.build(PutItemCommand).item(record).send();
}

export async function getJobToken(
  tableName: string,
  jobId: string,
  documentClient?: DynamoDBDocumentClient
): Promise<TextractJobToken | undefined> {
  const { entity } = getJobTokenTableAndEntity(tableName, documentClient);
  const { Item } = await entity
    .build(GetItemCommand)
    .key({ JobId: jobId })
    .send();
  return Item;
}
