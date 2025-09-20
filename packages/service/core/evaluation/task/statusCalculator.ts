import { addLog } from '../../../common/system/log';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { evaluationTaskQueue, evaluationItemQueue } from './mq';
import { MongoEvaluation, MongoEvalItem } from './schema';
import { Types } from 'mongoose';

/**
 * 评估任务状态计算器
 * 参考数据集集合的 getCollectionStatus 实现
 * 从 job queue 实时计算状态，不依赖数据库状态字段
 */

/**
 * 计算评估任务的实时状态
 * 基于任务队列中的job状态来确定评估任务状态
 */
export async function getEvaluationTaskStatus(evalId: string): Promise<EvaluationStatusEnum> {
  try {
    // 获取任务相关的jobs
    const taskJobs = await evaluationTaskQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedTaskJobs = taskJobs.filter((job) => job.data.evalId === evalId);

    // 如果没有任务job，检查是否有评估项jobs
    if (relatedTaskJobs.length === 0) {
      return await getEvaluationTaskStatusFromItems(evalId);
    }

    // 简化：直接使用getState()获取状态，按优先级排序
    const jobStates = await Promise.all(relatedTaskJobs.map(async (job) => await job.getState()));

    // 按优先级返回状态 (evaluating > error > queuing > completed)
    if (jobStates.includes('active')) {
      return EvaluationStatusEnum.evaluating;
    }

    if (jobStates.includes('failed')) {
      return EvaluationStatusEnum.error;
    }

    if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
      return EvaluationStatusEnum.queuing;
    }

    // 如果任务job都完成了，检查评估项的状态
    return await getEvaluationTaskStatusFromItems(evalId);
  } catch (error) {
    addLog.error('Error getting evaluation task status:', { evalId, error });
    return EvaluationStatusEnum.error;
  }
}

/**
 * 通过评估项jobs来计算评估任务状态
 */
async function getEvaluationTaskStatusFromItems(evalId: string): Promise<EvaluationStatusEnum> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedItemJobs = itemJobs.filter((job) => job.data.evalId === evalId);

    // 如果没有评估项jobs，需要判断任务是否已完成
    // 通过检查数据库中是否有finishTime来区分queuing和completed状态
    if (relatedItemJobs.length === 0) {
      try {
        const evaluation = await MongoEvaluation.findById(new Types.ObjectId(evalId), {
          finishTime: 1
        });
        if (evaluation?.finishTime) {
          return EvaluationStatusEnum.completed;
        }
        return EvaluationStatusEnum.queuing;
      } catch {
        return EvaluationStatusEnum.queuing;
      }
    }

    // 简化：直接使用getState()获取状态
    const itemJobStates = await Promise.all(
      relatedItemJobs.map(async (job) => await job.getState())
    );

    // 按优先级返回状态 (evaluating > error > queuing > completed)
    if (itemJobStates.includes('active')) {
      return EvaluationStatusEnum.evaluating;
    }

    if (itemJobStates.includes('failed')) {
      return EvaluationStatusEnum.error;
    }

    if (itemJobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
      return EvaluationStatusEnum.queuing;
    }

    if (itemJobStates.includes('completed')) {
      return EvaluationStatusEnum.completed;
    }

    // 默认状态
    return EvaluationStatusEnum.completed;
  } catch (error) {
    addLog.error('Error getting evaluation task status from items:', { evalId, error });
    return EvaluationStatusEnum.error;
  }
}

/**
 * 计算评估项的实时状态
 */
export async function getEvaluationItemStatus(evalItemId: string): Promise<EvaluationStatusEnum> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedJobs = itemJobs.filter((job) => job.data.evalItemId === evalItemId);

    // 如果没有相关jobs，需要通过数据库状态判断是未开始还是已完成
    if (relatedJobs.length === 0) {
      try {
        const evalItem = await MongoEvalItem.findById(new Types.ObjectId(evalItemId), {
          finishTime: 1,
          errorMessage: 1
        });
        if (evalItem?.finishTime) {
          return evalItem.errorMessage
            ? EvaluationStatusEnum.error
            : EvaluationStatusEnum.completed;
        }
        return EvaluationStatusEnum.queuing;
      } catch {
        return EvaluationStatusEnum.queuing;
      }
    }

    // 简化：直接使用getState()获取状态，取最高优先级状态
    const jobStates = await Promise.all(relatedJobs.map(async (job) => await job.getState()));

    // 按优先级返回状态 (evaluating > error > queuing > completed)
    if (jobStates.includes('active')) {
      return EvaluationStatusEnum.evaluating;
    }

    if (jobStates.includes('failed')) {
      return EvaluationStatusEnum.error;
    }

    if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
      return EvaluationStatusEnum.queuing;
    }

    if (jobStates.includes('completed')) {
      return EvaluationStatusEnum.completed;
    }

    return EvaluationStatusEnum.queuing;
  } catch (error) {
    addLog.error('Error getting evaluation item status:', { evalItemId, error });
    return EvaluationStatusEnum.error;
  }
}

/**
 * 批量计算评估项状态
 * 优化性能，一次查询获取多个评估项状态
 */
export async function getBatchEvaluationItemStatus(
  evalItemIds: string[]
): Promise<Map<string, EvaluationStatusEnum>> {
  const statusMap = new Map<string, EvaluationStatusEnum>();

  try {
    // 一次性获取所有相关jobs，减少查询次数
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    // 先查询数据库状态，用于区分queuing和completed
    const evalItems = await MongoEvalItem.find(
      { _id: { $in: evalItemIds.map((id) => new Types.ObjectId(id)) } },
      { finishTime: 1, errorMessage: 1 }
    );

    const itemStatusByDb = new Map<string, EvaluationStatusEnum>();
    evalItems.forEach((item) => {
      const itemId = item._id.toString();
      if (item.finishTime) {
        itemStatusByDb.set(
          itemId,
          item.errorMessage ? EvaluationStatusEnum.error : EvaluationStatusEnum.completed
        );
      } else {
        itemStatusByDb.set(itemId, EvaluationStatusEnum.queuing);
      }
    });

    // 为每个evalItemId初始化默认状态（基于数据库状态）
    evalItemIds.forEach((id) => {
      statusMap.set(id, itemStatusByDb.get(id) || EvaluationStatusEnum.queuing);
    });

    // 按evalItemId分组jobs，并批量获取状态
    const jobsByItemId = new Map<string, any[]>();
    itemJobs.forEach((job) => {
      if (evalItemIds.includes(job.data.evalItemId)) {
        const itemId = job.data.evalItemId;
        if (!jobsByItemId.has(itemId)) {
          jobsByItemId.set(itemId, []);
        }
        jobsByItemId.get(itemId)!.push(job);
      }
    });

    // 优化：批量获取所有job状态，减少异步调用
    const allJobsToCheck = Array.from(jobsByItemId.values()).flat();
    const allJobStates = await Promise.all(
      allJobsToCheck.map(async (job) => ({
        job,
        state: await job.getState()
      }))
    );

    // 创建job到状态的映射
    const jobStateMap = new Map<any, string>();
    allJobStates.forEach(({ job, state }) => {
      jobStateMap.set(job, state);
    });

    // 计算每个评估项的状态（如果有jobs，优先使用job状态）
    for (const [itemId, jobs] of jobsByItemId.entries()) {
      const jobStates = jobs.map((job) => jobStateMap.get(job)!);

      // 按优先级确定状态 (evaluating > error > queuing > completed)
      let status = EvaluationStatusEnum.queuing;

      if (jobStates.includes('active')) {
        status = EvaluationStatusEnum.evaluating;
      } else if (jobStates.includes('failed')) {
        status = EvaluationStatusEnum.error;
      } else if (jobStates.some((state) => ['waiting', 'delayed', 'prioritized'].includes(state))) {
        status = EvaluationStatusEnum.queuing;
      } else if (jobStates.includes('completed')) {
        status = EvaluationStatusEnum.completed;
      }

      statusMap.set(itemId, status);
    }
  } catch (error) {
    addLog.error('Error getting batch evaluation item status:', { evalItemIds, error });
    // 如果出错，保持默认状态
  }

  return statusMap;
}

/**
 * 获取评估任务的统计信息
 * 替代原来基于数据库status字段的统计
 */
export async function getEvaluationTaskStats(evalId: string): Promise<{
  total: number;
  completed: number;
  evaluating: number;
  queuing: number;
  error: number;
}> {
  try {
    // 获取所有evaluation items从数据库
    const allEvalItems = await MongoEvalItem.find(
      { evalId: new Types.ObjectId(evalId) },
      { _id: 1, finishTime: 1, errorMessage: 1 }
    ).lean();

    const totalItems = allEvalItems.length;

    if (totalItems === 0) {
      return {
        total: 0,
        completed: 0,
        evaluating: 0,
        queuing: 0,
        error: 0
      };
    }

    // 获取job队列中的相关jobs
    const itemJobs = await evaluationItemQueue.getJobs([
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed'
    ]);

    const relatedJobs = itemJobs.filter((job) => job.data.evalId === evalId);

    // 创建job ID到evaluation item ID的映射
    const jobsByItemId = new Map<string, any>();
    relatedJobs.forEach((job) => {
      if (job.data.evalItemId) {
        jobsByItemId.set(job.data.evalItemId, job);
      }
    });

    // 统计各种状态
    let completed = 0;
    let evaluating = 0;
    let queuing = 0;
    let error = 0;

    // 优化：批量获取所有job状态，避免在循环中多次异步调用
    const jobsToCheck = Array.from(jobsByItemId.values());
    const jobStatesWithJobs = await Promise.all(
      jobsToCheck.map(async (job) => ({
        job,
        state: await job.getState()
      }))
    );

    // 创建job到状态的映射
    const jobStateMap = new Map<any, string>();
    jobStatesWithJobs.forEach(({ job, state }) => {
      jobStateMap.set(job, state);
    });

    // 为每个evaluation item计算状态（同步循环，避免并发修改计数器）
    for (const item of allEvalItems) {
      const itemId = item._id.toString();
      const job = jobsByItemId.get(itemId);

      if (job) {
        // 有对应job，根据job状态判断
        const jobState = jobStateMap.get(job);

        // 直接映射job状态到评估状态
        if (jobState === 'active') {
          evaluating++;
        } else if (jobState === 'failed') {
          error++;
        } else if (jobState === 'completed') {
          completed++;
        } else if (['waiting', 'delayed', 'prioritized'].includes(jobState || '')) {
          queuing++;
        } else {
          // 未知job状态，根据数据库状态判断
          if (item.finishTime) {
            if (item.errorMessage) {
              error++;
            } else {
              completed++;
            }
          } else {
            queuing++;
          }
        }
      } else {
        // 没有对应job，根据数据库状态判断
        if (item.finishTime) {
          if (item.errorMessage) {
            error++;
          } else {
            completed++;
          }
        } else {
          queuing++;
        }
      }
    }

    const stats = {
      total: totalItems,
      completed,
      evaluating,
      queuing,
      error
    };

    addLog.debug(`Evaluation task stats calculated from items and jobs:`, { evalId, stats });

    return stats;
  } catch (error) {
    addLog.error('Error getting evaluation task stats:', { evalId, error });
    return {
      total: 0,
      completed: 0,
      evaluating: 0,
      queuing: 0,
      error: 0
    };
  }
}

/**
 * 检查评估任务或评估项的job是否活跃
 * 复用质量评测的状态检查逻辑
 */
export async function checkEvaluationTaskJobActive(evalId: string): Promise<boolean> {
  try {
    const taskJobs = await evaluationTaskQueue.getJobs(['waiting', 'delayed', 'active']);
    const itemJobs = await evaluationItemQueue.getJobs(['waiting', 'delayed', 'active']);

    const hasActiveTaskJob = taskJobs.some((job) => job.data.evalId === evalId);
    const hasActiveItemJob = itemJobs.some((job) => job.data.evalId === evalId);

    return hasActiveTaskJob || hasActiveItemJob;
  } catch (error) {
    addLog.error('Error checking evaluation job active status:', { evalId, error });
    return false;
  }
}

/**
 * 检查评估项的job是否活跃
 */
export async function checkEvaluationItemJobActive(evalItemId: string): Promise<boolean> {
  try {
    const itemJobs = await evaluationItemQueue.getJobs(['waiting', 'delayed', 'active']);
    return itemJobs.some((job) => job.data.evalItemId === evalItemId);
  } catch (error) {
    addLog.error('Error checking evaluation item job active status:', { evalItemId, error });
    return false;
  }
}
