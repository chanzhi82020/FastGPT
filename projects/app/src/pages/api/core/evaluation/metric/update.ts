import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  UpdateMetricRequest,
  UpdateMetricResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationParams } from '@fastgpt/global/core/evaluation/utils';
import { validateEvaluationMetricWrite } from '@fastgpt/service/core/evaluation/common';

async function handler(req: ApiRequestProps<UpdateMetricRequest>): Promise<UpdateMetricResponse> {
  try {
    const { metricId, name, description, config, dependencies } = req.body;

    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    // Validate name and description with common validation utility
    const paramValidation = validateEvaluationParams(
      { name, description },
      { namePrefix: 'Metric' }
    );
    if (!paramValidation.success) {
      return Promise.reject(paramValidation.message);
    }

    // API层权限验证: 评估指标写权限
    const { teamId } = await validateEvaluationMetricWrite(metricId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    await EvaluationMetricService.updateMetric(
      metricId,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(config !== undefined && { config }),
        ...(dependencies !== undefined && { dependencies })
      },
      teamId
    );

    addLog.info('[Evaluation Metric] Metric updated successfully', {
      metricId: metricId,
      updates: { name, description, hasConfig: config !== undefined }
    });

    return { message: 'Metric updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to update metric', {
      metricId: req.query.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
