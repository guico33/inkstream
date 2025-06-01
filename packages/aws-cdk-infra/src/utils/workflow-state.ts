// --- DynamoDB Toolbox Workflow State Utilities ---

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { WorkflowRecord, WorkflowStatus } from '@inkstream/shared';
import { anyOf, boolean, list } from 'dynamodb-toolbox';
import { Entity } from 'dynamodb-toolbox/entity';
import { GetItemCommand } from 'dynamodb-toolbox/entity/actions/get';
import { PutItemCommand } from 'dynamodb-toolbox/entity/actions/put';
import {
  $append,
  UpdateItemCommand,
} from 'dynamodb-toolbox/entity/actions/update';
import { item } from 'dynamodb-toolbox/schema/item';
import { map } from 'dynamodb-toolbox/schema/map';
import { string } from 'dynamodb-toolbox/schema/string';
import { Table } from 'dynamodb-toolbox/table';
import { QueryCommand } from 'dynamodb-toolbox/table/actions/query';

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const statusSchema = anyOf(
  string().enum('STARTING'),
  string().enum('EXTRACTING_TEXT'),
  string().enum('FORMATTING_TEXT'),
  string().enum('TRANSLATING'),
  string().enum('CONVERTING_TO_SPEECH'),
  string().enum('TEXT_FORMATTING_COMPLETE'),
  string().enum('TRANSLATION_COMPLETE'),
  string().enum('SUCCEEDED'),
  string().enum('TIMED_OUT'),
  string().enum('FAILED')
).required();

const statusHistoryEntrySchema = map({
  status: statusSchema,
  timestamp: string().required(),
  error: string().optional(),
});

const workflowStatusHistorySchema = list(statusHistoryEntrySchema);

const workflowItemSchema = item({
  userId: string().key(),
  workflowId: string().key(),
  status: statusSchema,
  statusHistory: workflowStatusHistorySchema,
  parameters: map({
    doTranslate: boolean().optional(),
    doSpeech: boolean().optional(),
    targetLanguage: string().optional(),
  }).optional(),
  s3Paths: map({
    originalFile: string().required(),
    formattedText: string().optional(),
    translatedText: string().optional(),
    audioFile: string().optional(),
  }).optional(),
  error: string().optional(),
});

/**
 * Returns a strongly-typed Workflow Entity for the given table name.
 */
const getWorkflowTableAndEntity = (tableName: string) => {
  const workflowTable = new Table({
    name: tableName,
    partitionKey: { name: 'userId', type: 'string' },
    sortKey: { name: 'workflowId', type: 'string' },
    indexes: {
      CreatedAtIndex: {
        type: 'global',
        partitionKey: { name: 'userId', type: 'string' },
        sortKey: { name: 'createdAt', type: 'string' },
      },
      UpdatedAtIndex: {
        type: 'global',
        partitionKey: { name: 'userId', type: 'string' },
        sortKey: { name: 'updatedAt', type: 'string' },
      },
    },
    documentClient,
  });

  const workflowEntity = new Entity({
    name: 'WORKFLOW',
    table: workflowTable,
    schema: workflowItemSchema,
    timestamps: {
      created: {
        name: 'createdAt',
        savedAs: 'createdAt',
      },
      modified: {
        name: 'updatedAt',
        savedAs: 'updatedAt',
      },
    },
  });
  return { workflowEntity, workflowTable };
};

/**
 * Create a new workflow record in DynamoDB.
 */
export async function createWorkflow(
  tableName: string,
  record: WorkflowRecord
): Promise<void> {
  const { workflowEntity } = getWorkflowTableAndEntity(tableName);
  await workflowEntity.build(PutItemCommand).item(record).send();
}

/**
 * Update the status (and optionally other fields) of a workflow record.
 */
export async function updateWorkflowStatus(
  tableName: string,
  userId: string,
  workflowId: string,
  newStatus: WorkflowStatus,
  updates?: Partial<WorkflowRecord>
): Promise<void> {
  const { workflowEntity } = getWorkflowTableAndEntity(tableName);
  const now = new Date().toISOString();
  await workflowEntity
    .build(UpdateItemCommand)
    .item({
      userId,
      workflowId,
      status: newStatus,
      // updatedAt is automatically managed by DynamoDB-Toolbox
      statusHistory: $append([
        {
          status: newStatus,
          timestamp: now,
          error: updates?.error,
          ...(updates || {}),
        },
      ]),
      ...(updates || {}),
    })
    .send();
}

/**
 * Get a workflow record by userId and workflowId.
 */
export async function getWorkflow(
  tableName: string,
  userId: string,
  workflowId: string
): Promise<WorkflowRecord | undefined> {
  const { workflowEntity } = getWorkflowTableAndEntity(tableName);
  const { Item } = await workflowEntity
    .build(GetItemCommand)
    .key({ userId, workflowId })
    .send();
  return Item;
}

/**
 * List all workflows for a user, sorted by most recent.
 */
export async function listWorkflows(
  tableName: string,
  userId: string
): Promise<WorkflowRecord[] | undefined> {
  const { workflowTable, workflowEntity } =
    getWorkflowTableAndEntity(tableName);
  const { Items } = await workflowTable
    .build(QueryCommand)
    .entities(workflowEntity)
    .query({ partition: userId })
    .options({ reverse: true })
    .send();
  return Items;
}

/**
 * List workflows for a user, sorted by creation date.
 * This uses the createdAtIndex to ensure efficient querying.
 */

export async function listWorkflowsByCreatedAt(
  tableName: string,
  userId: string
): Promise<WorkflowRecord[] | undefined> {
  const { workflowTable, workflowEntity } =
    getWorkflowTableAndEntity(tableName);
  const { Items } = await workflowTable
    .build(QueryCommand)
    .entities(workflowEntity)
    .query({ index: 'CreatedAtIndex', partition: userId })
    .options({ maxPages: Infinity, reverse: true })
    .send();
  return Items;
}

/**
 * List workflows for a user, sorted by last modified date.
 * This uses the UpdatedAtIndex to ensure efficient querying.
 */
export async function listWorkflowsByUpdatedAt(
  tableName: string,
  userId: string
): Promise<WorkflowRecord[] | undefined> {
  const { workflowTable, workflowEntity } =
    getWorkflowTableAndEntity(tableName);
  const { Items } = await workflowTable
    .build(QueryCommand)
    .entities(workflowEntity)
    .query({ index: 'UpdatedAtIndex', partition: userId })
    .options({ maxPages: Infinity, reverse: true })
    .send();
  return Items;
}
