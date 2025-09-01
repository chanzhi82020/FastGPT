import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StatsEvaluationRequest,
  EvaluationStatsResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationTaskRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, StatsEvaluationRequest>
): Promise<EvaluationStatsResponse> {
  try {
    const { evalId } = req.query;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    // API层权限验证: 评估任务读权限
    const { teamId } = await validateEvaluationTaskRead(evalId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    const stats = await EvaluationTaskService.getEvaluationStats(evalId, teamId);

    addLog.info('[Evaluation] Evaluation task statistics query successful', {
      evalId,
      total: stats.total,
      completed: stats.completed,
      avgScore: stats.avgScore
    });

    return stats;
  } catch (error) {
    addLog.error('[Evaluation] Failed to query evaluation task statistics', {
      evalId: req.query?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
