// --- DynamoDB Toolbox Workflow State Utilities ---

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type {
  WorkflowRecord,
  WorkflowStatus,
  WorkflowStatusCategory,
} from '@inkstream/shared';
import {
  getStatusCategory,
  workflowStatusCategories,
  workflowStatuses,
} from '@inkstream/shared';
import { boolean, list } from 'dynamodb-toolbox';
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

const statusSchema = string()
  .enum(...workflowStatuses)
  .required();

const statusCategorySchema = string()
  .enum(...workflowStatusCategories)
  .required();

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
  statusCategory: statusCategorySchema,
  statusCategoryCreatedAt: string().required(),
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
      StatusIndex: {
        type: 'global',
        partitionKey: { name: 'userId', type: 'string' },
        sortKey: { name: 'status', type: 'string' },
      },
      StatusCategoryCreatedAtIndex: {
        type: 'global',
        partitionKey: { name: 'userId', type: 'string' },
        sortKey: { name: 'statusCategoryCreatedAt', type: 'string' },
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
): Promise<WorkflowRecord | undefined> {
  const { workflowEntity } = getWorkflowTableAndEntity(tableName);
  const statusCategoryCreatedAt = `${record.statusCategory}#${
    record.createdAt ?? new Date().toISOString()
  }`;
  const { ToolboxItem } = await workflowEntity
    .build(PutItemCommand)
    .item({
      ...record,
      statusCategoryCreatedAt,
    })
    .send();
  return ToolboxItem;
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
  const statusCategory = getStatusCategory(newStatus);
  const statusCategoryCreatedAt = `${statusCategory}#${now}`;
  await workflowEntity
    .build(UpdateItemCommand)
    .item({
      userId,
      workflowId,
      status: newStatus,
      statusCategory,
      statusCategoryCreatedAt,
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
 * List workflows for a user with sorting options.
 * Supports pagination and sorting by createdAt or updatedAt.
 */
export async function listWorkflowsWithSorting(
  tableName: string,
  userId: string,
  options?: {
    limit?: number;
    nextToken?: string;
    sortBy?: 'createdAt' | 'updatedAt';
  }
): Promise<{
  items: WorkflowRecord[];
  nextToken?: string;
}> {
  const { workflowTable, workflowEntity } =
    getWorkflowTableAndEntity(tableName);

  const queryOptions: any = { reverse: true };

  if (options?.limit) {
    queryOptions.limit = options.limit;
  } else {
    // If no limit specified, get all items (backward compatibility)
    queryOptions.maxPages = Infinity;
  }

  if (options?.nextToken) {
    queryOptions.exclusiveStartKey = JSON.parse(
      Buffer.from(options.nextToken, 'base64').toString('utf-8')
    );
  }

  // Use the appropriate sorting index
  const indexName =
    options?.sortBy === 'createdAt'
      ? ('CreatedAtIndex' as const)
      : ('UpdatedAtIndex' as const);

  const queryBuilder = workflowTable
    .build(QueryCommand)
    .entities(workflowEntity)
    .query({
      index: indexName,
      partition: userId,
    });

  const { Items, LastEvaluatedKey } = await queryBuilder
    .options(queryOptions)
    .send();

  const items = Items || [];

  let nextToken: string | undefined;
  // Only return nextToken if we have a limit, got the full limit of items, and have LastEvaluatedKey
  if (LastEvaluatedKey && options?.limit && items.length === options.limit) {
    nextToken = Buffer.from(JSON.stringify(LastEvaluatedKey)).toString(
      'base64'
    );
  }

  return {
    items,
    nextToken,
  };
}

/**
 * List workflows for a user filtered by status.
 * Supports pagination but does not support custom sorting (sorted by status).
 */
export async function listWorkflowsByStatus(
  tableName: string,
  userId: string,
  status: WorkflowStatus,
  options?: {
    limit?: number;
    nextToken?: string;
  }
): Promise<{
  items: WorkflowRecord[];
  nextToken?: string;
}> {
  const { workflowTable, workflowEntity } =
    getWorkflowTableAndEntity(tableName);

  const queryOptions: any = { reverse: true };

  if (options?.limit) {
    queryOptions.limit = options.limit;
  } else {
    // If no limit specified, get all items (backward compatibility)
    queryOptions.maxPages = Infinity;
  }

  if (options?.nextToken) {
    queryOptions.exclusiveStartKey = JSON.parse(
      Buffer.from(options.nextToken, 'base64').toString('utf-8')
    );
  }

  // Use StatusIndex for efficient status filtering
  const queryBuilder = workflowTable
    .build(QueryCommand)
    .entities(workflowEntity)
    .query({
      index: 'StatusIndex',
      partition: userId,
      range: { eq: status },
    });

  const { Items, LastEvaluatedKey } = await queryBuilder
    .options(queryOptions)
    .send();

  const items = Items || [];

  let nextToken: string | undefined;
  // Only return nextToken if we have a limit, got the full limit of items, and have LastEvaluatedKey
  if (LastEvaluatedKey && options?.limit && items.length === options.limit) {
    nextToken = Buffer.from(JSON.stringify(LastEvaluatedKey)).toString(
      'base64'
    );
  }

  return {
    items,
    nextToken,
  };
}

/**
 * List workflows for a user filtered by status category (active, completed, failed), sorted by createdAt (desc).
 * Uses the StatusCategoryCreatedAtIndex for efficient queries.
 */
export async function listWorkflowsByStatusCategory(
  tableName: string,
  userId: string,
  statusCategory: WorkflowStatusCategory,
  options?: {
    limit?: number;
    nextToken?: string;
  }
): Promise<{
  items: WorkflowRecord[];
  nextToken?: string;
}> {
  const { workflowTable, workflowEntity } =
    getWorkflowTableAndEntity(tableName);
  const queryOptions: any = { reverse: true };
  if (options?.limit) {
    queryOptions.limit = options.limit;
  } else {
    queryOptions.maxPages = Infinity;
  }
  if (options?.nextToken) {
    queryOptions.exclusiveStartKey = JSON.parse(
      Buffer.from(options.nextToken, 'base64').toString('utf-8')
    );
  }
  const queryBuilder = workflowTable
    .build(QueryCommand)
    .entities(workflowEntity)
    .query({
      index: 'StatusCategoryCreatedAtIndex',
      partition: userId,
      range: { beginsWith: `${statusCategory}#` },
    });
  const { Items, LastEvaluatedKey } = await queryBuilder
    .options(queryOptions)
    .send();
  const items = Items || [];
  let nextToken: string | undefined;

  // Only return nextToken if we have a limit, got the full limit of items, and have LastEvaluatedKey
  if (LastEvaluatedKey && options?.limit && items.length === options.limit) {
    nextToken = Buffer.from(JSON.stringify(LastEvaluatedKey)).toString(
      'base64'
    );
  }

  return { items, nextToken };
}

export async function listWorkflows(
  tableName: string,
  userId: string,
  options?: {
    limit?: number;
    nextToken?: string;
    sortBy?: 'createdAt' | 'updatedAt';
    filters?: {
      status?: WorkflowStatus;
      statusCategory?: WorkflowStatusCategory;
    };
  }
): Promise<{
  items: WorkflowRecord[];
  nextToken?: string;
}> {
  // Prefer statusCategory filtering if provided
  if (options?.filters?.statusCategory) {
    return listWorkflowsByStatusCategory(
      tableName,
      userId,
      options.filters.statusCategory,
      {
        limit: options?.limit,
        nextToken: options?.nextToken,
      }
    );
  } else if (options?.filters?.status) {
    return listWorkflowsByStatus(tableName, userId, options.filters.status, {
      limit: options?.limit,
      nextToken: options?.nextToken,
    });
  } else {
    return listWorkflowsWithSorting(tableName, userId, {
      limit: options?.limit,
      nextToken: options?.nextToken,
      sortBy: options?.sortBy,
    });
  }
}
