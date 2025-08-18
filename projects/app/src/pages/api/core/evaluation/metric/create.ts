import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type {
  CreateMetricParams,
  EvalMetricSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type CreateMetricBody = CreateMetricParams;
export type CreateMetricResponse = EvalMetricSchemaType;

async function handler(req: ApiRequestProps<CreateMetricBody>) {
  try {
    const { name, description, type, config } = req.body;

    // 验证必填字段
    if (!name?.trim()) {
      return Promise.reject('Metric name is required');
    }

    if (!type) {
      return Promise.reject('Metric type is required');
    }

    if (!config) {
      return Promise.reject('Metric config is required');
    }

    // 验证类型和配置匹配
    switch (type) {
      case 'http':
        const httpConfig = config as any;
        if (!httpConfig.url?.trim()) {
          return Promise.reject('HTTP metric requires a valid URL');
        }
        if (!httpConfig.method || !['GET', 'POST', 'PUT', 'DELETE'].includes(httpConfig.method)) {
          return Promise.reject('HTTP metric requires a valid method');
        }
        if (httpConfig.timeout && (httpConfig.timeout < 1000 || httpConfig.timeout > 300000)) {
          return Promise.reject('HTTP timeout must be between 1000ms and 300000ms');
        }
        break;

      case 'function':
        const functionConfig = config as any;
        if (!functionConfig.code?.trim()) {
          return Promise.reject('Function metric requires code');
        }
        if (
          functionConfig.timeout &&
          (functionConfig.timeout < 1000 || functionConfig.timeout > 60000)
        ) {
          return Promise.reject('Function timeout must be between 1000ms and 60000ms');
        }
        break;

      case 'ai_model':
        const aiConfig = config as any;
        if (!aiConfig.model?.trim()) {
          return Promise.reject('AI model metric requires a model name');
        }
        if (!aiConfig.prompt?.trim()) {
          return Promise.reject('AI model metric requires a prompt');
        }
        break;

      default:
        return Promise.reject(`Unknown metric type: ${type}`);
    }

    const metric = await EvaluationMetricService.createMetric(
      {
        name: name.trim(),
        description: description?.trim(),
        type,
        config
      },
      {
        req,
        authToken: true
      }
    );

    addLog.info('[Evaluation Metric] 指标创建成功', {
      metricId: metric._id,
      name: metric.name,
      type: metric.type
    });

    return metric;
  } catch (error) {
    addLog.error('[Evaluation Metric] 创建指标失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
