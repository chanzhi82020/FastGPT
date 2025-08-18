import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTargetService } from '@fastgpt/service/core/evaluation/target';
import { addLog } from '@fastgpt/service/common/system/log';

export type TestTargetBody = {
  targetId: string;
};

export type TestTargetResponse = {
  success: boolean;
  message: string;
};

async function handler(req: ApiRequestProps<TestTargetBody>) {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { targetId } = req.body;

    // 验证必填字段
    if (!targetId) {
      return Promise.reject('Target ID is required');
    }

    const result = await EvaluationTargetService.testTarget(targetId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Target] 目标测试完成', {
      targetId,
      success: result.success,
      message: result.message
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation Target] 目标测试失败', {
      targetId: req.body?.targetId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
