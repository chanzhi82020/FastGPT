import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  MetricDetailRequest,
  MetricDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationMetricRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, MetricDetailRequest>
): Promise<MetricDetailResponse> {
  try {
    const { metricId } = req.query;

    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    // API层权限验证: 评估指标读权限
    const { teamId } = await validateEvaluationMetricRead(metricId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    const metric = await EvaluationMetricService.getMetric(metricId, teamId);

    addLog.info('[Evaluation Metric] Metric details retrieved successfully', {
      metricId: metricId,
      name: metric.name,
      type: metric.type
    });

    return metric;
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to get metric details', {
      metricId: req.query.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
