import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { checkTeamAIPoints } from '@fastgpt/service/support/permission/teamLimit';
import type {
  CreateEvaluationParams,
  EvaluationSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export type CreateEvaluationBody = CreateEvaluationParams;
export type CreateEvaluationResponse = EvaluationSchemaType;

async function handler(
  req: ApiRequestProps<CreateEvaluationBody>
): Promise<CreateEvaluationResponse> {
  try {
    const { teamId } = await authCert({ req, authToken: true });
    const { name, description, datasetId, targetId, metricIds } = req.body;

    // 验证必填字段
    if (!name?.trim()) {
      return Promise.reject('Evaluation name is required');
    }

    if (!datasetId) {
      return Promise.reject('Dataset ID is required');
    }

    if (!targetId) {
      return Promise.reject('Target ID is required');
    }

    if (!metricIds || !Array.isArray(metricIds) || metricIds.length === 0) {
      return Promise.reject('At least one metric is required');
    }

    // 检查 AI Points 余额
    await checkTeamAIPoints(teamId);

    // 创建评估任务
    const evaluation = await EvaluationTaskService.createEvaluation(
      {
        name: name.trim(),
        description: description?.trim(),
        datasetId,
        targetId,
        metricIds
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation] 评估任务创建成功', {
      evaluationId: evaluation._id,
      name: evaluation.name,
      datasetId,
      targetId,
      metricCount: metricIds.length
    });

    return evaluation;
  } catch (error) {
    addLog.error('[Evaluation] 创建评估任务失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
