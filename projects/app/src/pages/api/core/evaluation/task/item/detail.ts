import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvalItemSchemaType } from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type EvaluationItemDetailQuery = {
  id: string;
};

export type EvaluationItemDetailResponse = {
  item: EvalItemSchemaType;
  dataItem: any;
  response?: string;
  metricResults: any[];
  score?: number;
};

async function handler(
  req: ApiRequestProps<{}, EvaluationItemDetailQuery>
): Promise<EvaluationItemDetailResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Evaluation item ID is required');
    }

    const result = await EvaluationTaskService.getEvaluationItemResult(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] 评估项详情查询成功', {
      evalItemId: id,
      hasResponse: !!result.response,
      score: result.score
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation] 查询评估项详情失败', {
      evalItemId: req.query?.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
