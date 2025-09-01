import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type {
  DeleteEvaluationRequest,
  DeleteEvaluationResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationTaskWrite } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, DeleteEvaluationRequest>
): Promise<DeleteEvaluationResponse> {
  try {
    const { evalId } = req.query;

    if (!evalId) {
      return Promise.reject('Evaluation ID is required');
    }

    // API层权限验证: 评估任务写权限
    const { teamId } = await validateEvaluationTaskWrite(evalId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    await EvaluationTaskService.deleteEvaluation(evalId, teamId);

    addLog.info('[Evaluation] Evaluation task deleted successfully', {
      evalId: evalId
    });

    return { message: 'Evaluation deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation] Failed to delete evaluation task', {
      evalId: req.query.evalId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
