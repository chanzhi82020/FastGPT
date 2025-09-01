import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  DeleteMetricRequest,
  DeleteMetricResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationMetricWrite } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, DeleteMetricRequest>
): Promise<DeleteMetricResponse> {
  try {
    const { metricId } = req.query;

    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    // API层权限验证: 评估指标写权限
    const { teamId } = await validateEvaluationMetricWrite(metricId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    await EvaluationMetricService.deleteMetric(metricId, teamId);

    addLog.info('[Evaluation Metric] Metric deleted successfully', {
      metricId: metricId
    });

    return { message: 'Metric deleted successfully' };
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to delete metric', {
      metricId: req.query.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
