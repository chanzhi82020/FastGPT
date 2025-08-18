import { addLog } from '../../../common/system/log';
import type { Job } from '../../../common/bullmq';
import {
  evaluationTaskQueue,
  evaluationItemQueue,
  getEvaluationTaskWorker,
  getEvaluationItemWorker,
  type EvaluationTaskJobData,
  type EvaluationItemJobData
} from '../mq';
import { MongoEvaluation, MongoEvalItem } from '../task/schema';
import { MongoEvalDataset } from '../dataset/schema';
import { MongoEvalTarget } from '../target/schema';
import { MongoEvalMetric } from '../metric/schema';
import { createTargetInstance } from '../target';
import { createMetricInstance } from '../metric';
import { Types } from 'mongoose';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { checkTeamAIPoints } from '../../../support/permission/teamLimit';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { concatUsage } from '../../../support/wallet/usage/controller';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { MetricResult } from '@fastgpt/global/core/evaluation/type';

// 初始化评估 Workers
export const initEvaluationWorkers = () => {
  addLog.info('Init Evaluation Workers...');

  const taskWorker = getEvaluationTaskWorker(evaluationTaskProcessor);
  const itemWorker = getEvaluationItemWorker(evaluationItemProcessor);

  return { taskWorker, itemWorker };
};

// 处理 AI Points 不足错误
const handleAiPointsError = async (evalId: string, error: any) => {
  if (error === TeamErrEnum.aiPointsNotEnough) {
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          errorMessage: 'AI Points 余额不足，评估已暂停',
          status: EvaluationStatusEnum.queuing // 保持排队状态，可以后续恢复
        }
      }
    );

    // TODO: 发送通知给团队
    addLog.warn(`[Evaluation] AI Points不足，评估任务暂停: ${evalId}`);
    return;
  }

  throw error;
};

// 完成评估任务
const finishEvaluationTask = async (evalId: string) => {
  try {
    // 计算所有完成项的平均分数
    const scoreResult = await MongoEvalItem.aggregate([
      {
        $match: {
          evalId: new Types.ObjectId(evalId),
          status: EvaluationStatusEnum.completed,
          score: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$score' },
          completedCount: { $sum: 1 }
        }
      }
    ]);

    const avgScore = scoreResult.length > 0 ? scoreResult[0].avgScore : 0;
    const completedCount = scoreResult.length > 0 ? scoreResult[0].completedCount : 0;

    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          finishTime: new Date(),
          avgScore: Math.round(avgScore * 100) / 100, // 保留两位小数
          status: EvaluationStatusEnum.completed
        }
      }
    );

    addLog.info(`[Evaluation] 任务完成: ${evalId}, 平均分: ${avgScore}, 完成数: ${completedCount}`);
  } catch (error) {
    addLog.error(`[Evaluation] 完成任务时发生错误: ${evalId}`, error);
  }
};

// 处理评估项错误
const handleEvalItemError = async (evalItemId: string, error: any) => {
  const errorMessage = getErrText(error);

  await MongoEvalItem.updateOne(
    { _id: new Types.ObjectId(evalItemId) },
    {
      $inc: { retry: -1 },
      $set: {
        errorMessage,
        status: EvaluationStatusEnum.queuing // 重置为排队状态以便重试
      }
    }
  );

  addLog.error(`[Evaluation] 评估项处理失败: ${evalItemId}`, error);
};

// 创建合并的评估用量记录
const createMergedEvaluationUsage = async (params: {
  evalId: string;
  teamId: string;
  tmbId: string;
  usageId: string;
  totalPoints: number;
  type: 'target' | 'metric';
  inputTokens?: number;
  outputTokens?: number;
}) => {
  const { evalId, teamId, tmbId, usageId, totalPoints, type, inputTokens, outputTokens } = params;

  const listIndex = type === 'target' ? 0 : 1;

  await concatUsage({
    billId: usageId,
    teamId,
    tmbId,
    totalPoints,
    inputTokens: inputTokens || 0,
    outputTokens: outputTokens || 0,
    count: type === 'target' ? 1 : 0,
    listIndex
  });

  addLog.debug(`[Evaluation] 记录用量: ${evalId}, ${type}, ${totalPoints}点`);
};

// 评估任务处理器
const evaluationTaskProcessor = async (job: Job<EvaluationTaskJobData>) => {
  const { evalId, datasetId, targetId, metricIds } = job.data;

  addLog.info(`[Evaluation] 开始处理评估任务: ${evalId}`);

  try {
    // 验证评估任务存在
    const evaluation = await MongoEvaluation.findById(evalId);
    if (!evaluation) {
      addLog.warn(`[Evaluation] 评估任务不存在: ${evalId}`);
      return;
    }

    // 加载配置（在 worker 环境中直接使用数据库查询，不使用权限验证）
    const [dataset, target, metrics] = await Promise.all([
      MongoEvalDataset.findOne({
        _id: new Types.ObjectId(datasetId),
        teamId: evaluation.teamId
      }).lean(),
      MongoEvalTarget.findOne({
        _id: new Types.ObjectId(targetId),
        teamId: evaluation.teamId
      }).lean(),
      MongoEvalMetric.find({
        _id: { $in: metricIds.map((id) => new Types.ObjectId(id)) },
        teamId: evaluation.teamId
      }).lean()
    ]);

    if (!dataset || !target || metrics.length === 0) {
      throw new Error('配置数据加载失败');
    }

    // 创建评估项
    const evalItems = dataset.dataItems.map((dataItem) => ({
      evalId,
      dataItem,
      targetId,
      metricIds,
      status: EvaluationStatusEnum.queuing,
      retry: 3,
      metricResults: []
    }));

    // 批量插入评估项
    const insertedItems = await MongoEvalItem.insertMany(evalItems);

    // 提交到评估项队列进行并发处理
    const jobs = insertedItems.map((item, index) => ({
      name: `eval_item_${evalId}_${index}`,
      data: {
        evalId,
        evalItemId: item._id.toString(),
        dataItem: item.dataItem,
        targetConfig: target,
        metricsConfig: metrics
      },
      opts: {
        delay: index * 100 // 添加小延迟避免同时启动过多任务
      }
    }));

    await evaluationItemQueue.addBulk(jobs);

    addLog.info(`[Evaluation] 任务分解完成: ${evalId}, 生成 ${jobs.length} 个评估项`);
  } catch (error) {
    addLog.error(`[Evaluation] 任务处理失败: ${evalId}`, error);

    // 标记任务失败
    await MongoEvaluation.updateOne(
      { _id: new Types.ObjectId(evalId) },
      {
        $set: {
          errorMessage: getErrText(error),
          status: EvaluationStatusEnum.completed, // 标记为已完成（失败）
          finishTime: new Date()
        }
      }
    );
  }
};

// 评估项处理器
const evaluationItemProcessor = async (job: Job<EvaluationItemJobData>) => {
  const { evalId, evalItemId, dataItem, targetConfig, metricsConfig } = job.data;

  addLog.debug(`[Evaluation] 开始处理评估项: ${evalItemId}`);

  try {
    // 检查 AI Points
    await checkTeamAIPoints(targetConfig.teamId);

    // 更新状态为处理中
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      { $set: { status: EvaluationStatusEnum.evaluating } }
    );

    // 1. 调用评估目标
    const targetInstance = createTargetInstance(targetConfig);
    const output = await targetInstance.execute({
      question: dataItem.question,
      expectedResponse: dataItem.expectedResponse,
      globalVariables: dataItem.globalVariables,
      history: dataItem.history
    });

    // 记录目标调用的用量
    if (output.usage) {
      const evaluation = await MongoEvaluation.findById(evalId, 'teamId tmbId usageId');
      if (evaluation) {
        const totalPoints = output.usage.reduce(
          (sum: number, item: any) => sum + (item.totalPoints || 0),
          0
        );
        await createMergedEvaluationUsage({
          evalId,
          teamId: evaluation.teamId,
          tmbId: evaluation.tmbId,
          usageId: evaluation.usageId,
          totalPoints,
          type: 'target'
        });
      }
    }

    // 2. 执行评估指标
    const metricResults: MetricResult[] = [];
    let totalMetricPoints = 0;

    for (const metricConfig of metricsConfig) {
      try {
        const metricInstance = createMetricInstance(metricConfig);
        const result = await metricInstance.evaluate(dataItem, output);
        metricResults.push(result);

        // 如果是 AI 模型指标，记录用量
        if (metricConfig.type === 'ai_model' && result.details?.usage) {
          totalMetricPoints += result.details.usage.totalPoints || 0;
        }
      } catch (error) {
        // 单个指标失败不影响其他指标
        metricResults.push({
          metricId: metricConfig._id,
          metricName: metricConfig.name,
          score: 0,
          error: getErrText(error)
        });
      }
    }

    // 记录指标评估的用量
    if (totalMetricPoints > 0) {
      const evaluation = await MongoEvaluation.findById(evalId, 'teamId tmbId usageId');
      if (evaluation) {
        await createMergedEvaluationUsage({
          evalId,
          teamId: evaluation.teamId,
          tmbId: evaluation.tmbId,
          usageId: evaluation.usageId,
          totalPoints: totalMetricPoints,
          type: 'metric'
        });
      }
    }

    // 3. 计算综合分数
    const validResults = metricResults.filter((result) => !result.error && result.score > 0);
    const avgScore =
      validResults.length > 0
        ? validResults.reduce((sum, result) => sum + result.score, 0) / validResults.length
        : 0;

    // 4. 存储结果
    await MongoEvalItem.updateOne(
      { _id: new Types.ObjectId(evalItemId) },
      {
        $set: {
          response: output.response,
          responseTime: new Date(Date.now() - output.responseTime),
          status: EvaluationStatusEnum.completed,
          score: Math.round(avgScore * 100) / 100, // 保留两位小数
          metricResults,
          finishTime: new Date()
        }
      }
    );

    addLog.debug(`[Evaluation] 评估项完成: ${evalItemId}, 分数: ${avgScore}`);

    // 检查是否所有评估项都完成了
    const pendingCount = await MongoEvalItem.countDocuments({
      evalId: new Types.ObjectId(evalId),
      status: { $in: [EvaluationStatusEnum.queuing, EvaluationStatusEnum.evaluating] }
    });

    if (pendingCount === 0) {
      await finishEvaluationTask(evalId);
    }
  } catch (error) {
    await handleEvalItemError(evalItemId, error);

    // 如果是 AI Points 不足，暂停整个任务
    if (error === TeamErrEnum.aiPointsNotEnough) {
      await handleAiPointsError(evalId, error);
    }
  }
};
