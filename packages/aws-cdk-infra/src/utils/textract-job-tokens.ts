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
import { DeleteItemCommand } from 'dynamodb-toolbox';

export interface TextractJobTokenItem {
  jobId: string;
  taskToken: string;
  workflowId?: string;
  userId?: string;
  s3Input?: { bucket: string; key: string };
  expirationTime: string;
}

export function getJobTokenTableAndEntity(
  tableName: string,
  documentClient?: DynamoDBDocumentClient
) {
  const client =
    documentClient || DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const table = new Table({
    name: tableName,
    partitionKey: { name: 'jobId', type: 'string' },
    documentClient: client,
  });
  const entity = new Entity({
    name: 'JOBTOKEN',
    table,
    schema: item({
      jobId: string().key(),
      taskToken: string(),
      workflowId: string().optional(),
      userId: string().optional(),
      s3Input: map({
        bucket: string(),
        key: string(),
      }).optional(),
      expirationTime: string(),
    }),
  });
  return { table, entity };
}

export async function putJobToken(
  tableName: string,
  record: TextractJobTokenItem,
  documentClient?: DynamoDBDocumentClient
) {
  const { entity } = getJobTokenTableAndEntity(tableName, documentClient);
  await entity.build(PutItemCommand).item(record).send();
}

export async function getJobToken(
  tableName: string,
  jobId: string,
  documentClient?: DynamoDBDocumentClient
): Promise<TextractJobTokenItem | undefined> {
  const { entity } = getJobTokenTableAndEntity(tableName, documentClient);
  const { Item } = await entity.build(GetItemCommand).key({ jobId }).send();
  return Item;
}

export async function deleteJobToken(
  tableName: string,
  jobId: string,
  documentClient?: DynamoDBDocumentClient
) {
  const { entity } = getJobTokenTableAndEntity(tableName, documentClient);
  await entity.build(DeleteItemCommand).key({ jobId }).send();
}
