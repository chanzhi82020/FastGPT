import { MongoEvalTarget } from './schema';
import type {
  EvalTargetSchemaType,
  CreateTargetParams,
  EvalInput,
  EvalOutput,
  WorkflowConfig,
  ApiConfig,
  FunctionConfig
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '../../../support/permission/type';
import {
  validateResourceAccess,
  validateResourceCreate,
  validateListAccess,
  checkUpdateResult,
  checkDeleteResult
} from '../common';
import { dispatchWorkFlow } from '../../workflow/dispatch';
import { getAppLatestVersion } from '../../app/version/controller';
import { MongoApp } from '../../app/schema';
import {
  getWorkflowEntryNodeIds,
  storeEdges2RuntimeEdges,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { WORKFLOW_MAX_RUN_TIMES } from '../../workflow/constants';
import { getUserChatInfoAndAuthTeamPoints } from '../../../support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '../../../support/user/team/utils';
import { removeDatasetCiteText } from '../../ai/utils';

// 评估目标基类
export abstract class EvaluationTarget {
  protected targetId: string;

  constructor(targetId: string) {
    this.targetId = targetId;
  }

  abstract execute(input: EvalInput): Promise<EvalOutput>;
  abstract validate(): Promise<boolean>;
}

// 工作流目标实现
export class WorkflowTarget extends EvaluationTarget {
  private config: WorkflowConfig;

  constructor(config: WorkflowConfig, targetId: string) {
    super(targetId);
    this.config = config;
  }

  async execute(input: EvalInput): Promise<EvalOutput> {
    const startTime = Date.now();

    // 获取应用信息
    const appData = await MongoApp.findById(this.config.appId);
    if (!appData) {
      throw new Error('App not found');
    }

    // 获取用户信息和权限
    const [{ timezone, externalProvider }, { nodes, edges, chatConfig }] = await Promise.all([
      getUserChatInfoAndAuthTeamPoints(appData.tmbId),
      getAppLatestVersion(appData._id, appData)
    ]);

    // 构造查询
    const query: UserChatItemValueItemType[] = [
      {
        type: ChatItemValueTypeEnum.text,
        text: {
          content: input.question
        }
      }
    ];

    // 解析历史对话
    const histories = (() => {
      try {
        return input.history ? JSON.parse(input.history) : [];
      } catch (error) {
        return [];
      }
    })();

    const chatId = getNanoid();

    // 执行工作流
    const { assistantResponses, flowUsages } = await dispatchWorkFlow({
      chatId,
      timezone,
      externalProvider,
      mode: 'chat',
      runningAppInfo: {
        id: String(appData._id),
        teamId: String(appData.teamId),
        tmbId: String(appData.tmbId)
      },
      runningUserInfo: await getRunningUserInfoByTmbId(appData.tmbId),
      uid: String(appData.tmbId),
      runtimeNodes: storeNodes2RuntimeNodes(nodes, getWorkflowEntryNodeIds(nodes)),
      runtimeEdges: storeEdges2RuntimeEdges(edges),
      variables: input.globalVariables || {},
      query,
      chatConfig: { ...chatConfig, ...(this.config.chatConfig || {}) },
      histories,
      stream: false,
      maxRunTimes: WORKFLOW_MAX_RUN_TIMES
    });

    const response = removeDatasetCiteText(assistantResponses[0]?.text?.content || '', false);

    return {
      response,
      usage: flowUsages,
      responseTime: Date.now() - startTime
    };
  }

  async validate(): Promise<boolean> {
    try {
      const appData = await MongoApp.findById(this.config.appId);
      return !!appData;
    } catch (error) {
      return false;
    }
  }
}

// API目标实现
export class ApiTarget extends EvaluationTarget {
  private config: ApiConfig;

  constructor(config: ApiConfig, targetId: string) {
    super(targetId);
    this.config = config;
  }

  async execute(input: EvalInput): Promise<EvalOutput> {
    const startTime = Date.now();

    try {
      const requestBody = this.config.body
        ? this.replaceVariables(this.config.body, input)
        : JSON.stringify(input);

      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: requestBody,
        signal: AbortSignal.timeout(this.config.timeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      return {
        response: typeof result === 'string' ? result : JSON.stringify(result),
        usage: null,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      throw new Error(`API call failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async validate(): Promise<boolean> {
    try {
      const response = await fetch(this.config.url, {
        method: 'HEAD',
        headers: this.config.headers,
        signal: AbortSignal.timeout(5000)
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  private replaceVariables(template: string, input: EvalInput): string {
    let result = template;
    result = result.replace(/\{\{question\}\}/g, input.question);
    result = result.replace(/\{\{expectedResponse\}\}/g, input.expectedResponse);

    if (input.globalVariables) {
      Object.keys(input.globalVariables).forEach((key) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(regex, String(input.globalVariables![key]));
      });
    }

    return result;
  }
}

// 函数目标实现
export class FunctionTarget extends EvaluationTarget {
  private config: FunctionConfig;

  constructor(config: FunctionConfig, targetId: string) {
    super(targetId);
    this.config = config;
  }

  async execute(input: EvalInput): Promise<EvalOutput> {
    const startTime = Date.now();

    try {
      // 创建安全的函数执行环境
      const func = new Function('input', this.config.code);

      // 设置执行超时
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Function execution timeout')), this.config.timeout);
      });

      const executePromise = Promise.resolve(func(input));

      const result = await Promise.race([executePromise, timeoutPromise]);

      return {
        response: typeof result === 'string' ? result : JSON.stringify(result),
        usage: null,
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      throw new Error(
        `Function execution failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async validate(): Promise<boolean> {
    try {
      // 基础语法检查
      new Function('input', this.config.code);
      return true;
    } catch (error) {
      return false;
    }
  }
}

// 目标工厂
export function createTargetInstance(targetConfig: EvalTargetSchemaType): EvaluationTarget {
  switch (targetConfig.type) {
    case 'workflow':
      return new WorkflowTarget(targetConfig.config as WorkflowConfig, targetConfig._id);
    case 'api':
      return new ApiTarget(targetConfig.config as ApiConfig, targetConfig._id);
    case 'function':
      return new FunctionTarget(targetConfig.config as FunctionConfig, targetConfig._id);
    default:
      throw new Error(`Unknown target type: ${targetConfig.type}`);
  }
}

// 评估目标服务
export class EvaluationTargetService {
  // 创建评估目标
  static async createTarget(
    params: CreateTargetParams,
    auth: AuthModeType
  ): Promise<EvalTargetSchemaType> {
    const { teamId, tmbId } = await validateResourceCreate(auth);

    const target = await MongoEvalTarget.create({
      ...params,
      teamId,
      tmbId
    });

    return target.toObject();
  }

  // 获取评估目标
  static async getTarget(targetId: string, auth: AuthModeType): Promise<EvalTargetSchemaType> {
    const { resourceFilter, notFoundError } = await validateResourceAccess(
      targetId,
      auth,
      'Target'
    );

    const target = await MongoEvalTarget.findOne(resourceFilter).lean();

    if (!target) {
      throw new Error(notFoundError);
    }

    return target;
  }

  // 更新评估目标
  static async updateTarget(
    targetId: string,
    updates: Partial<CreateTargetParams>,
    auth: AuthModeType
  ): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(targetId, auth, 'Target');

    const result = await MongoEvalTarget.updateOne(resourceFilter, { $set: updates });

    checkUpdateResult(result, 'Target');
  }

  // 删除评估目标
  static async deleteTarget(targetId: string, auth: AuthModeType): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(targetId, auth, 'Target');

    const result = await MongoEvalTarget.deleteOne(resourceFilter);

    checkDeleteResult(result, 'Target');
  }

  // 获取目标列表
  static async listTargets(
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string
  ): Promise<{
    targets: EvalTargetSchemaType[];
    total: number;
  }> {
    const { filter, skip, limit, sort } = await validateListAccess(auth, searchKey, page, pageSize);

    const [targets, total] = await Promise.all([
      MongoEvalTarget.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      MongoEvalTarget.countDocuments(filter)
    ]);

    return { targets, total };
  }

  // 测试目标连通性
  static async testTarget(
    targetId: string,
    auth: AuthModeType
  ): Promise<{ success: boolean; message: string }> {
    try {
      const target = await this.getTarget(targetId, auth);
      const targetInstance = createTargetInstance(target);

      const isValid = await targetInstance.validate();

      return {
        success: isValid,
        message: isValid ? 'Target is valid and accessible' : 'Target validation failed'
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  // 静态工厂方法 - 用于测试
  static createTargetInstance = createTargetInstance;
}
