import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTargetService } from '@fastgpt/service/core/evaluation/target';
import type {
  CreateTargetParams,
  EvalTargetSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type CreateTargetBody = CreateTargetParams;
export type CreateTargetResponse = EvalTargetSchemaType;

async function handler(req: ApiRequestProps<CreateTargetBody>) {
  try {
    const { name, description, type, config } = req.body;

    // 验证必填字段
    if (!name?.trim()) {
      return Promise.reject('Target name is required');
    }

    if (!type) {
      return Promise.reject('Target type is required');
    }

    if (!config) {
      return Promise.reject('Target config is required');
    }

    // 验证类型和配置匹配
    const configAny = config as any;
    switch (type) {
      case 'workflow':
        if (!configAny.appId) {
          return Promise.reject('Workflow target requires an app ID');
        }
        break;

      case 'api':
        if (!configAny.url?.trim()) {
          return Promise.reject('API target requires a valid URL');
        }
        if (!configAny.method || !['GET', 'POST', 'PUT', 'DELETE'].includes(configAny.method)) {
          return Promise.reject('API target requires a valid HTTP method');
        }
        if (configAny.timeout && (configAny.timeout < 1000 || configAny.timeout > 300000)) {
          return Promise.reject('API timeout must be between 1000ms and 300000ms');
        }
        break;

      case 'function':
        if (!configAny.code?.trim()) {
          return Promise.reject('Function target requires code');
        }
        if (configAny.timeout && (configAny.timeout < 1000 || configAny.timeout > 60000)) {
          return Promise.reject('Function timeout must be between 1000ms and 60000ms');
        }
        break;

      default:
        return Promise.reject(`Unknown target type: ${type}`);
    }

    const target = await EvaluationTargetService.createTarget(
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

    addLog.info('[Evaluation Target] 目标创建成功', {
      targetId: target._id,
      name: target.name,
      type: target.type
    });

    return target;
  } catch (error) {
    addLog.error('[Evaluation Target] 创建目标失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
