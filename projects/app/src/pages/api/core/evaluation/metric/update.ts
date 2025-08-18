import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { CreateMetricParams } from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type MetricUpdateQuery = {
  id: string;
};

export type UpdateMetricBody = Partial<CreateMetricParams>;

export type UpdateMetricResponse = { message: string };

async function handler(
  req: ApiRequestProps<UpdateMetricBody, MetricUpdateQuery>
): Promise<UpdateMetricResponse> {
  try {
    const { id } = req.query;
    const { name, description, config } = req.body;

    if (!id) {
      return Promise.reject('Metric ID is required');
    }

    const auth = {
      req,
      authToken: true
    };

    // 验证更新参数
    if (name !== undefined && !name?.trim()) {
      return Promise.reject('Metric name cannot be empty');
    }

    // 如果更新配置，需要验证配置格式
    if (config !== undefined) {
      // 先获取当前指标以确定类型
      const currentMetric = await EvaluationMetricService.getMetric(id, auth);
      const configAny = config as any;

      switch (currentMetric.type) {
        case 'http':
          if (configAny.url !== undefined && !configAny.url?.trim()) {
            return Promise.reject('HTTP metric requires a valid URL');
          }
          if (
            configAny.method !== undefined &&
            !['GET', 'POST', 'PUT', 'DELETE'].includes(configAny.method)
          ) {
            return Promise.reject('HTTP metric requires a valid method');
          }
          if (
            configAny.timeout !== undefined &&
            (configAny.timeout < 1000 || configAny.timeout > 300000)
          ) {
            return Promise.reject('HTTP timeout must be between 1000ms and 300000ms');
          }
          break;

        case 'function':
          if (configAny.code !== undefined && !configAny.code?.trim()) {
            return Promise.reject('Function metric requires code');
          }
          if (
            configAny.timeout !== undefined &&
            (configAny.timeout < 1000 || configAny.timeout > 60000)
          ) {
            return Promise.reject('Function timeout must be between 1000ms and 60000ms');
          }
          break;

        case 'ai_model':
          if (configAny.model !== undefined && !configAny.model?.trim()) {
            return Promise.reject('AI model metric requires a model name');
          }
          if (configAny.prompt !== undefined && !configAny.prompt?.trim()) {
            return Promise.reject('AI model metric requires a prompt');
          }
          break;
      }
    }

    await EvaluationMetricService.updateMetric(
      id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(config !== undefined && { config })
      },
      auth
    );

    addLog.info('[Evaluation Metric] 指标更新成功', {
      metricId: id,
      updates: { name, description, hasConfig: config !== undefined }
    });

    return { message: 'Metric updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation Metric] 更新指标失败', {
      metricId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
