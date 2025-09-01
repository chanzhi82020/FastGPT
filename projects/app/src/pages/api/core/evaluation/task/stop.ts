import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  StopEvaluationRequest,
  StopEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationTaskExecution } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<StopEvaluationRequest>
): Promise<StopEvaluationResponse> {
  try {
    const { evalId } = req.body;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    // API层权限验证: 评估任务执行权限
    const { teamId } = await validateEvaluationTaskExecution(evalId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    await EvaluationTaskService.stopEvaluation(evalId, teamId);

    addLog.info('[Evaluation] Evaluation task stopped successfully', {
      evalId
    });

    return { message: 'Evaluation stopped successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to stop evaluation task', {
      evalId: req.body?.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
