import { MongoEvalMetric } from './schema';
import type {
  EvalMetricSchemaType,
  CreateMetricParams,
  EvalInput,
  EvalOutput,
  MetricResult,
  HttpConfig,
  FunctionConfig,
  AiModelConfig
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '../../../support/permission/type';
import { getAppEvaluationScore } from './scoring';
import {
  validateResourceAccess,
  validateResourcesAccess,
  validateResourceCreate,
  validateListAccess,
  checkUpdateResult,
  checkDeleteResult
} from '../common';

// 评估指标基类
export abstract class EvaluationMetric {
  protected config: any;
  protected metricId: string;
  protected name: string;

  constructor(config: any, metricId: string, name: string) {
    this.config = config;
    this.metricId = metricId;
    this.name = name;
  }

  abstract evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult>;
  abstract getName(): string;
  abstract validate(): Promise<boolean>;
}

// HTTP 指标实现
export class HttpMetric extends EvaluationMetric {
  protected config: HttpConfig;

  constructor(config: HttpConfig, metricId: string, name: string) {
    super(config, metricId, name);
    this.config = config;
  }

  async evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult> {
    try {
      const requestBody = {
        input,
        output,
        question: input.question,
        expectedResponse: input.expectedResponse,
        actualResponse: output.response,
        globalVariables: input.globalVariables
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(this.config.url, {
        method: this.config.method,
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();

      // 期望返回格式: { score: number, details?: any }
      const score = typeof result === 'number' ? result : result.score || 0;
      const details = typeof result === 'object' ? result.details : undefined;

      return {
        metricId: this.metricId,
        metricName: this.name,
        score: Math.max(0, Math.min(100, score)), // 限制分数范围
        details
      };
    } catch (error) {
      return {
        metricId: this.metricId,
        metricName: this.name,
        score: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  getName(): string {
    return this.name;
  }

  async validate(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.config.url, {
        method: 'HEAD',
        headers: this.config.headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// 函数指标实现
export class FunctionMetric extends EvaluationMetric {
  protected config: FunctionConfig;

  constructor(config: FunctionConfig, metricId: string, name: string) {
    super(config, metricId, name);
    this.config = config;
  }

  async evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult> {
    try {
      // 使用更安全的代码执行方式和现代超时控制
      const evaluationFunction = this.createSecureEvaluationFunction();

      // 使用 AbortController 替代 Promise.race 进行超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.timeout);

      try {
        const result = await this.executeWithTimeout(
          evaluationFunction,
          input,
          output,
          controller.signal
        );

        clearTimeout(timeoutId);

        const { score, details } = this.parseEvaluationResult(result);

        return {
          metricId: this.metricId,
          metricName: this.name,
          score: Math.max(0, Math.min(100, score)), // 限制分数范围
          details
        };
      } catch (executeError) {
        clearTimeout(timeoutId);
        throw executeError;
      }
    } catch (error) {
      return {
        metricId: this.metricId,
        metricName: this.name,
        score: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private createSecureEvaluationFunction(): Function {
    // 创建更安全的函数执行环境，限制可用的全局对象
    const allowedGlobals = {
      Math,
      Date,
      JSON,
      Number,
      String,
      Boolean,
      Array,
      Object
    };

    return new Function(
      'input',
      'output',
      'globals',
      `
      "use strict";
      const { Math, Date, JSON, Number, String, Boolean, Array, Object } = globals;
      const { question, expectedResponse, globalVariables, history } = input;
      const { response: actualResponse, usage, responseTime } = output;
      
      // 用户代码执行区域
      ${this.config.code}
      `
    );
  }

  private async executeWithTimeout(
    fn: Function,
    input: EvalInput,
    output: EvalOutput,
    signal: AbortSignal
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error('Function execution timeout'));
        return;
      }

      signal.addEventListener('abort', () => {
        reject(new Error('Function execution timeout'));
      });

      try {
        const allowedGlobals = {
          Math,
          Date,
          JSON,
          Number,
          String,
          Boolean,
          Array,
          Object
        };
        const result = fn(input, output, allowedGlobals);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  }

  private parseEvaluationResult(result: any): { score: number; details?: any } {
    let score = 0;
    let details: any;

    if (typeof result === 'number') {
      score = result;
    } else if (typeof result === 'object' && result !== null) {
      score = result.score ?? 0;
      details = result.details;
    }

    return { score, details };
  }

  getName(): string {
    return this.name;
  }

  async validate(): Promise<boolean> {
    try {
      // 基础语法检查 - 使用更安全的方式
      this.createSecureEvaluationFunction();
      return true;
    } catch (error) {
      return false;
    }
  }
}

// AI 模型指标实现
export class AiModelMetric extends EvaluationMetric {
  protected config: AiModelConfig;

  constructor(config: AiModelConfig, metricId: string, name: string) {
    super(config, metricId, name);
    this.config = config;
  }

  async evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult> {
    try {
      // 使用现有的 AI 评估功能
      const { score, usage } = await getAppEvaluationScore({
        question: input.question,
        appAnswer: output.response,
        standardAnswer: input.expectedResponse,
        model: this.config.model,
        prompt: this.config.prompt
      });

      return {
        metricId: this.metricId,
        metricName: this.name,
        score,
        details: {
          usage,
          model: this.config.model,
          prompt: this.config.prompt
        }
      };
    } catch (error) {
      return {
        metricId: this.metricId,
        metricName: this.name,
        score: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  getName(): string {
    return this.name;
  }

  async validate(): Promise<boolean> {
    try {
      // 检查模型是否可用
      // 这里可以调用一个简单的测试请求来验证模型
      return true; // 简化实现
    } catch (error) {
      return false;
    }
  }
}

// 指标工厂
export function createMetricInstance(metricConfig: EvalMetricSchemaType): EvaluationMetric {
  switch (metricConfig.type) {
    case 'http':
      return new HttpMetric(metricConfig.config as HttpConfig, metricConfig._id, metricConfig.name);
    case 'function':
      return new FunctionMetric(
        metricConfig.config as FunctionConfig,
        metricConfig._id,
        metricConfig.name
      );
    case 'ai_model':
      return new AiModelMetric(
        metricConfig.config as AiModelConfig,
        metricConfig._id,
        metricConfig.name
      );
    default:
      throw new Error(`Unknown metric type: ${metricConfig.type}`);
  }
}

// 评估指标服务
export class EvaluationMetricService {
  // 创建评估指标
  static async createMetric(
    params: CreateMetricParams,
    auth: AuthModeType
  ): Promise<EvalMetricSchemaType> {
    const { teamId, tmbId } = await validateResourceCreate(auth);

    const metric = await MongoEvalMetric.create({
      ...params,
      teamId,
      tmbId
    });

    return metric.toObject();
  }

  // 获取评估指标
  static async getMetric(metricId: string, auth: AuthModeType): Promise<EvalMetricSchemaType> {
    const { resourceFilter, notFoundError } = await validateResourceAccess(
      metricId,
      auth,
      'Metric'
    );

    const metric = await MongoEvalMetric.findOne(resourceFilter).lean();

    if (!metric) {
      throw new Error(notFoundError);
    }

    return metric;
  }

  // 批量获取评估指标
  static async getMetrics(
    metricIds: string[],
    auth: AuthModeType
  ): Promise<EvalMetricSchemaType[]> {
    if (metricIds.length === 0) return [];

    const { resourceFilter } = await validateResourcesAccess(metricIds, auth, 'Metric');

    const metrics = await MongoEvalMetric.find(resourceFilter).lean();

    return metrics;
  }

  // 更新评估指标
  static async updateMetric(
    metricId: string,
    updates: Partial<CreateMetricParams>,
    auth: AuthModeType
  ): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(metricId, auth, 'Metric');

    const result = await MongoEvalMetric.updateOne(resourceFilter, { $set: updates });

    checkUpdateResult(result, 'Metric');
  }

  // 删除评估指标
  static async deleteMetric(metricId: string, auth: AuthModeType): Promise<void> {
    const { resourceFilter } = await validateResourceAccess(metricId, auth, 'Metric');

    const result = await MongoEvalMetric.deleteOne(resourceFilter);

    checkDeleteResult(result, 'Metric');
  }

  // 获取指标列表
  static async listMetrics(
    auth: AuthModeType,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string
  ): Promise<{
    metrics: EvalMetricSchemaType[];
    total: number;
  }> {
    const { filter, skip, limit, sort } = await validateListAccess(auth, searchKey, page, pageSize);

    const [metrics, total] = await Promise.all([
      MongoEvalMetric.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      MongoEvalMetric.countDocuments(filter)
    ]);

    return { metrics, total };
  }

  // 测试指标执行
  static async testMetric(
    metricId: string,
    testInput: EvalInput,
    testOutput: EvalOutput,
    auth: AuthModeType
  ): Promise<MetricResult> {
    const metric = await this.getMetric(metricId, auth);
    const metricInstance = createMetricInstance(metric);

    return await metricInstance.evaluate(testInput, testOutput);
  }

  // 批量执行指标评估
  static async executeMetrics(
    metrics: EvalMetricSchemaType[],
    input: EvalInput,
    output: EvalOutput
  ): Promise<MetricResult[]> {
    const results = await Promise.all(
      metrics.map(async (metricConfig) => {
        try {
          const metricInstance = createMetricInstance(metricConfig);
          return await metricInstance.evaluate(input, output);
        } catch (error) {
          return {
            metricId: metricConfig._id,
            metricName: metricConfig.name,
            score: 0,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      })
    );

    return results;
  }
}
