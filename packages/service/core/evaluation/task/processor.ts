import { addLog } from '../../../common/system/log';
import type { Job } from '../../../common/bullmq';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData,
  TargetOutput,
  EvaluationItemSchemaType,
  EvaluationDataItemType
} from '@fastgpt/global/core/evaluation/type';
import {
  getEvaluationItemWorker,
  getEvaluationTaskWorker,
  addEvaluationItemJobs
} from './mq';
import { MongoEvaluation, MongoEvalItem } from './schema';
import { MongoEvalDatasetData } from '../dataset/evalDatasetDataSchema';
import { createTargetInstance } from '../target';
import { createEvaluatorInstance } from '../evaluator';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { createMergedEvaluationUsage } from '../utils/usage';
import { EvaluationSummaryService } from '../summary';
import { calculateEvaluationItemAggregateScore } from '../summary/util/aggregateScoreCalculator';
import { getBatchEvaluationItemStatus } from './statusCalculator';
import { createEvaluationError } from './errors';

import type { MetricResult } from '@fastgpt/global/core/evaluation/metric/type';
import { MetricResultStatusEnum } from '@fastgpt/global/core/evaluation/metric/constants';

// Complete evaluation task
export const finishEvaluationTask = async (evalId: string) => {
  try {
    // Get all evaluation items for this task
    const allItems = await MongoEvalItem.find({ evalId: new Types.ObjectId(evalId) }, '_id').lean();

    if (allItems.length === 0) {
      addLog.warn(`[Evaluation] Evaluation task has no evaluation item data: ${evalId}`);
      return;
    }

    const totalCount = allItems.length;
    const itemIds = allItems.map((item) => item._id.toString());

    const statusMap = await getBatchEvaluationItemStatus(itemIds);

    let completedCount = 0;
    let errorCount = 0;
    let evaluatingCount = 0;
    let queuingCount = 0;

    for (const itemId of itemIds) {
      const status = statusMap.get(itemId) || EvaluationStatusEnum.completed;
      switch (status) {
        case EvaluationStatusEnum.completed:
          completedCount++;
          break;
        case EvaluationStatusEnum.error:
          errorCount++;
          break;
        case EvaluationStatusEnum.evaluating:
          evaluatingCount++;
          break;
        case EvaluationStatusEnum.queuing:
          queuingCount++;
          break;
      }
    }

    // Check if truly completed
    const pendingCount = evaluatingCount + queuingCount;

    // Set finishTime if all items are finished (either completed or error, no pending)
    if (pendingCount === 0) {
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        { $set: { finishTime: new Date() } }
      );
    }

    const taskStatus =
      pendingCount > 0
        ? EvaluationStatusEnum.evaluating
        : errorCount > 0
          ? EvaluationStatusEnum.error
          : EvaluationStatusEnum.completed;

    addLog.info(
      `[Evaluation] Task status calculated: ${evalId}, realTimeStatus: ${taskStatus}, total: ${totalCount}, ` +
        `success: ${completedCount}, failed: ${errorCount}, pending: ${pendingCount}`
    );

    // Calculate and save metric scores, then trigger async summary generation if task finished and has completed items
    if (pendingCount === 0 && completedCount > 0) {
      try {
        // First, calculate and save metric scores to MongoDB
        await EvaluationSummaryService.calculateAndSaveMetricScores(evalId);

        // Get current evaluation to extract metric IDs and check summary status
        const currentEvaluation = await MongoEvaluation.findById(
          evalId,
          'evaluators summaryConfigs'
        ).lean();

        if (currentEvaluation?.evaluators && currentEvaluation.evaluators.length > 0) {
          // Filter metrics that have empty summaries
          const metricsNeedingSummary: string[] = [];

          currentEvaluation.evaluators.forEach((evaluator: any, index: number) => {
            const metricId = evaluator.metric._id.toString();
            const summaryConfig = currentEvaluation.summaryConfigs[index];

            // Check if summary is empty or null
            if (!summaryConfig?.summary || summaryConfig.summary.trim() === '') {
              metricsNeedingSummary.push(metricId);
            }
          });

          if (metricsNeedingSummary.length > 0) {
            // Trigger async summary generation only for metrics with empty summaries (fire and forget)
            setImmediate(() => {
              EvaluationSummaryService.generateSummaryReports(evalId, metricsNeedingSummary).catch(
                (error) => {
                  addLog.error(
                    `[Evaluation] Failed to trigger async summary generation: ${evalId}`,
                    error
                  );
                }
              );
            });

            addLog.info(
              `[Evaluation] Triggered async summary generation for ${metricsNeedingSummary.length} metrics with empty summaries: ${evalId}, taskStatus: ${taskStatus}`
            );
          } else {
            addLog.info(
              `[Evaluation] All metrics already have summaries, skipping summary generation: ${evalId}, taskStatus: ${taskStatus}`
            );
          }
        }
      } catch (summaryError) {
        // Don't affect main task completion flow, just log the error
        addLog.warn(`[Evaluation] Failed to trigger summary generation: ${evalId}`, {
          error: summaryError instanceof Error ? summaryError.message : String(summaryError)
        });
      }
    }
  } catch (error) {
    addLog.error(`[Evaluation] Error occurred while completing task: ${evalId}`, {
      error: getErrText(error)
    });

    // When error occurs, save error info to database
    try {
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            finishTime: new Date(),
            errorMessage: `System error occurred while completing task: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        }
      );
    } catch (updateError) {
      addLog.warn(`[Evaluation] Failed to update task error info: ${evalId}`, {
        updateError: getErrText(updateError)
      });
    }
  }
};

// Evaluation task processor
const evaluationTaskProcessor = async (job: Job<EvaluationTaskJobData>) => {
  const { evalId } = job.data;

  addLog.debug(`[Evaluation] Start processing evaluation task: ${evalId}`);

  try {
    // Report initial progress
    await job.updateProgress(0);

    // Get evaluation data
    const evaluation = await MongoEvaluation.findById(evalId).lean();

    // If the task doesn't exist, skip processing
    if (!evaluation) {
      addLog.warn(`[Evaluation] Task ${evalId} no longer exists, skipping`);
      return;
    }

    addLog.debug(`[Evaluation] Task ${evalId} now evaluating`);

    // Validate target and evaluators configuration early
    if (!evaluation.target || !evaluation.target.type || !evaluation.target.config) {
      throw new Error(EvaluationErrEnum.evalTargetConfigInvalid);
    }

    if (!evaluation.evaluators || evaluation.evaluators.length === 0) {
      throw new Error(EvaluationErrEnum.evalEvaluatorsConfigInvalid);
    }

    // Report progress: validation completed
    await job.updateProgress(20);

    // Check if evaluation items already exist (created during task creation)
    const existingItems = await MongoEvalItem.find({ evalId }).lean();
    if (existingItems.length > 0) {
      // Normal path: items were created during task creation
      addLog.debug(
        `[Evaluation] Task ${evalId} already has ${existingItems.length} items, submitting to queue...`
      );

      const itemIds = existingItems.map((item) => item._id.toString());
      const statusMap = await getBatchEvaluationItemStatus(itemIds);

      const itemsToProcess = existingItems.filter((item) => {
        const realTimeStatus = statusMap.get(item._id.toString()) || EvaluationStatusEnum.completed;
        // 移除 retry 相关的检查，只保留排队状态的检查
        return realTimeStatus === EvaluationStatusEnum.queuing;
      });

      if (itemsToProcess.length > 0) {
        const jobs = itemsToProcess.map((item, index) => ({
          data: {
            evalId,
            evalItemId: item._id.toString()
          },
          delay: index * 100 // Add small delay to avoid starting too many tasks simultaneously
        }));

        await addEvaluationItemJobs(jobs);
        addLog.debug(`[Evaluation] Submitted ${jobs.length} items to queue`);
      } else {
        addLog.debug(`[Evaluation] No items to process, all items are completed or failed`);
      }

      // Report final progress
      await job.updateProgress(100);
      return;
    }

    // Fallback: Create evaluation items if they don't exist (backward compatibility)
    // This should rarely happen with the new flow
    addLog.warn(`[Evaluation] No existing items found for evaluation ${evalId}, creating items...`);

    // Load dataset only when we need to create items (rare case)
    const dataItems = await MongoEvalDatasetData.find({
      evalDatasetCollectionId: evaluation.evalDatasetCollectionId,
      teamId: evaluation.teamId
    }).lean();

    if (dataItems.length === 0) {
      throw new Error(EvaluationErrEnum.evalDatasetLoadFailed);
    }

    // Create evaluation items for each dataItem
    const evalItems: Omit<EvaluationItemSchemaType, '_id' | 'status'>[] = [];
    for (const dataItem of dataItems) {
      const evaluationDataItem: EvaluationDataItemType = {
        _id: dataItem._id,
        userInput: dataItem.userInput,
        expectedOutput: dataItem.expectedOutput,
        context: dataItem.context,
        targetCallParams: undefined
      };

      evalItems.push({
        evalId,
        dataItem: evaluationDataItem
      });
    }

    // Batch insert evaluation items
    const insertedItems = await MongoEvalItem.insertMany(evalItems);
    addLog.debug(`[Evaluation] Created ${insertedItems.length} evaluation items`);

    // Submit to evaluation item queue for concurrent processing with deduplication
    const jobs = insertedItems.map((item, index) => ({
      data: {
        evalId,
        evalItemId: item._id.toString()
      },
      delay: index * 100
    }));

    await addEvaluationItemJobs(jobs);

    // Report final progress
    await job.updateProgress(100);

    addLog.debug(
      `[Evaluation] Task decomposition completed: ${evalId}, submitted ${jobs.length} evaluation items to queue`
    );
  } catch (error) {
    // Only save error message and finish time
    try {
      await MongoEvaluation.updateOne(
        { _id: new Types.ObjectId(evalId) },
        {
          $set: {
            errorMessage: getErrText(error),
            finishTime: new Date()
          }
        }
      );
    } catch (updateError) {
      addLog.warn(`[Evaluation] Failed to update task error info: ${evalId}`, {
        updateError: getErrText(updateError)
      });
    }

    // Re-throw error for BullMQ to handle
    throw error;
  }
};

// Evaluation item processor
const evaluationItemProcessor = async (job: Job<EvaluationItemJobData>) => {
  const { evalId, evalItemId } = job.data;

  addLog.debug(`[Evaluation] Start processing evaluation item: ${evalItemId}`);

  try {
    // Report initial progress
    await job.updateProgress(0);

    // Get evaluation item information
    const evalItem = await MongoEvalItem.findById(evalItemId);
    if (!evalItem) {
      throw createEvaluationError(EvaluationErrEnum.evalItemNotFound, 'ResourceCheck');
    }

    // Get evaluation information for AI Points check and target/evaluators config
    const evaluation = await MongoEvaluation.findById(
      evalId,
      'teamId tmbId usageId target evaluators'
    );
    if (!evaluation) {
      throw createEvaluationError(EvaluationErrEnum.evalTaskNotFound, 'ResourceCheck');
    }

    // Check AI Points
    try {
      await checkTeamAIPoints(evaluation.teamId);
    } catch (error) {
      throw createEvaluationError(error, 'ResourceCheck');
    }

    // Initialize outputs - check for existing results first for resume capability
    let targetOutput: TargetOutput | undefined = undefined;
    let evaluatorOutputs: MetricResult[] = [];

    // Resume from checkpoint if previous execution results exist
    // Since job is executing, we can safely check for existing results to resume
    if (evalItem.targetOutput?.actualOutput) {
      addLog.debug(`[Evaluation] Resuming targetOutput from evalItem: ${evalItemId}`);
      targetOutput = evalItem.targetOutput;
    }
    if (evalItem.evaluatorOutputs && evalItem.evaluatorOutputs.length > 0) {
      addLog.debug(`[Evaluation] Resuming evaluatorOutputs from evalItem: ${evalItemId}`);
      evaluatorOutputs = evalItem.evaluatorOutputs;
    }

    if (!targetOutput && !evaluatorOutputs.length) {
      addLog.debug(`[Evaluation] Starting evaluation item from scratch: ${evalItemId}`);
    }

    // Report progress: setup completed
    await job.updateProgress(10);

    // 1. Call evaluation target (if not already done)
    if (!targetOutput || !targetOutput.actualOutput) {
      try {
        const targetInstance = await createTargetInstance(evaluation.target, { validate: false });
        targetOutput = await targetInstance.execute({
          userInput: evalItem.dataItem.userInput,
          context: evalItem.dataItem.context,
          targetCallParams: evalItem.dataItem.targetCallParams
        });

        // Save target output as checkpoint with chat information
        await MongoEvalItem.updateOne(
          { _id: new Types.ObjectId(evalItemId) },
          {
            $set: {
              targetOutput: targetOutput
            }
          }
        );

        // Report progress: target execution completed
        await job.updateProgress(30);

        // Record usage from target call
        if (targetOutput.usage) {
          const totalPoints = targetOutput.usage.reduce(
            (sum: number, item: any) => sum + (item.totalPoints || 0),
            0
          );
          const inputTokens = targetOutput.usage.reduce(
            (sum: number, item: any) => sum + (item.inputTokens || 0),
            0
          );
          const outputTokens = targetOutput.usage.reduce(
            (sum: number, item: any) => sum + (item.outputTokens || 0),
            0
          );
          await createMergedEvaluationUsage({
            evalId,
            teamId: evaluation.teamId,
            tmbId: evaluation.tmbId,
            usageId: evaluation.usageId,
            totalPoints,
            type: 'target',
            inputTokens,
            outputTokens
          });
        }

        if (!targetOutput.actualOutput) {
          throw new Error(EvaluationErrEnum.evalTargetOutputRequired);
        }
      } catch (error) {
        // 使用新的 BullMQ 错误类型替代自定义错误类
        throw createEvaluationError(error, 'TargetExecute', {
          evalId,
          evalItemId
        });
      }
    }

    // 2. Execute evaluators (batch processing - only execute missing ones)
    // Ensure evaluatorOutputs array matches the length of evaluators
    while (evaluatorOutputs.length < evaluation.evaluators.length) {
      const evaluatorIndex = evaluatorOutputs.length;
      evaluatorOutputs.push({
        metricName: evaluation.evaluators[evaluatorIndex].metric.name
      });
    }

    const errors: Array<{ evaluatorName: string; error: string }> = [];

    // Execute only missing evaluators
    for (let i = 0; i < evaluation.evaluators.length; i++) {
      const evaluator = evaluation.evaluators[i];
      const existingOutput = evaluatorOutputs[i];

      // Skip if this evaluator already has a valid result
      if (existingOutput?.data?.score !== undefined) {
        continue;
      }

      try {
        const evaluatorInstance = await createEvaluatorInstance(evaluator, {
          validate: false
        });

        const evaluatorOutput = await evaluatorInstance.evaluate({
          userInput: evalItem.dataItem.userInput,
          expectedOutput: evalItem.dataItem.expectedOutput,
          actualOutput: targetOutput.actualOutput,
          context: evalItem.dataItem.context,
          retrievalContext: targetOutput.retrievalContext
        });

        await createMergedEvaluationUsage({
          evalId,
          teamId: evaluation.teamId,
          tmbId: evaluation.tmbId,
          usageId: evaluation.usageId,
          totalPoints: evaluatorOutput.totalPoints || 0,
          inputTokens:
            evaluatorOutput.usages?.reduce((sum, usage) => sum + (usage.promptTokens || 0), 0) || 0,
          outputTokens:
            evaluatorOutput.usages?.reduce(
              (sum, usage) => sum + (usage.completionTokens || 0),
              0
            ) || 0,
          type: 'metric'
        });

        // Record error but continue processing
        if (evaluatorOutput.status !== MetricResultStatusEnum.Success || evaluatorOutput.error) {
          const errorMessage = evaluatorOutput.error || 'Evaluator execution failed';
          const evaluatorName = evaluator.metric.name || `Evaluator ${i + 1}`;
          errors.push({ evaluatorName, error: errorMessage });
        }

        // Update the specific position in the array
        evaluatorOutputs[i] = evaluatorOutput;

        // Save progress after each evaluator (checkpoint for resume)
        await MongoEvalItem.updateOne(
          { _id: new Types.ObjectId(evalItemId) },
          { $set: { evaluatorOutputs: evaluatorOutputs } }
        );

        // Report progress: evaluator completed
        const completedEvaluators = evaluatorOutputs.filter(
          (output) => output?.data?.score !== undefined
        ).length;
        const evaluatorProgress = 30 + (60 * completedEvaluators) / evaluation.evaluators.length;
        await job.updateProgress(Math.round(evaluatorProgress));
      } catch (error) {
        // Handle individual evaluator error
        const errorMessage = getErrText(error) || 'Evaluator execution failed';
        const evaluatorName = evaluator.metric.name || `Evaluator ${i + 1}`;
        errors.push({ evaluatorName, error: errorMessage });
      }
    }

    // After all evaluators, check if there were any errors
    if (errors.length > 0) {
      const errorMessage = `Evaluator errors: ${errors.map((e) => `${e.evaluatorName}: ${e.error}`).join('; ')}`;
      const aggregatedError = new Error(errorMessage);
      // 使用新的 BullMQ 错误类型
      throw createEvaluationError(aggregatedError, 'EvaluatorExecute', {
        evalId,
        evalItemId
      });
    }

    // 3. Calculate aggregate score for this evaluation item
    const aggregateScore = await calculateEvaluationItemAggregateScore(evalItemId);

    // 4. Store results including aggregateScore
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      {
        $set: {
          targetOutput: targetOutput,
          evaluatorOutputs: evaluatorOutputs,
          aggregateScore: aggregateScore,
          finishTime: new Date()
        },
        $unset: {
          errorMessage: 1 // Clear any previous error message
        }
      }
    );

    // Report final progress
    await job.updateProgress(100);

    const scores = evaluatorOutputs
      .map((output) => output?.data?.score)
      .filter((score) => score !== undefined);
    addLog.debug(
      `[Evaluation] Evaluation item completed: ${evalItemId}, scores: [${scores.join(', ')}], aggregateScore: ${aggregateScore}`
    );
  } catch (error) {
    // Save error message to evaluation item before throwing
    try {
      await MongoEvalItem.updateOne(
        { _id: new Types.ObjectId(evalItemId) },
        {
          $set: {
            errorMessage: getErrText(error),
            finishTime: new Date()
          }
        }
      );
    } catch (updateError) {
      addLog.warn(`[Evaluation] Failed to save error message for item: ${evalItemId}`, {
        updateError: getErrText(updateError)
      });
    }

    // 抛出错误，让 BullMQ 处理重试逻辑
    throw error;
  }
};

// Initialize worker
export const initEvalTaskWorker = () => {
  return getEvaluationTaskWorker(evaluationTaskProcessor);
};

export const initEvalTaskItemWorker = () => {
  return getEvaluationItemWorker(evaluationItemProcessor);
};

// Export for testing
export { evaluationTaskProcessor, evaluationItemProcessor };
