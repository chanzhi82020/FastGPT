import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTargetService } from '@fastgpt/service/core/evaluation/target';
import type { EvalTargetSchemaType } from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type TargetDetailQuery = {
  id: string;
};

export type TargetDetailResponse = EvalTargetSchemaType;

async function handler(req: ApiRequestProps<{}, TargetDetailQuery>): Promise<TargetDetailResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Target ID is required');
    }

    const target = await EvaluationTargetService.getTarget(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Target] 目标详情查询成功', {
      targetId: id,
      name: target.name,
      type: target.type
    });

    return target;
  } catch (error) {
    addLog.error('[Evaluation Target] 获取目标详情失败', {
      targetId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
