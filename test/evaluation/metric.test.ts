import { beforeAll, afterAll, beforeEach, afterEach, describe, test, expect, vi } from 'vitest';
import {
  EvaluationMetricService,
  HttpMetric,
  FunctionMetric,
  AiModelMetric,
  createMetricInstance
} from '@fastgpt/service/core/evaluation/metric';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type {
  CreateMetricParams,
  EvalInput,
  EvalOutput,
  HttpConfig,
  FunctionConfig,
  AiModelConfig
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '@fastgpt/service/support/permission/type';
import { Types } from '@fastgpt/service/common/mongo';
// 移除未使用的导入

// Mock global fetch
global.fetch = vi.fn();

// Mock getAppEvaluationScore from the correct path
vi.mock('@fastgpt/service/core/evaluation/metric/scoring', () => ({
  getAppEvaluationScore: vi.fn().mockResolvedValue({
    accuracyScore: 85,
    usage: { inputTokens: 100, outputTokens: 50, totalPoints: 15 }
  })
}));

// Import the mocked function
import { getAppEvaluationScore } from '@fastgpt/service/core/evaluation/metric/scoring';

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  parseHeaderCert: vi.fn()
}));

import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

describe('EvaluationMetricService', () => {
  let teamId: string;
  let auth: AuthModeType;

  beforeAll(async () => {
    // 数据库连接在 setup.ts 中处理
    teamId = '507f1f77bcf86cd799439011';
    auth = { req: {} as any, authToken: true };
  });

  afterAll(async () => {
    // 清理测试数据
    await MongoEvalMetric.deleteMany({ teamId });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock parseHeaderCert - 返回正确的ObjectId类型
    (parseHeaderCert as any).mockResolvedValue({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(teamId)
    });

    // Reset getAppEvaluationScore mock
    vi.mocked(getAppEvaluationScore).mockResolvedValue({
      accuracyScore: 85,
      usage: { inputTokens: 100, outputTokens: 50 }
    });
  });

  describe('createMetric', () => {
    test('应该成功创建 HTTP 指标', async () => {
      const params: CreateMetricParams = {
        name: 'HTTP Accuracy Metric',
        description: 'External HTTP service for accuracy evaluation',
        type: 'http',
        config: {
          url: 'https://api.example.com/evaluate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        } as HttpConfig
      };

      const metric = await EvaluationMetricService.createMetric(params, auth);

      expect(metric.name).toBe(params.name);
      expect(metric.description).toBe(params.description);
      expect(metric.type).toBe('http');
      expect(metric.config).toEqual(params.config);
      expect(metric.teamId.toString()).toBe(teamId);
      expect(metric.tmbId.toString()).toBe(teamId);
    });

    test('应该成功创建函数指标', async () => {
      const params: CreateMetricParams = {
        name: 'Custom Function Metric',
        description: 'Custom JavaScript evaluation function',
        type: 'function',
        config: {
          code: `
            const similarity = calculateSimilarity(input.expectedResponse, output.response);
            return { score: similarity * 100, details: { similarity } };
          `,
          timeout: 5000
        } as FunctionConfig
      };

      const metric = await EvaluationMetricService.createMetric(params, auth);

      expect(metric.name).toBe(params.name);
      expect(metric.type).toBe('function');
    });

    test('应该成功创建 AI 模型指标', async () => {
      const params: CreateMetricParams = {
        name: 'GPT-4 Evaluation Metric',
        description: 'AI-powered evaluation using GPT-4',
        type: 'ai_model',
        config: {
          model: 'gpt-4',
          prompt: 'Please evaluate the accuracy of the response compared to the expected answer.'
        } as AiModelConfig
      };

      const metric = await EvaluationMetricService.createMetric(params, auth);

      expect(metric.name).toBe(params.name);
      expect(metric.type).toBe('ai_model');
    });

    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        name: 'Invalid Metric'
        // 缺少 type 和 config
      };

      await expect(
        EvaluationMetricService.createMetric(invalidParams as any, auth)
      ).rejects.toThrow();
    });
  });

  describe('getMetric', () => {
    test('应该成功获取指标', async () => {
      // 先创建一个指标
      const params: CreateMetricParams = {
        name: 'HTTP Metric for Get Test',
        description: 'HTTP metric for get test',
        type: 'http',
        config: {
          url: 'https://api.example.com/evaluate',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        } as HttpConfig
      };
      const created = await EvaluationMetricService.createMetric(params, auth);

      const metric = await EvaluationMetricService.getMetric(created._id, auth);

      expect(metric._id.toString()).toBe(created._id.toString());
      expect(metric.name).toBe('HTTP Metric for Get Test');
      expect(metric.type).toBe('http');
    });

    test('指标不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationMetricService.getMetric(nonExistentId, auth)).rejects.toThrow(
        'Metric not found'
      );
    });
  });

  describe('getMetrics', () => {
    test('应该成功批量获取指标', async () => {
      // 先创建多个指标
      const httpMetric = await EvaluationMetricService.createMetric(
        {
          name: 'HTTP Batch Test',
          type: 'http',
          config: { url: 'https://api.example.com', method: 'POST', timeout: 30000 } as HttpConfig
        },
        auth
      );

      const functionMetric = await EvaluationMetricService.createMetric(
        {
          name: 'Function Batch Test',
          type: 'function',
          config: { code: 'return 85;', timeout: 5000 } as FunctionConfig
        },
        auth
      );

      const aiMetric = await EvaluationMetricService.createMetric(
        {
          name: 'AI Batch Test',
          type: 'ai_model',
          config: { model: 'gpt-4', prompt: 'Evaluate' } as AiModelConfig
        },
        auth
      );

      const metrics = await EvaluationMetricService.getMetrics(
        [httpMetric._id, functionMetric._id, aiMetric._id],
        auth
      );

      expect(metrics).toHaveLength(3);
      expect(metrics.map((m) => m.type)).toEqual(['http', 'function', 'ai_model']);
    });
  });

  describe('updateMetric', () => {
    test('应该成功更新指标', async () => {
      // 先创建一个指标
      const params: CreateMetricParams = {
        name: 'HTTP Metric for Update',
        description: 'Original description',
        type: 'http',
        config: {
          url: 'https://api.example.com/evaluate',
          method: 'POST',
          timeout: 30000
        } as HttpConfig
      };
      const created = await EvaluationMetricService.createMetric(params, auth);

      const updates = {
        name: 'Updated HTTP Metric',
        description: 'Updated description'
      };

      await EvaluationMetricService.updateMetric(created._id, updates, auth);

      const updatedMetric = await EvaluationMetricService.getMetric(created._id, auth);
      expect(updatedMetric.name).toBe(updates.name);
      expect(updatedMetric.description).toBe(updates.description);
    });
  });

  describe('listMetrics', () => {
    test('应该成功获取指标列表', async () => {
      // 先创建一些指标
      await Promise.all([
        EvaluationMetricService.createMetric(
          {
            name: 'List Test HTTP',
            type: 'http',
            config: { url: 'https://api.example.com', method: 'POST', timeout: 30000 } as HttpConfig
          },
          auth
        ),
        EvaluationMetricService.createMetric(
          {
            name: 'List Test Function',
            type: 'function',
            config: { code: 'return 85;', timeout: 5000 } as FunctionConfig
          },
          auth
        ),
        EvaluationMetricService.createMetric(
          {
            name: 'List Test AI',
            type: 'ai_model',
            config: { model: 'gpt-4', prompt: 'Evaluate' } as AiModelConfig
          },
          auth
        )
      ]);

      const result = await EvaluationMetricService.listMetrics(auth, 1, 10);

      expect(Array.isArray(result.metrics)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.metrics.length).toBeGreaterThanOrEqual(3);
    });

    test('应该支持搜索功能', async () => {
      // 先创建一个指标
      await EvaluationMetricService.createMetric(
        {
          name: 'HTTP Search Test',
          type: 'http',
          config: { url: 'https://api.example.com', method: 'POST', timeout: 30000 } as HttpConfig
        },
        auth
      );

      const result = await EvaluationMetricService.listMetrics(auth, 1, 10, 'HTTP');

      expect(Array.isArray(result.metrics)).toBe(true);
      expect(result.metrics.some((metric) => metric.name.includes('HTTP'))).toBe(true);
    });
  });
});

describe('HttpMetric', () => {
  let httpMetric: HttpMetric;
  const testInput: EvalInput = {
    question: 'What is the capital of France?',
    expectedResponse: 'Paris',
    globalVariables: { language: 'en' }
  };

  const testOutput: EvalOutput = {
    response: 'The capital of France is Paris.',
    usage: null,
    responseTime: 1500
  };

  beforeEach(() => {
    const config: HttpConfig = {
      url: 'https://api.example.com/evaluate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000
    };
    httpMetric = new HttpMetric(config, 'test-metric-id', 'Test HTTP Metric');
  });

  test('应该成功执行 HTTP 评估', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ score: 95, details: { accuracy: 0.95 } })
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await httpMetric.evaluate(testInput, testOutput);

    expect(result.metricId).toBe('test-metric-id');
    expect(result.metricName).toBe('Test HTTP Metric');
    expect(result.score).toBe(95);
    expect(result.details).toEqual({ accuracy: 0.95 });
    expect(result.error).toBeUndefined();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/evaluate',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: expect.stringContaining('"question":"What is the capital of France?"')
      })
    );
  });

  test('应该处理 HTTP 错误', async () => {
    const mockResponse = {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error'
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await httpMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(0);
    expect(result.error).toContain('HTTP 500');
  });

  test('应该处理网络错误', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const result = await httpMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(0);
    expect(result.error).toContain('Network error');
  });

  test('应该处理数字类型的响应', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue(88.5)
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await httpMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(88.5);
  });

  test('应该限制分数范围在 0-100', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ score: 150 })
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await httpMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(100);
  });

  test('应该验证连通性', async () => {
    const mockResponse = { ok: true };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const isValid = await httpMetric.validate();

    expect(isValid).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/evaluate',
      expect.objectContaining({
        method: 'HEAD'
      })
    );
  });
});

describe('FunctionMetric', () => {
  let functionMetric: FunctionMetric;
  const testInput: EvalInput = {
    question: 'What is AI?',
    expectedResponse: 'Artificial Intelligence',
    globalVariables: {}
  };

  const testOutput: EvalOutput = {
    response: 'AI stands for Artificial Intelligence',
    usage: null,
    responseTime: 800
  };

  test('应该成功执行简单函数评估', async () => {
    const config: FunctionConfig = {
      code: `
        // 简单的文本相似度检查
        const expected = input.expectedResponse.toLowerCase();
        const actual = output.response.toLowerCase();
        const hasKeywords = expected.split(' ').every(word => actual.includes(word));
        return { score: hasKeywords ? 90 : 50, details: { hasKeywords } };
      `,
      timeout: 5000
    };

    functionMetric = new FunctionMetric(config, 'function-metric-id', 'Test Function Metric');

    const result = await functionMetric.evaluate(testInput, testOutput);

    expect(result.metricId).toBe('function-metric-id');
    expect(result.metricName).toBe('Test Function Metric');
    expect(result.score).toBe(90);
    expect(result.details?.hasKeywords).toBe(true);
  });

  test('应该成功执行返回数字的函数', async () => {
    const config: FunctionConfig = {
      code: 'return 85;',
      timeout: 5000
    };

    functionMetric = new FunctionMetric(config, 'function-metric-id', 'Simple Number Metric');

    const result = await functionMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(85);
  });

  test('应该处理函数执行错误', async () => {
    const config: FunctionConfig = {
      code: 'throw new Error("Intentional error");',
      timeout: 5000
    };

    functionMetric = new FunctionMetric(config, 'function-metric-id', 'Error Function Metric');

    const result = await functionMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(0);
    expect(result.error).toContain('Intentional error');
  });

  test('应该处理语法错误', async () => {
    const config: FunctionConfig = {
      code: 'invalid javascript syntax [[[',
      timeout: 5000
    };

    functionMetric = new FunctionMetric(config, 'function-metric-id', 'Syntax Error Metric');

    const result = await functionMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(0);
    expect(result.error).toBeDefined();
  });

  test('应该验证函数语法', async () => {
    const config: FunctionConfig = {
      code: 'return 42;',
      timeout: 5000
    };

    functionMetric = new FunctionMetric(config, 'function-metric-id', 'Valid Function Metric');

    const isValid = await functionMetric.validate();
    expect(isValid).toBe(true);
  });

  test('应该检测无效语法', async () => {
    const config: FunctionConfig = {
      code: 'invalid syntax here',
      timeout: 5000
    };

    functionMetric = new FunctionMetric(config, 'function-metric-id', 'Invalid Function Metric');

    const isValid = await functionMetric.validate();
    expect(isValid).toBe(false);
  });
});

describe('AiModelMetric', () => {
  let aiModelMetric: AiModelMetric;
  const testInput: EvalInput = {
    question: 'Explain quantum computing',
    expectedResponse: 'Quantum computing uses quantum mechanics principles',
    globalVariables: {}
  };

  const testOutput: EvalOutput = {
    response: 'Quantum computing leverages quantum mechanical phenomena',
    usage: null,
    responseTime: 2000
  };

  beforeEach(() => {
    const config: AiModelConfig = {
      model: 'gpt-4',
      prompt: 'Evaluate the accuracy of the response'
    };
    aiModelMetric = new AiModelMetric(config, 'ai-metric-id', 'GPT-4 Evaluation Metric');
  });

  test('应该成功执行 AI 模型评估', async () => {
    const mockEvaluationResult = {
      accuracyScore: 87,
      usage: {
        inputTokens: 150,
        outputTokens: 50,
        totalPoints: 20
      }
    };

    vi.mocked(getAppEvaluationScore).mockResolvedValue(mockEvaluationResult);

    const result = await aiModelMetric.evaluate(testInput, testOutput);

    expect(result.metricId).toBe('ai-metric-id');
    expect(result.metricName).toBe('GPT-4 Evaluation Metric');
    expect(result.score).toBe(87);
    expect(result.details).toEqual({
      usage: mockEvaluationResult.usage,
      model: 'gpt-4',
      prompt: 'Evaluate the accuracy of the response'
    });

    expect(getAppEvaluationScore).toHaveBeenCalledWith({
      question: testInput.question,
      appAnswer: testOutput.response,
      standardAnswer: testInput.expectedResponse,
      model: 'gpt-4',
      prompt: 'Evaluate the accuracy of the response'
    });
  });

  test('应该处理 AI 评估错误', async () => {
    vi.mocked(getAppEvaluationScore).mockRejectedValue(new Error('AI service unavailable'));

    const result = await aiModelMetric.evaluate(testInput, testOutput);

    expect(result.score).toBe(0);
    expect(result.error).toContain('AI service unavailable');
  });

  test('应该验证模型可用性', async () => {
    const isValid = await aiModelMetric.validate();
    expect(isValid).toBe(true); // 简化的实现总是返回 true
  });
});

describe('createMetricInstance', () => {
  test('应该创建 HTTP 指标实例', () => {
    const config = {
      _id: 'metric-id',
      name: 'Test HTTP Metric',
      type: 'http' as const,
      config: {
        url: 'https://api.example.com/evaluate',
        method: 'POST' as const,
        headers: {},
        timeout: 30000
      }
    } as any;

    const instance = createMetricInstance(config);

    expect(instance).toBeInstanceOf(HttpMetric);
    expect(instance.getName()).toBe('Test HTTP Metric');
  });

  test('应该创建函数指标实例', () => {
    const config = {
      _id: 'metric-id',
      name: 'Test Function Metric',
      type: 'function' as const,
      config: {
        code: 'return 100;',
        timeout: 5000
      }
    } as any;

    const instance = createMetricInstance(config);

    expect(instance).toBeInstanceOf(FunctionMetric);
    expect(instance.getName()).toBe('Test Function Metric');
  });

  test('应该创建 AI 模型指标实例', () => {
    const config = {
      _id: 'metric-id',
      name: 'Test AI Metric',
      type: 'ai_model' as const,
      config: {
        model: 'gpt-4',
        prompt: 'Evaluate this'
      }
    } as any;

    const instance = createMetricInstance(config);

    expect(instance).toBeInstanceOf(AiModelMetric);
    expect(instance.getName()).toBe('Test AI Metric');
  });

  test('应该处理未知指标类型', () => {
    const config = {
      _id: 'metric-id',
      name: 'Unknown Metric',
      type: 'unknown' as any,
      config: {}
    } as any;

    expect(() => createMetricInstance(config)).toThrow('Unknown metric type: unknown');
  });
});

describe('EvaluationMetricService - Integration', () => {
  let teamId: string;
  let metricId: string;
  let auth: AuthModeType;

  beforeAll(async () => {
    // 数据库连接在 setup.ts 中处理
    teamId = '507f1f77bcf86cd799439011';
    auth = { req: {} as any, authToken: true };
  });

  afterAll(async () => {
    await MongoEvalMetric.deleteMany({ teamId });
  });

  test('应该执行完整的指标测试流程', async () => {
    // 1. 创建指标
    const params: CreateMetricParams = {
      name: 'Integration Test Metric',
      description: 'End-to-end integration test',
      type: 'function',
      config: {
        code: `
          // 计算响应长度得分
          const responseLength = output.response.length;
          const expectedLength = input.expectedResponse.length;
          const lengthRatio = Math.min(responseLength / expectedLength, 2);
          const score = Math.max(0, Math.min(100, lengthRatio * 50));
          return { score, details: { responseLength, expectedLength, lengthRatio } };
        `,
        timeout: 5000
      } as FunctionConfig
    };

    const metric = await EvaluationMetricService.createMetric(params, auth);
    metricId = metric._id;

    // 2. 测试指标执行
    const testInput: EvalInput = {
      question: 'What is machine learning?',
      expectedResponse: 'Machine learning is a subset of artificial intelligence.',
      globalVariables: {}
    };

    const testOutput: EvalOutput = {
      response:
        'Machine learning is a powerful subset of artificial intelligence that enables computers to learn patterns.',
      usage: null,
      responseTime: 1200
    };

    const result = await EvaluationMetricService.testMetric(metricId, testInput, testOutput, auth);

    expect(result.score).toBeGreaterThan(0);
    expect(result.details).toBeDefined();
    expect(result.details?.responseLength).toBeDefined();
    expect(result.details?.expectedLength).toBeDefined();

    // 3. 批量执行测试
    const metrics = await EvaluationMetricService.getMetrics([metricId], auth);
    const batchResults = await EvaluationMetricService.executeMetrics(
      metrics,
      testInput,
      testOutput
    );

    expect(batchResults).toHaveLength(1);
    expect(batchResults[0].metricId.toString()).toBe(metricId.toString());
    expect(batchResults[0].score).toBe(result.score);

    // 4. 删除指标
    await EvaluationMetricService.deleteMetric(metricId, auth);

    await expect(EvaluationMetricService.getMetric(metricId, auth)).rejects.toThrow(
      'Metric not found'
    );
  });
});
