import { MongoEvaluation, MongoEvalItem } from './schema';
import { MongoEvalDatasetData } from '../dataset/evalDatasetDataSchema';
import type {
  EvaluationSchemaType,
  EvaluationItemSchemaType,
  CreateEvaluationParams,
  EvaluationItemDisplayType,
  TargetCallParams,
  EvaluationDisplayType
} from '@fastgpt/global/core/evaluation/type';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import {
  removeEvaluationTaskJob,
  removeEvaluationItemJobs,
  removeEvaluationItemJobsByItemId,
  addEvaluationTaskJob,
  addEvaluationItemJob,
  addEvaluationItemJobs,
  checkEvaluationTaskJobActive,
  checkEvaluationItemJobActive
} from './mq';
import { createEvaluationUsage } from '../../../support/wallet/usage/controller';
import { addLog } from '../../../common/system/log';
import { buildEvalDataConfig } from '../summary/util/weightCalculator';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { mongoSessionRun } from '../../../common/mongo/sessionRun';
import { type ClientSession } from '../../../common/mongo';
import {
  getEvaluationTaskStatus,
  getEvaluationItemStatus,
  getEvaluationTaskStats,
  getBatchEvaluationItemStatus
} from './statusCalculator';

export class EvaluationTaskService {
  /**
   * Build evaluator fail checks for MongoDB aggregation pipeline
   * Used by both getEvaluationStats and listEvaluationItems for consistency
   */
  private static buildEvaluatorFailChecks(evaluators: any[]) {
    return evaluators.map((evaluator, index) => {
      const threshold = evaluator.thresholdValue || 0.8;
      return {
        $or: [
          {
            $eq: [
              {
                $let: {
                  vars: {
                    evaluatorOutput: { $arrayElemAt: ['$evaluatorOutputs', index] }
                  },
                  in: '$$evaluatorOutput.data.score'
                }
              },
              null
            ]
          },
          {
            $eq: [
              {
                $type: {
                  $let: {
                    vars: {
                      evaluatorOutput: { $arrayElemAt: ['$evaluatorOutputs', index] }
                    },
                    in: '$$evaluatorOutput.data.score'
                  }
                }
              },
              'missing'
            ]
          },
          {
            $lt: [
              {
                $let: {
                  vars: {
                    evaluatorOutput: { $arrayElemAt: ['$evaluatorOutputs', index] }
                  },
                  in: '$$evaluatorOutput.data.score'
                }
              },
              threshold
            ]
          }
        ]
      };
    });
  }

  static async createEvaluation(
    params: CreateEvaluationParams & {
      teamId: string;
      tmbId: string;
    }
  ): Promise<EvaluationSchemaType> {
    const { teamId, tmbId, autoStart = true, ...evaluationParams } = params;

    // Create usage record
    const { billId } = await createEvaluationUsage({
      teamId,
      tmbId,
      appName: evaluationParams.name
    });

    // Apply default configuration to evaluators (weights, thresholds, etc.)
    const { evaluators: evaluatorsWithDefaultConfig, summaryConfigs } = buildEvalDataConfig(
      evaluationParams.evaluators
    );
    const createAndStart = async (session: ClientSession) => {
      // Create evaluation within transaction
      const evaluation = await MongoEvaluation.create(
        [
          {
            ...evaluationParams,
            evaluators: evaluatorsWithDefaultConfig,
            summaryConfigs,
            teamId,
            tmbId,
            usageId: billId,
            createTime: new Date()
          }
        ],
        { session }
      );

      const evaluationObject = evaluation[0].toObject();

      // Load dataset and create evaluation items immediately
      const dataItems = await MongoEvalDatasetData.find({
        evalDatasetCollectionId: evaluationParams.evalDatasetCollectionId,
        teamId
      })
        .session(session)
        .lean();

      if (dataItems.length === 0) {
        throw new Error(EvaluationErrEnum.evalDatasetLoadFailed);
      }

      // Create evaluation items for each dataItem
      const evalItems: Omit<EvaluationItemSchemaType, '_id' | 'status'>[] = [];
      for (const dataItem of dataItems) {
        const evaluationDataItem = {
          _id: dataItem._id,
          userInput: dataItem.userInput,
          expectedOutput: dataItem.expectedOutput,
          context: dataItem.context,
          targetCallParams: undefined
        };

        evalItems.push({
          evalId: evaluationObject._id,
          dataItem: evaluationDataItem
        });
      }

      // Batch insert evaluation items within transaction
      const insertedItems = await MongoEvalItem.insertMany(evalItems, { session });
      addLog.debug(`[Evaluation] Created ${insertedItems.length} evaluation items`);

      // Auto-start the evaluation if autoStart is true
      if (autoStart) {
        // Use the new job management function with deduplication
        await addEvaluationTaskJob({
          evalId: evaluationObject._id.toString()
        });

        addLog.debug(`[Evaluation] Task created and auto-started: ${evaluationObject._id}`);
      } else {
        addLog.debug(`[Evaluation] Task created: ${evaluationObject._id}`);
      }

      return evaluationObject;
    };

    return await mongoSessionRun(createAndStart);
  }

  static async getEvaluation(evalId: string, teamId: string): Promise<EvaluationSchemaType> {
    const evaluation = await MongoEvaluation.findOne({
      _id: new Types.ObjectId(evalId),
      teamId: new Types.ObjectId(teamId)
    }).lean();
    if (!evaluation) {
      throw new Error(EvaluationErrEnum.evalTaskNotFound);
    }

    // Calculate real-time status from job queues
    const status = await getEvaluationTaskStatus(evalId);

    return {
      ...evaluation,
      status
    };
  }

  static async updateEvaluation(
    evalId: string,
    updates: Partial<CreateEvaluationParams>,
    teamId: string
  ): Promise<void> {
    const result = await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId), teamId: new Types.ObjectId(teamId) },
      { $set: updates }
    );
    if (result.matchedCount === 0) {
      throw new Error(EvaluationErrEnum.evalTaskNotFound);
    }
  }

  static async deleteEvaluation(evalId: string, teamId: string): Promise<void> {
    const del = async (session: ClientSession) => {
      // Remove related tasks from queue to prevent further processing
      const [taskCleanupResult, itemCleanupResult] = await Promise.all([
        removeEvaluationTaskJob(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }),
        removeEvaluationItemJobs(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        })
      ]);

      addLog.debug('Queue cleanup completed for evaluation deletion', {
        evalId,
        taskCleanup: taskCleanupResult,
        itemCleanup: itemCleanupResult
      });

      // Delete all evaluation items for this evaluation task
      await MongoEvalItem.deleteMany({ evalId: new Types.ObjectId(evalId) }, { session });

      const result = await MongoEvaluation.deleteOne(
        {
          _id: new Types.ObjectId(evalId),
          teamId: new Types.ObjectId(teamId)
        },
        { session }
      );

      if (result.deletedCount === 0) {
        throw new Error(EvaluationErrEnum.evalTaskNotFound);
      }

      addLog.debug(`[Evaluation] Evaluation task deleted including queue cleanup: ${evalId}`);
    };

    await mongoSessionRun(del);
  }

  static async listEvaluations(
    teamId: string,
    offset: number = 0,
    pageSize: number = 20,
    searchKey?: string,
    accessibleIds?: string[],
    tmbId?: string,
    isOwner: boolean = false,
    appName?: string,
    appId?: string
  ): Promise<{ list: EvaluationDisplayType[]; total: number }> {
    // Build basic filter and pagination
    const filter: any = { teamId: new Types.ObjectId(teamId) };
    const skip = offset;
    const limit = pageSize;
    const sort = { createTime: -1 as const };

    // If not owner, filter by accessible resources
    let finalFilter = filter;
    if (!isOwner && accessibleIds) {
      finalFilter = {
        ...filter,
        $or: [
          { _id: { $in: accessibleIds.map((id) => new Types.ObjectId(id)) } },
          ...(tmbId ? [{ tmbId: new Types.ObjectId(tmbId) }] : []) // Own evaluations
        ]
      };
    }

    // Build aggregation pipeline with target filtering
    const aggregationPipeline = [
      { $match: finalFilter },
      {
        $lookup: {
          from: 'eval_dataset_collections',
          localField: 'evalDatasetCollectionId',
          foreignField: '_id',
          as: 'evalDatasetCollection'
        }
      },
      {
        $addFields: {
          'target.config.appObjectId': { $toObjectId: '$target.config.appId' }
        }
      },
      {
        $lookup: {
          from: 'apps',
          localField: 'target.config.appObjectId',
          foreignField: '_id',
          as: 'app'
        }
      },
      {
        $addFields: {
          'target.config.versionObjectId': { $toObjectId: '$target.config.versionId' }
        }
      },
      {
        $lookup: {
          from: 'app_versions',
          localField: 'target.config.versionObjectId',
          foreignField: '_id',
          as: 'appVersion'
        }
      },
      {
        $addFields: {
          'target.config.appName': { $arrayElemAt: ['$app.name', 0] },
          'target.config.avatar': { $arrayElemAt: ['$app.avatar', 0] },
          'target.config.versionName': { $arrayElemAt: ['$appVersion.versionName', 0] }
        }
      }
    ];

    // Add target filtering stage if any target filters are provided
    if (appName || appId) {
      const targetFilter: any = {};

      if (appName) {
        targetFilter['target.config.appName'] = { $regex: appName, $options: 'i' };
      }

      if (appId) {
        targetFilter['target.config.appId'] = appId;
      }

      aggregationPipeline.push({ $match: targetFilter });
    }

    // Add searchKey filtering after target config is populated (includes versionId/versionName search)
    if (searchKey) {
      aggregationPipeline.push({
        $match: {
          $or: [
            { name: { $regex: searchKey, $options: 'i' } },
            { description: { $regex: searchKey, $options: 'i' } },
            { 'target.config.versionId': { $regex: searchKey, $options: 'i' } },
            { 'target.config.versionName': { $regex: searchKey, $options: 'i' } }
          ]
        }
      });
    }

    const [evaluations, total] = await Promise.all([
      MongoEvaluation.aggregate([
        ...aggregationPipeline,
        {
          $addFields: {
            evalDatasetCollectionName: { $arrayElemAt: ['$evalDatasetCollection.name', 0] },
            evalDatasetCollectionId: '$evalDatasetCollectionId',
            metricNames: {
              $map: {
                input: '$evaluators',
                as: 'evaluator',
                in: '$$evaluator.metric.name'
              }
            }
          }
        },
        {
          $project: {
            _id: 1,
            name: 1,
            createTime: 1,
            finishTime: 1,
            errorMessage: 1,
            evalDatasetCollectionName: 1,
            evalDatasetCollectionId: 1,
            target: {
              type: '$target.type',
              config: {
                appId: '$target.config.appId',
                versionId: '$target.config.versionId',
                avatar: '$target.config.avatar',
                appName: '$target.config.appName',
                versionName: '$target.config.versionName'
              }
            },
            metricNames: 1,
            summaryConfigs: 1,
            aggregateScore: 1,
            tmbId: 1
          }
        },
        { $sort: sort },
        { $skip: skip },
        { $limit: limit }
      ]),
      // Get total count using the same aggregation pipeline (without pagination)
      MongoEvaluation.aggregate([...aggregationPipeline, { $count: 'total' }]).then(
        (result) => result[0]?.total || 0
      )
    ]);

    // Calculate real-time status and statistics for each evaluation
    const evaluationsWithStatus = await Promise.all(
      evaluations.map(async (evaluation) => {
        const [status, statistics] = await Promise.all([
          getEvaluationTaskStatus(evaluation._id.toString()),
          getEvaluationTaskStats(evaluation._id.toString())
        ]);
        return {
          ...evaluation,
          status,
          statistics
        };
      })
    );

    // Return raw data - permissions will be handled in API layer
    return {
      list: evaluationsWithStatus,
      total
    };
  }

  static async getEvaluationDetail(evalId: string, teamId: string): Promise<EvaluationDisplayType> {
    const evaluationResult = await MongoEvaluation.aggregate([
      { $match: { _id: new Types.ObjectId(evalId), teamId: new Types.ObjectId(teamId) } },
      {
        $lookup: {
          from: 'eval_dataset_collections',
          localField: 'evalDatasetCollectionId',
          foreignField: '_id',
          as: 'evalDatasetCollection'
        }
      },
      {
        $addFields: {
          'target.config.appObjectId': { $toObjectId: '$target.config.appId' }
        }
      },
      {
        $lookup: {
          from: 'apps',
          localField: 'target.config.appObjectId',
          foreignField: '_id',
          as: 'app'
        }
      },
      {
        $addFields: {
          'target.config.versionObjectId': { $toObjectId: '$target.config.versionId' }
        }
      },
      {
        $lookup: {
          from: 'app_versions',
          localField: 'target.config.versionObjectId',
          foreignField: '_id',
          as: 'appVersion'
        }
      },
      {
        $addFields: {
          'target.config.appName': { $arrayElemAt: ['$app.name', 0] },
          'target.config.avatar': { $arrayElemAt: ['$app.avatar', 0] },
          'target.config.versionName': { $arrayElemAt: ['$appVersion.versionName', 0] },
          evalDatasetCollectionName: { $arrayElemAt: ['$evalDatasetCollection.name', 0] },
          evalDatasetCollectionId: '$evalDatasetCollectionId'
        }
      },
      {
        $project: {
          _id: 1,
          teamId: 1,
          tmbId: 1,
          name: 1,
          description: 1,
          evalDatasetCollectionId: 1,
          evalDatasetCollectionName: 1,
          target: {
            type: '$target.type',
            config: {
              appId: '$target.config.appId',
              versionId: '$target.config.versionId',
              avatar: '$target.config.avatar',
              appName: '$target.config.appName',
              versionName: '$target.config.versionName'
            }
          },
          evaluators: 1,
          usageId: 1,
          createTime: 1,
          finishTime: 1,
          errorMessage: 1
        }
      }
    ]);

    const evaluation = evaluationResult[0];
    if (!evaluation) {
      throw new Error(EvaluationErrEnum.evalTaskNotFound);
    }

    const status = await getEvaluationTaskStatus(evalId);
    const stats = await getEvaluationTaskStats(evalId);

    return {
      ...evaluation,
      status,
      statistics: stats
    };
  }

  static async startEvaluation(evalId: string, teamId: string): Promise<void> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    // Check if task can be started/restarted using real-time job status
    const isJobActive = await checkEvaluationTaskJobActive(evalId);

    if (isJobActive) {
      throw new Error('Evaluation task is already running');
    }

    // Simplified logic - let BullMQ handle most scenarios
    const canStart =
      evaluation.status === EvaluationStatusEnum.queuing ||
      evaluation.status === EvaluationStatusEnum.completed ||
      (evaluation.status === EvaluationStatusEnum.error &&
        evaluation.errorMessage === 'Manually stopped');

    if (!canStart) {
      throw new Error(EvaluationErrEnum.evalInvalidStateTransition);
    }

    // Use transaction to ensure atomicity
    const startEval = async (session: ClientSession) => {
      // Clear error state and finish time if needed
      if (evaluation.status === EvaluationStatusEnum.error || evaluation.finishTime) {
        const result = await MongoEvaluation.updateOne(
          { _id: new Types.ObjectId(evalId), teamId: new Types.ObjectId(teamId) },
          {
            $unset: {
              errorMessage: 1,
              finishTime: 1
            }
          },
          { session }
        );

        if (result.matchedCount === 0) {
          throw new Error(EvaluationErrEnum.evalTaskNotFound);
        }
      }

      // Always use task job for consistency - let the processor handle item scheduling
      await addEvaluationTaskJob({
        evalId: evalId
      });
    };

    await mongoSessionRun(startEval);

    const action =
      evaluation.status === EvaluationStatusEnum.error
        ? 'restarted'
        : evaluation.status === EvaluationStatusEnum.completed
          ? 'restarted'
          : 'started';
    addLog.debug(`[Evaluation] Task ${action}: ${evalId}`);
  }

  static async stopEvaluation(evalId: string, teamId: string): Promise<void> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    // Check if task is actually running using job status
    const isJobActive = await checkEvaluationTaskJobActive(evalId);

    if (
      !isJobActive &&
      ![EvaluationStatusEnum.evaluating, EvaluationStatusEnum.queuing].includes(evaluation.status)
    ) {
      throw new Error(EvaluationErrEnum.evalOnlyRunningCanStop);
    }

    const stopEval = async (session: ClientSession) => {
      // Remove related tasks from queue
      const [taskCleanupResult, itemCleanupResult] = await Promise.all([
        removeEvaluationTaskJob(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        }),
        removeEvaluationItemJobs(evalId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        })
      ]);

      addLog.debug('Queue cleanup completed for evaluation stop', {
        evalId,
        taskCleanup: taskCleanupResult,
        itemCleanup: itemCleanupResult
      });

      // Set error state for manual stop (status is now computed from job queue state)
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            finishTime: new Date(),
            errorMessage: 'Manually stopped'
          }
        },
        { session }
      );

      // Mark evaluation items as manually stopped (without status field)
      await MongoEvalItem.updateMany(
        {
          evalId: new Types.ObjectId(evalId)
        },
        {
          $set: {
            errorMessage: 'Manually stopped',
            finishTime: new Date()
          }
        },
        { session }
      );

      addLog.debug(`[Evaluation] Task manually stopped and removed from queue: ${evalId}`);
    };

    await mongoSessionRun(stopEval);
  }

  static async getEvaluationStats(
    evalId: string,
    teamId: string
  ): Promise<{
    total: number;
    completed: number;
    evaluating: number;
    queuing: number;
    error: number;
    failed: number;
  }> {
    const evaluation = await this.getEvaluation(evalId, teamId); // Validate access

    // Use real-time status calculation from job queues
    const basicStats = await getEvaluationTaskStats(evalId);

    // Calculate failed count using buildEvaluatorFailChecks
    const evaluators = evaluation.evaluators || [];
    let failedCount = 0;

    if (evaluators.length > 0) {
      const evaluatorFailChecks = this.buildEvaluatorFailChecks(evaluators);

      // Use aggregation to count failed items (items that fail threshold checks)
      const failedResult = await MongoEvalItem.aggregate([
        { $match: { evalId: new Types.ObjectId(evalId) } },
        {
          $addFields: {
            hasFailedEvaluator:
              evaluatorFailChecks.length > 0 ? { $or: evaluatorFailChecks } : false
          }
        },
        {
          $match: {
            hasFailedEvaluator: true,
            finishTime: { $exists: true }, // Only count completed items
            errorMessage: { $exists: false } // Exclude items with errors
          }
        },
        { $count: 'failed' }
      ]);

      failedCount = failedResult[0]?.failed || 0;
    }

    return {
      ...basicStats,
      failed: failedCount
    };
  }

  // ========================= Evaluation Item Related APIs =========================

  static async listEvaluationItems(
    evalId: string,
    teamId: string,
    offset: number = 0,
    pageSize: number = 20,
    options: {
      status?: EvaluationStatusEnum;
      belowThreshold?: boolean;
      userInput?: string;
      expectedOutput?: string;
      actualOutput?: string;
    } = {}
  ): Promise<{ items: EvaluationItemDisplayType[]; total: number }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const { status, belowThreshold, userInput, expectedOutput, actualOutput } = options;

    // Build base query conditions for database filtering
    const filter: any = { evalId: evaluation._id };

    if (userInput) {
      filter['dataItem.userInput'] = { $regex: userInput, $options: 'i' };
    }

    if (expectedOutput) {
      filter['dataItem.expectedOutput'] = { $regex: expectedOutput, $options: 'i' };
    }

    if (actualOutput) {
      filter['targetOutput.actualOutput'] = { $regex: actualOutput, $options: 'i' };
    }

    // Helper function to add status and evaluators to items
    const enrichItems = async (items: any[]) => {
      if (items.length === 0) return [];

      const itemIds = items.map((item) => item._id.toString());
      const statusMap = await getBatchEvaluationItemStatus(itemIds);

      return items.map((item) => ({
        ...item,
        status: statusMap.get(item._id.toString()) || EvaluationStatusEnum.completed,
        evaluators: evaluation.evaluators.map((evaluator) => ({
          metric: evaluator.metric,
          thresholdValue: evaluator.thresholdValue
        }))
      }));
    };

    // Handle belowThreshold filter with potential status filtering
    if (belowThreshold) {
      // Build dynamic expressions for checking if each evaluator output fails threshold (same as getEvaluationStats)
      const evaluators = evaluation.evaluators || [];
      const evaluatorFailChecks = this.buildEvaluatorFailChecks(evaluators);
      // Build aggregation pipeline for belowThreshold filtering
      const aggregationPipeline: any[] = [
        { $match: filter },
        {
          $addFields: {
            // Add a field to check if this item has any failed evaluators (same logic as getEvaluationStats)
            hasFailedEvaluator:
              evaluatorFailChecks.length > 0 ? { $or: evaluatorFailChecks } : false
          }
        },
        {
          $match: {
            hasFailedEvaluator: true
          }
        },
        { $sort: { createTime: -1 } }
      ];

      // When status filtering is also needed, fetch more items to ensure we have enough after filtering
      const expandedLimit = Math.max(pageSize * 5, 100); // Fetch more items for filtering

      const allItems = await MongoEvalItem.aggregate([
        ...aggregationPipeline,
        { $limit: expandedLimit }
      ]);

      const enrichedItems = await enrichItems(allItems);
      const statusFilteredItems = enrichedItems.filter(
        (item) => item.status === EvaluationStatusEnum.completed
      );

      // Apply pagination to filtered results
      const paginatedItems = statusFilteredItems.slice(offset, offset + pageSize);

      // For accurate total count, we need to count all items that match both criteria
      // This is expensive but necessary for accurate pagination
      const allMatchingItems = await MongoEvalItem.aggregate(aggregationPipeline);
      const allEnrichedItems = await enrichItems(allMatchingItems);
      const total = allEnrichedItems.filter(
        (item) => item.status === EvaluationStatusEnum.completed
      ).length;

      return { items: paginatedItems, total };
    }

    // Handle normal listing with potential status filtering
    if (status !== undefined) {
      // When status filtering is needed, we need to fetch more items and filter in memory
      // This approach prioritizes accuracy over performance
      const batchSize = Math.max(pageSize * 10, 200); // Fetch larger batches
      let allFilteredItems: any[] = [];
      let currentSkip = 0;
      let hasMore = true;

      // Keep fetching batches until we have enough items or run out of data
      while (allFilteredItems.length < offset + pageSize && hasMore) {
        const batchItems = await MongoEvalItem.find(filter)
          .sort({ createTime: -1 })
          .skip(currentSkip)
          .limit(batchSize)
          .lean();

        if (batchItems.length === 0) {
          hasMore = false;
          break;
        }

        const enrichedBatch = await enrichItems(batchItems);
        const statusFilteredBatch = enrichedBatch.filter((item) => item.status === status);
        allFilteredItems.push(...statusFilteredBatch);

        currentSkip += batchSize;

        // Safety limit to prevent infinite loops
        if (currentSkip > 10000) {
          break;
        }
      }

      // Apply pagination to the filtered results
      const paginatedItems = allFilteredItems.slice(offset, offset + pageSize);

      // For total count, we approximate based on the filtering ratio
      // This is a reasonable compromise between accuracy and performance
      const totalDocuments = await MongoEvalItem.countDocuments(filter);
      const sampledItems = Math.min(currentSkip, totalDocuments);
      const filteringRatio = sampledItems > 0 ? allFilteredItems.length / sampledItems : 0;
      const estimatedTotal = Math.round(totalDocuments * filteringRatio);

      return { items: paginatedItems, total: estimatedTotal };
    }

    // No status filtering needed - simple case
    const [items, total] = await Promise.all([
      MongoEvalItem.find(filter).sort({ createTime: -1 }).skip(offset).limit(pageSize).lean(),
      MongoEvalItem.countDocuments(filter)
    ]);

    const enrichedItems = await enrichItems(items);
    return { items: enrichedItems, total };
  }

  static async getEvaluationItem(
    itemId: string,
    teamId: string
  ): Promise<EvaluationItemSchemaType> {
    const item = await MongoEvalItem.findById(itemId).lean();

    if (!item) {
      throw new Error(EvaluationErrEnum.evalItemNotFound);
    }

    await this.getEvaluation(item.evalId, teamId);

    // Calculate real-time status
    const status = await getEvaluationItemStatus(itemId);

    return {
      ...item,
      status
    };
  }

  /**
   * Build MongoDB update object with dot notation for evaluation data item updates
   * @private
   */
  private static buildEvaluationDataItemUpdateObject(updates: {
    userInput?: string;
    expectedOutput?: string;
    context?: string[];
    targetCallParams?: TargetCallParams;
  }): any {
    const updateObj: any = {};

    if (updates.userInput !== undefined) {
      updateObj['dataItem.userInput'] = updates.userInput;
    }
    if (updates.expectedOutput !== undefined) {
      updateObj['dataItem.expectedOutput'] = updates.expectedOutput;
    }
    if (updates.context !== undefined) {
      updateObj['dataItem.context'] = updates.context;
    }
    if (updates.targetCallParams !== undefined) {
      updateObj['dataItem.targetCallParams'] = updates.targetCallParams;
    }

    return updateObj;
  }

  /**
   * Update evaluation item with data item fields
   * Unified method for API layers to update evaluation items
   */
  static async updateEvaluationItem(
    itemId: string,
    updates: {
      userInput?: string;
      expectedOutput?: string;
      context?: string[];
      targetCallParams?: TargetCallParams;
    },
    teamId: string
  ): Promise<void> {
    await this.getEvaluationItem(itemId, teamId);

    // Build MongoDB update object with dot notation
    const updateObj = this.buildEvaluationDataItemUpdateObject(updates);
    if (Object.keys(updateObj).length === 0) {
      return;
    }

    const result = await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(itemId) },
      { $set: updateObj }
    );

    if (result.matchedCount === 0) {
      throw new Error(EvaluationErrEnum.evalItemNotFound);
    }

    // If actual update occurred, re-queue the item for evaluation
    if (result.modifiedCount > 0) {
      // Get the updated item to determine the evalId
      const updatedItem = await MongoEvalItem.findById(itemId, 'evalId');
      if (updatedItem) {
        // Reset evaluation results and re-queue
        await MongoEvalItem.updateOne(
          { _id: new Types.ObjectId(itemId) },
          {
            $unset: {
              targetOutput: 1,
              evaluatorOutputs: 1,
              finishTime: 1,
              errorMessage: 1
            }
          }
        );

        // Re-submit to evaluation queue using new job management function
        await addEvaluationItemJob({
          evalId: updatedItem.evalId.toString(),
          evalItemId: itemId
        });

        addLog.debug(`[Evaluation] Item updated and re-queued for evaluation: ${itemId}`);
      }
    }
  }

  static async deleteEvaluationItem(itemId: string, teamId: string): Promise<void> {
    await this.getEvaluationItem(itemId, teamId);

    // Remove related jobs from queue before deleting the item
    const cleanupResult = await removeEvaluationItemJobsByItemId(itemId, {
      forceCleanActiveJobs: true,
      retryAttempts: 3,
      retryDelay: 200
    });

    addLog.debug('Queue cleanup completed for evaluation item deletion', {
      itemId,
      cleanup: cleanupResult
    });

    const result = await MongoEvalItem.deleteOne({ _id: new Types.ObjectId(itemId) });

    if (result.deletedCount === 0) {
      throw new Error(EvaluationErrEnum.evalItemNotFound);
    }

    addLog.debug(`[Evaluation] Evaluation item deleted including queue cleanup: ${itemId}`);
  }

  static async retryEvaluationItem(itemId: string, teamId: string): Promise<void> {
    const item = await this.getEvaluationItem(itemId, teamId);

    // Check if item is already running using job status
    const isJobActive = await checkEvaluationItemJobActive(itemId);

    if (isJobActive) {
      throw new Error('Evaluation item is already running');
    }

    // Only completed evaluation items without errors cannot be retried
    if (item.status === EvaluationStatusEnum.completed) {
      throw new Error(EvaluationErrEnum.evalOnlyFailedCanRetry);
    }

    // Check if item is in error status or retryable status
    if (
      item.status !== EvaluationStatusEnum.error &&
      item.status !== EvaluationStatusEnum.queuing
    ) {
      throw new Error(EvaluationErrEnum.evalItemNoErrorToRetry);
    }

    // Get evaluation to access evaluators for proper evaluatorOutputs initialization
    const evaluation = await this.getEvaluation(item.evalId, teamId);

    // Remove existing jobs for this item to prevent duplicates
    const cleanupResult = await removeEvaluationItemJobsByItemId(itemId, {
      forceCleanActiveJobs: true,
      retryAttempts: 3,
      retryDelay: 200
    });

    addLog.debug('Queue cleanup completed for evaluation item retry', {
      itemId,
      cleanup: cleanupResult
    });

    // Use transaction for atomic status update and queue submission
    const retryItem = async (session: ClientSession) => {
      // Initialize evaluatorOutputs based on evaluators schema definition
      const evaluatorOutputs = evaluation.evaluators.map((evaluator) => ({
        metricName: evaluator.metric.name
      }));

      // Reset item state for retry within transaction (no status field since it's managed by job queue)
      const result = await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(itemId) },
        {
          $set: {
            targetOutput: {},
            evaluatorOutputs
          },
          $unset: {
            finishTime: 1,
            errorMessage: 1
          }
        },
        { session }
      );

      if (result.matchedCount === 0) {
        throw new Error(EvaluationErrEnum.evalItemNotFound);
      }

      // Use the new job management function with deduplication
      await addEvaluationItemJob({
        evalId: item.evalId,
        evalItemId: itemId
      });
    };

    await mongoSessionRun(retryItem);

    addLog.debug(`[Evaluation] Evaluation item reset to queuing status and resubmitted: ${itemId}`);
  }

  static async retryFailedItems(evalId: string, teamId: string): Promise<number> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const retryItems = async (session: ClientSession): Promise<number> => {
      // Find items that need to be retried (items with error messages)
      const itemsToRetry = await MongoEvalItem.find(
        {
          evalId: evaluation._id,
          errorMessage: { $exists: true, $ne: null }
        },
        '_id',
        { session }
      ).lean();

      if (itemsToRetry.length === 0) {
        return 0;
      }

      // Clean up existing jobs for all items that will be retried to prevent duplicates
      const itemIds = itemsToRetry.map((item) => item._id.toString());
      const cleanupPromises = itemIds.map((itemId) =>
        removeEvaluationItemJobsByItemId(itemId, {
          forceCleanActiveJobs: true,
          retryAttempts: 3,
          retryDelay: 200
        })
      );

      const cleanupResults = await Promise.allSettled(cleanupPromises);
      const successfulCleanups = cleanupResults.filter((r) => r.status === 'fulfilled').length;

      addLog.debug('Queue cleanup completed for batch retry failed items', {
        evalId,
        totalItems: itemsToRetry.length,
        successfulCleanups,
        failedCleanups: cleanupResults.length - successfulCleanups
      });

      // Initialize evaluatorOutputs based on evaluators schema definition
      const evaluatorOutputs = evaluation.evaluators.map((evaluator) => ({
        metricName: evaluator.metric.name
      }));

      // Batch update status
      await MongoEvalItem.updateMany(
        {
          _id: { $in: itemsToRetry.map((item) => item._id) }
        },
        {
          $set: {
            targetOutput: {},
            evaluatorOutputs
          },
          $unset: {
            finishTime: 1,
            errorMessage: 1
          }
        },
        { session }
      );

      // Batch resubmit to queue with deduplication support
      const jobs = itemsToRetry.map((item, index) => ({
        data: {
          evalId: evaluation._id.toString(),
          evalItemId: item._id.toString()
        },
        delay: index * 100 // Add small delay to avoid starting too many tasks simultaneously
      }));

      try {
        await addEvaluationItemJobs(jobs);
      } catch (queueError) {
        // If queue operation fails, the transaction will rollback the status updates
        addLog.error(`[Evaluation] Failed to resubmit jobs to queue: ${evalId}`, queueError);
        throw queueError;
      }

      addLog.debug(
        `[Evaluation] Batch retry failed items: ${evalId}, affected count: ${itemsToRetry.length}`
      );

      return itemsToRetry.length;
    };

    const retriedCount = await mongoSessionRun(retryItems);

    // Note: Score recalculation will be triggered when items complete in finishEvaluationTask
    if (retriedCount > 0) {
      addLog.debug(
        `[Evaluation] Queued ${retriedCount} failed items for retry, scores will be recalculated when items complete: ${evalId}`
      );
    }

    return retriedCount;
  }

  static async getEvaluationItemResult(
    itemId: string,
    teamId: string
  ): Promise<EvaluationItemSchemaType> {
    const item = await this.getEvaluationItem(itemId, teamId);
    return item;
  }

  // Export evaluation item results
  static async exportEvaluationResults(
    evalId: string,
    teamId: string,
    format: 'csv' | 'json' = 'json'
  ): Promise<{ results: Buffer; total: number }> {
    const evaluation = await this.getEvaluation(evalId, teamId);

    const items = await MongoEvalItem.find({ evalId: evaluation._id })
      .sort({ createTime: 1 })
      .lean();

    const total = items.length;

    // Calculate real-time status for all items
    const itemIds = items.map((item) => item._id.toString());
    const statusMap = await getBatchEvaluationItemStatus(itemIds);

    if (format === 'json') {
      const results = items.map((item) => ({
        itemId: item._id,
        userInput: item.dataItem?.userInput,
        expectedOutput: item.dataItem?.expectedOutput,
        actualOutput: item.targetOutput?.actualOutput,
        scores: item.evaluatorOutputs?.map((output) => output?.data?.score) || [],
        status: statusMap.get(item._id.toString()) || EvaluationStatusEnum.completed,
        targetOutput: item.targetOutput,
        evaluatorOutputs: item.evaluatorOutputs,
        errorMessage: item.errorMessage,
        finishTime: item.finishTime
      }));

      return { results: Buffer.from(JSON.stringify(results, null, 2)), total };
    } else {
      // CSV format
      if (items.length === 0) {
        return { results: Buffer.from(''), total: 0 };
      }

      // Collect all unique metric names from evaluator outputs
      const metricNames = new Set<string>();
      items.forEach((item) => {
        item.evaluatorOutputs?.forEach((output) => {
          if (output?.data?.metricName) {
            metricNames.add(output.data.metricName);
          }
        });
      });
      const sortedMetricNames = Array.from(metricNames).sort();

      const headers = [
        'ItemId',
        'UserInput',
        'ExpectedOutput',
        'ActualOutput',
        ...sortedMetricNames, // Dynamic metric columns
        'Status',
        'ErrorMessage',
        'FinishTime'
      ];

      const csvRows = [headers.join(',')];

      items.forEach((item) => {
        // Create a map of metric name to score for easier lookup
        const metricScoreMap = new Map<string, number>();
        item.evaluatorOutputs?.forEach((output) => {
          if (output?.data?.metricName && output.data.score !== undefined) {
            metricScoreMap.set(output.data.metricName, output.data.score);
          }
        });

        const itemStatus = statusMap.get(item._id.toString()) || EvaluationStatusEnum.completed;

        const row = [
          item._id.toString(),
          `"${(item.dataItem?.userInput || '').replace(/"/g, '""')}"`,
          `"${(item.dataItem?.expectedOutput || '').replace(/"/g, '""')}"`,
          `"${(item.targetOutput?.actualOutput || '').replace(/"/g, '""')}"`,
          // Add scores for each metric column in the same order as headers
          ...sortedMetricNames.map((metricName) => {
            const score = metricScoreMap.get(metricName);
            return score !== undefined ? score : '';
          }),
          itemStatus || '',
          `"${(item.errorMessage || '').replace(/"/g, '""')}"`,
          item.finishTime || ''
        ];
        csvRows.push(row.join(','));
      });

      return { results: Buffer.from(csvRows.join('\n')), total };
    }
  }
}
export { MongoEvaluation };
