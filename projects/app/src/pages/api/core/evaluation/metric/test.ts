import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { EvalInput, EvalOutput, MetricResult } from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type TestMetricBody = {
  metricId: string;
  testInput: EvalInput;
  testOutput: EvalOutput;
};

export type TestMetricResponse = MetricResult;

async function handler(req: ApiRequestProps<TestMetricBody>) {
  try {
    if (req.method !== 'POST') {
      return Promise.reject('Method not allowed');
    }

    const { metricId, testInput, testOutput } = req.body;

    // 验证必填字段
    if (!metricId) {
      return Promise.reject('Metric ID is required');
    }

    if (!testInput) {
      return Promise.reject('Test input is required');
    }

    if (!testOutput) {
      return Promise.reject('Test output is required');
    }

    // 验证测试输入格式
    if (!testInput.question) {
      return Promise.reject('Test input must include question');
    }

    if (!testInput.expectedResponse) {
      return Promise.reject('Test input must include expectedResponse');
    }

    // 验证测试输出格式
    if (!testOutput.response) {
      return Promise.reject('Test output must include response');
    }

    const result = await EvaluationMetricService.testMetric(metricId, testInput, testOutput, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Metric] 指标测试成功', {
      metricId,
      score: result.score,
      hasError: !!result.error
    });

    return result;
  } catch (error) {
    addLog.error('[Evaluation Metric] 指标测试失败', {
      metricId: req.body?.metricId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
