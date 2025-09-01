import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import { createEvaluatorInstance } from '@fastgpt/service/core/evaluation/evaluator';
import type { TestMetricRequest, TestMetricResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationMetricRead } from '@fastgpt/service/core/evaluation/common';

async function handler(req: ApiRequestProps<TestMetricRequest>) {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { metricId, testCase } = req.body;

    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    if (!testCase) {
      return Promise.reject('Test case is required');
    }
    if (!testCase.userInput) {
      return Promise.reject('Test case must include userInput');
    }

    if (!testCase.expectedOutput) {
      return Promise.reject('Test case must include expectedOutput');
    }

    if (!testCase.actualOutput) {
      return Promise.reject('Test case must include actualOutput');
    }

    // API层权限验证: 评估指标读权限
    const { teamId } = await validateEvaluationMetricRead(metricId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    const metric = await EvaluationMetricService.getMetric(metricId, teamId);

    const evaluatorConfig = {
      metric,
      runtimeConfig: {}
    };

    const evaluatorInstance = createEvaluatorInstance(evaluatorConfig);
    const result = await evaluatorInstance.evaluate(testCase);

    addLog.info('[Evaluation Metric] Metric test completed successfully', {
      metricId,
      score: result.score
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to test metric', {
      metricId: req.body?.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
