import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { addLog } from '@fastgpt/service/common/system/log';

export type RestartEvaluationBody = {
  evaluationId: string;
};

export type RestartEvaluationResponse = {
  message: string;
};

async function handler(req: ApiRequestProps<RestartEvaluationBody>) {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { evaluationId } = req.body;

    if (!evaluationId) {
      return Promise.reject('Evaluation ID is required');
    }

    await EvaluationTaskService.restartEvaluation(evaluationId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] 评估任务重启成功', {
      evaluationId
    });

    return { message: 'Evaluation restarted successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 重启评估任务失败', {
      evaluationId: req.body?.evaluationId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
