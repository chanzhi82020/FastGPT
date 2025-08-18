import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTargetService } from '@fastgpt/service/core/evaluation/target';
import type { CreateTargetParams } from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type TargetUpdateQuery = {
  id: string;
};

export type UpdateTargetBody = Partial<CreateTargetParams>;

export type UpdateTargetResponse = { message: string };

async function handler(
  req: ApiRequestProps<UpdateTargetBody, TargetUpdateQuery>
): Promise<UpdateTargetResponse> {
  try {
    const { id } = req.query;
    const { name, description, config } = req.body;

    if (!id) {
      return Promise.reject('Target ID is required');
    }

    const auth = {
      req,
      authToken: true
    };

    // 验证更新参数
    if (name !== undefined && !name?.trim()) {
      return Promise.reject('Target name cannot be empty');
    }

    // 如果更新配置，需要验证配置格式
    if (config !== undefined) {
      // 先获取当前目标以确定类型
      const currentTarget = await EvaluationTargetService.getTarget(id, auth);
      const configAny = config as any;

      switch (currentTarget.type) {
        case 'workflow':
          if (configAny.appId !== undefined && !configAny.appId) {
            return Promise.reject('Workflow target requires an app ID');
          }
          break;

        case 'api':
          if (configAny.url !== undefined && !configAny.url?.trim()) {
            return Promise.reject('API target requires a valid URL');
          }
          if (
            configAny.method !== undefined &&
            !['GET', 'POST', 'PUT', 'DELETE'].includes(configAny.method)
          ) {
            return Promise.reject('API target requires a valid HTTP method');
          }
          if (
            configAny.timeout !== undefined &&
            (configAny.timeout < 1000 || configAny.timeout > 300000)
          ) {
            return Promise.reject('API timeout must be between 1000ms and 300000ms');
          }
          break;

        case 'function':
          if (configAny.code !== undefined && !configAny.code?.trim()) {
            return Promise.reject('Function target requires code');
          }
          if (
            configAny.timeout !== undefined &&
            (configAny.timeout < 1000 || configAny.timeout > 60000)
          ) {
            return Promise.reject('Function timeout must be between 1000ms and 60000ms');
          }
          break;
      }
    }

    await EvaluationTargetService.updateTarget(
      id,
      {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() }),
        ...(config !== undefined && { config })
      },
      auth
    );

    addLog.info('[Evaluation Target] 目标更新成功', {
      targetId: id,
      updates: { name, description, hasConfig: config !== undefined }
    });

    return { message: 'Target updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation Target] 更新目标失败', {
      targetId: req.query.id,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
