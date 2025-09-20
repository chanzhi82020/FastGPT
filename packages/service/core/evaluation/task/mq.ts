import { addLog } from '../../../common/system/log';
import { getQueue, getWorker, QueueNames } from '../../../common/bullmq';
import { QueueEvents } from 'bullmq';
import { newQueueRedisConnection } from '../../../common/redis';
import type {
  EvaluationTaskJobData,
  EvaluationItemJobData
} from '@fastgpt/global/core/evaluation/type';
import {
  createJobCleaner,
  type JobCleanupResult,
  type JobCleanupOptions
} from '../utils/jobCleanup';

export const evaluationTaskQueue = getQueue<EvaluationTaskJobData>(QueueNames.evalTask, {
  defaultJobOptions: {
    attempts: 3, // 任务级别也启用重试
    backoff: {
      type: 'exponential',
      delay: 2000
    },
    removeOnComplete: 100,
    removeOnFail: 100
  }
});

export const evaluationItemQueue = getQueue<EvaluationItemJobData>(QueueNames.evalTaskItem, {
  defaultJobOptions: {
    attempts: 4, // 启用重试：最多尝试 4 次（1次初始执行 + 3次重试）
    backoff: {
      type: 'exponential',
      delay: 1000 // 起始延迟 1秒，指数退避
    },
    removeOnComplete: 500,
    removeOnFail: 500
  }
});

// 使用 QueueEvents 监听失败事件进行日志记录
const evaluationItemQueueEvents = new QueueEvents(QueueNames.evalTaskItem, {
  connection: newQueueRedisConnection()
});
// Add completed event listener to trigger task completion check
evaluationItemQueueEvents.on('completed', async ({ jobId }) => {
  let job: any = null;

  try {
    job = await evaluationItemQueue.getJob(jobId);
    if (job?.data?.evalId) {
      addLog.debug('[Evaluation] Item completed, checking task completion', {
        jobId,
        evalId: job.data.evalId,
        evalItemId: job.data.evalItemId
      });

      // Import finishEvaluationTask dynamically to avoid circular dependency
      const { finishEvaluationTask } = await import('./processor');
      await finishEvaluationTask(job.data.evalId);
    }
  } catch (error) {
    addLog.error('[Evaluation] Error in completed event handler', {
      jobId,
      evalId: job?.data?.evalId,
      evalItemId: job?.data?.evalItemId,
      error
    });
  }
});

evaluationItemQueueEvents.on('failed', async ({ jobId, failedReason }) => {
  // Get job data first for better logging
  let evalId: string | undefined;
  let evalItemId: string | undefined;

  try {
    const job = await evaluationItemQueue.getJob(jobId);
    evalId = job?.data?.evalId;
    evalItemId = job?.data?.evalItemId;
  } catch (error) {
    addLog.warn('[Evaluation] Could not retrieve job data for failed job', { jobId, error });
  }

  // Check task completion on failure - failed items count toward task completion
  if (evalId) {
    try {
      addLog.debug('[Evaluation] Checking task completion after item failure', {
        jobId,
        evalId,
        evalItemId,
        failedReason
      });

      // Import finishEvaluationTask dynamically to avoid circular dependency
      const { finishEvaluationTask } = await import('./processor');
      await finishEvaluationTask(evalId);
    } catch (error) {
      addLog.error('[Evaluation] Error in failed event handler', {
        jobId,
        evalId,
        evalItemId,
        error
      });
    }
  }
});

// Add stalled event listener for better monitoring
evaluationItemQueueEvents.on('stalled', async ({ jobId }) => {
  try {
    const job = await evaluationItemQueue.getJob(jobId);
    addLog.warn('[Evaluation] Item job stalled, will be retried', {
      jobId,
      evalId: job?.data?.evalId,
      evalItemId: job?.data?.evalItemId
    });
  } catch (error) {
    addLog.warn('[Evaluation] Item job stalled, will be retried (could not get job data)', {
      jobId,
      error
    });
  }
});

const evaluationTaskQueueEvents = new QueueEvents(QueueNames.evalTask, {
  connection: newQueueRedisConnection()
});

evaluationTaskQueueEvents.on('failed', async ({ jobId, failedReason }) => {
  try {
    const job = await evaluationTaskQueue.getJob(jobId);
    addLog.error('[Evaluation] Task job failed after all retries', {
      jobId,
      evalId: job?.data?.evalId,
      failedReason
    });
  } catch (error) {
    addLog.error('[Evaluation] Task job failed after all retries (could not get job data)', {
      jobId,
      failedReason,
      error
    });
  }
});

// Add stalled event listener for task queue
evaluationTaskQueueEvents.on('stalled', async ({ jobId }) => {
  try {
    const job = await evaluationTaskQueue.getJob(jobId);
    addLog.warn('[Evaluation] Task job stalled, will be retried', {
      jobId,
      evalId: job?.data?.evalId
    });
  } catch (error) {
    addLog.warn('[Evaluation] Task job stalled, will be retried (could not get job data)', {
      jobId,
      error
    });
  }
});

export const getEvaluationTaskWorker = (processor: any) =>
  getWorker<EvaluationTaskJobData>(QueueNames.evalTask, processor, {
    concurrency: Number(process.env.EVAL_TASK_CONCURRENCY) || 3,
    stalledInterval: Number(process.env.EVAL_TASK_STALLED_INTERVAL) || 30000, // 30 seconds
    maxStalledCount: Number(process.env.EVAL_TASK_MAX_STALLED_COUNT) || 1 // BullMQ recommended default
  });

export const getEvaluationItemWorker = (processor: any) =>
  getWorker<EvaluationItemJobData>(QueueNames.evalTaskItem, processor, {
    concurrency: Number(process.env.EVAL_ITEM_CONCURRENCY) || 10,
    stalledInterval: Number(process.env.EVAL_ITEM_STALLED_INTERVAL) || 30000, // 30 seconds for faster recovery
    maxStalledCount: Number(process.env.EVAL_ITEM_MAX_STALLED_COUNT) || 1 // BullMQ recommended default
  });

export const removeEvaluationTaskJob = async (
  evalId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return String(job.data?.evalId) === String(evalId);
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evaluationTaskQueue,
    filterFn,
    QueueNames.evalTask
  );

  addLog.debug('Evaluation task jobs cleanup completed', {
    evalId,
    result
  });

  return result;
};

export const removeEvaluationItemJobs = async (
  evalId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return String(job.data?.evalId) === String(evalId);
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evaluationItemQueue,
    filterFn,
    QueueNames.evalTaskItem
  );

  addLog.debug('Evaluation item jobs cleanup completed', {
    evalId,
    result
  });

  return result;
};

export const removeEvaluationItemJobsByItemId = async (
  evalItemId: string,
  options?: JobCleanupOptions
): Promise<JobCleanupResult> => {
  const cleaner = createJobCleaner(options);

  const filterFn = (job: any) => {
    return String(job.data?.evalItemId) === String(evalItemId);
  };

  const result = await cleaner.cleanAllJobsByFilter(
    evaluationItemQueue,
    filterFn,
    QueueNames.evalTaskItem
  );

  addLog.debug('Evaluation item jobs cleanup completed for specific item', {
    evalItemId,
    result
  });

  return result;
};

// Job management functions following quality assessment pattern

/**
 * Add evaluation task job with deduplication
 * 参考质量评测的 addEvalDatasetDataQualityJob 实现
 */
export const addEvaluationTaskJob = (data: EvaluationTaskJobData) => {
  const evalId = String(data.evalId);

  return evaluationTaskQueue.add(evalId, data, { deduplication: { id: evalId } });
};

/**
 * Add evaluation item job with deduplication
 * 使用 evalItemId 作为去重标识
 */
export const addEvaluationItemJob = (data: EvaluationItemJobData, options?: { delay?: number }) => {
  const evalItemId = String(data.evalItemId);

  return evaluationItemQueue.add(`eval_item_${evalItemId}`, data, {
    deduplication: { id: evalItemId },
    ...options
  });
};

/**
 * Add multiple evaluation item jobs with deduplication and optional delays
 * 批量添加评估项作业，支持去重和延迟
 */
export const addEvaluationItemJobs = (
  jobs: Array<{
    data: EvaluationItemJobData;
    delay?: number;
  }>
) => {
  const bulkJobs = jobs.map(({ data, delay }, index) => {
    const evalItemId = String(data.evalItemId);
    return {
      name: `eval_item_${evalItemId}`,
      data,
      opts: {
        delay: delay ?? index * 100, // Default small delay to avoid overwhelming the system
        deduplication: { id: evalItemId }
      }
    };
  });

  return evaluationItemQueue.addBulk(bulkJobs);
};

/**
 * Check if evaluation task job is active
 * 参考质量评测的 checkEvalDatasetDataQualityJobActive 实现
 */
export const checkEvaluationTaskJobActive = async (evalId: string): Promise<boolean> => {
  try {
    const jobId = await evaluationTaskQueue.getDeduplicationJobId(String(evalId));
    if (!jobId) return false;

    const job = await evaluationTaskQueue.getJob(jobId);
    if (!job) return false;

    const jobState = await job.getState();
    return ['waiting', 'delayed', 'prioritized', 'active'].includes(jobState);
  } catch (error) {
    addLog.error('[Evaluation] Failed to check task job status', { evalId, error });
    return false;
  }
};

/**
 * Check if evaluation item job is active
 */
export const checkEvaluationItemJobActive = async (evalItemId: string): Promise<boolean> => {
  try {
    const jobId = await evaluationItemQueue.getDeduplicationJobId(String(evalItemId));
    if (!jobId) return false;

    const job = await evaluationItemQueue.getJob(jobId);
    if (!job) return false;

    const jobState = await job.getState();
    return ['waiting', 'delayed', 'prioritized', 'active'].includes(jobState);
  } catch (error) {
    addLog.error('[Evaluation] Failed to check item job status', { evalItemId, error });
    return false;
  }
};
