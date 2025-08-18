import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTargetService } from '@fastgpt/service/core/evaluation/target';
import { addLog } from '@fastgpt/service/common/system/log';

export type TargetDeleteQuery = {
  id: string;
};

export type DeleteTargetResponse = { message: string };

async function handler(req: ApiRequestProps<{}, TargetDeleteQuery>): Promise<DeleteTargetResponse> {
  try {
    const { id } = req.query;

    if (!id) {
      return Promise.reject('Target ID is required');
    }

    await EvaluationTargetService.deleteTarget(id, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Target] 目标删除成功', {
      targetId: id
    });

    return { message: 'Target deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation Target] 删除目标失败', {
      targetId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
