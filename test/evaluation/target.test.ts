import { beforeAll, afterAll, beforeEach, afterEach, describe, test, expect, vi } from 'vitest';
import {
  EvaluationTargetService,
  WorkflowTarget,
  ApiTarget,
  FunctionTarget,
  createTargetInstance
} from '@fastgpt/service/core/evaluation/target';
import { MongoEvalTarget } from '@fastgpt/service/core/evaluation/target/schema';
import type {
  CreateTargetParams,
  EvalInput,
  EvalOutput,
  WorkflowConfig,
  ApiConfig,
  FunctionConfig
} from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '@fastgpt/service/support/permission/type';
import { Types } from '@fastgpt/service/common/mongo';

// Mock dependencies
global.fetch = vi.fn();

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  dispatchWorkFlow: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/auth/team', () => ({
  getUserChatInfoAndAuthTeamPoints: vi.fn()
}));

vi.mock('@fastgpt/service/support/user/team/utils', () => ({
  getRunningUserInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/utils', () => ({
  removeDatasetCiteText: vi.fn((text) => text)
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  parseHeaderCert: vi.fn()
}));

import { MongoApp } from '@fastgpt/service/core/app/schema';
import { dispatchWorkFlow } from '@fastgpt/service/core/workflow/dispatch';
import { getAppLatestVersion } from '@fastgpt/service/core/app/version/controller';
import { getUserChatInfoAndAuthTeamPoints } from '@fastgpt/service/support/permission/auth/team';
import { getRunningUserInfoByTmbId } from '@fastgpt/service/support/user/team/utils';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

describe('EvaluationTargetService', () => {
  let teamId: string;
  let tmbId: string;
  let workflowTargetId: string;
  let apiTargetId: string;
  let functionTargetId: string;
  let auth: AuthModeType;

  beforeAll(async () => {
    // 数据库连接在 setup.ts 中处理
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    auth = { req: {} as any, authToken: true };
  });

  afterAll(async () => {
    // 清理测试数据
    await MongoEvalTarget.deleteMany({ teamId });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock parseHeaderCert - 返回正确的ObjectId类型
    (parseHeaderCert as any).mockResolvedValue({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId)
    });
  });

  describe('createTarget', () => {
    test('应该成功创建工作流目标', async () => {
      const params: CreateTargetParams = {
        name: 'Customer Service Bot',
        description: 'Workflow target for customer service evaluation',
        type: 'workflow',
        config: {
          appId: new Types.ObjectId().toString(),
          chatConfig: { temperature: 0.7, maxTokens: 1000 }
        } as WorkflowConfig
      };

      const target = await EvaluationTargetService.createTarget(params, auth);
      workflowTargetId = target._id.toString();

      expect(target.name).toBe(params.name);
      expect(target.description).toBe(params.description);
      expect(target.type).toBe('workflow');
      expect(target.config).toEqual(params.config);
      expect(target.teamId.toString()).toBe(teamId);
      expect(target.tmbId.toString()).toBe(tmbId);
    });

    test('应该成功创建 API 目标', async () => {
      const params: CreateTargetParams = {
        name: 'External API Service',
        description: 'External HTTP API for evaluation',
        type: 'api',
        config: {
          url: 'https://api.example.com/chat',
          method: 'POST',
          headers: {
            Authorization: 'Bearer token123',
            'Content-Type': 'application/json'
          },
          body: '{"message": "{{question}}", "context": "{{globalVariables}}"}',
          timeout: 30000
        } as ApiConfig
      };

      const target = await EvaluationTargetService.createTarget(params, auth);
      apiTargetId = target._id.toString();

      expect(target.name).toBe(params.name);
      expect(target.type).toBe('api');
    });

    test('应该成功创建函数目标', async () => {
      const params: CreateTargetParams = {
        name: 'Custom Processing Function',
        description: 'Custom JavaScript function for processing',
        type: 'function',
        config: {
          code: `
            // 简单的回声函数
            return "Echo: " + input.question + " (Expected: " + input.expectedResponse + ")";
          `,
          timeout: 5000
        } as FunctionConfig
      };

      const target = await EvaluationTargetService.createTarget(params, auth);
      functionTargetId = target._id.toString();

      expect(target.name).toBe(params.name);
      expect(target.type).toBe('function');
    });

    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        name: 'Invalid Target'
        // 缺少 type 和 config
      };

      await expect(
        EvaluationTargetService.createTarget(invalidParams as any, auth)
      ).rejects.toThrow();
    });
  });

  describe('getTarget', () => {
    test('应该成功获取目标', async () => {
      // 先创建一个目标
      const params: CreateTargetParams = {
        name: 'Target for Get Test',
        description: 'Workflow target for get test',
        type: 'workflow',
        config: {
          appId: new Types.ObjectId().toString(),
          chatConfig: { temperature: 0.7, maxTokens: 1000 }
        } as WorkflowConfig
      };
      const created = await EvaluationTargetService.createTarget(params, auth);

      const target = await EvaluationTargetService.getTarget(created._id, auth);

      expect(target._id.toString()).toBe(created._id.toString());
      expect(target.name).toBe('Target for Get Test');
      expect(target.type).toBe('workflow');
    });

    test('目标不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationTargetService.getTarget(nonExistentId, auth)).rejects.toThrow(
        'Target not found'
      );
    });
  });

  describe('updateTarget', () => {
    test('应该成功更新目标', async () => {
      // 先创建一个目标
      const params: CreateTargetParams = {
        name: 'Target for Update Test',
        description: 'Original description',
        type: 'workflow',
        config: {
          appId: new Types.ObjectId().toString(),
          chatConfig: { temperature: 0.7, maxTokens: 1000 }
        } as WorkflowConfig
      };
      const created = await EvaluationTargetService.createTarget(params, auth);

      const updates = {
        name: 'Updated Target Name',
        description: 'Updated description for the target'
      };

      await EvaluationTargetService.updateTarget(created._id, updates, auth);

      const updatedTarget = await EvaluationTargetService.getTarget(created._id, auth);
      expect(updatedTarget.name).toBe(updates.name);
      expect(updatedTarget.description).toBe(updates.description);
    });
  });

  describe('listTargets', () => {
    test('应该成功获取目标列表', async () => {
      // 先创建一些目标
      await Promise.all([
        EvaluationTargetService.createTarget(
          {
            name: 'List Test Target 1',
            type: 'workflow',
            config: { appId: new Types.ObjectId().toString(), chatConfig: {} } as WorkflowConfig
          },
          auth
        ),
        EvaluationTargetService.createTarget(
          {
            name: 'List Test Target 2',
            type: 'api',
            config: { url: 'https://api.example.com', method: 'POST' } as ApiConfig
          },
          auth
        ),
        EvaluationTargetService.createTarget(
          {
            name: 'List Test Target 3',
            type: 'function',
            config: { code: 'return "test";' } as FunctionConfig
          },
          auth
        )
      ]);

      const result = await EvaluationTargetService.listTargets(auth, 1, 10);

      expect(Array.isArray(result.targets)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.targets.length).toBeGreaterThanOrEqual(3);
    });

    test('应该支持搜索功能', async () => {
      // 先创建一个目标
      await EvaluationTargetService.createTarget(
        {
          name: 'Searchable Customer Target',
          type: 'workflow',
          config: { appId: new Types.ObjectId().toString(), chatConfig: {} } as WorkflowConfig
        },
        auth
      );

      const result = await EvaluationTargetService.listTargets(auth, 1, 10, 'Customer');

      expect(Array.isArray(result.targets)).toBe(true);
      expect(result.targets.some((target) => target.name.includes('Customer'))).toBe(true);
    });
  });

  describe('testTarget', () => {
    test('应该测试目标连通性', async () => {
      // 先创建一个工作流目标
      const appId = new Types.ObjectId().toString();
      const params: CreateTargetParams = {
        name: 'Test Target for Connectivity',
        type: 'workflow',
        config: {
          appId,
          chatConfig: { temperature: 0.7, maxTokens: 1000 }
        } as WorkflowConfig
      };
      const created = await EvaluationTargetService.createTarget(params, auth);

      // Mock app existence for workflow target
      (MongoApp.findById as any).mockResolvedValue({
        _id: appId,
        name: 'Test App'
      });

      const result = await EvaluationTargetService.testTarget(created._id, auth);

      expect(result.success).toBe(true);
      expect(result.message).toContain('valid');
    });
  });
});

describe('WorkflowTarget', () => {
  let workflowTarget: WorkflowTarget;
  const testInput: EvalInput = {
    question: 'How can I reset my password?',
    expectedResponse: 'You can reset your password by clicking the forgot password link.',
    globalVariables: { user_id: '12345', language: 'en' }
  };

  beforeEach(() => {
    const config: WorkflowConfig = {
      appId: new Types.ObjectId().toString(),
      chatConfig: { temperature: 0.5 }
    };
    workflowTarget = new WorkflowTarget(config, 'workflow-target-id');
  });

  test('应该成功执行工作流', async () => {
    // Mock dependencies
    const mockAppData = {
      _id: 'app-id',
      teamId: 'team-id',
      tmbId: 'tmb-id'
    };

    const mockChatInfo = {
      timezone: 'UTC',
      externalProvider: {}
    };

    const mockVersionInfo = {
      nodes: [{ nodeId: 'start', type: 'start' }],
      edges: [],
      chatConfig: { temperature: 0.7 }
    };

    const mockRunningUserInfo = { userId: 'user-id' };

    const mockWorkflowResult = {
      assistantResponses: [
        {
          text: {
            content:
              'To reset your password, please visit the settings page and click on "Reset Password".'
          }
        }
      ],
      flowUsages: [{ totalPoints: 10 }]
    };

    (MongoApp.findById as any).mockResolvedValue(mockAppData);
    (getUserChatInfoAndAuthTeamPoints as any).mockResolvedValue(mockChatInfo);
    (getAppLatestVersion as any).mockResolvedValue(mockVersionInfo);
    (getRunningUserInfoByTmbId as any).mockResolvedValue(mockRunningUserInfo);
    (dispatchWorkFlow as any).mockResolvedValue(mockWorkflowResult);

    const result = await workflowTarget.execute(testInput);

    expect(result.response).toContain('reset your password');
    expect(result.usage).toEqual([{ totalPoints: 10 }]);
    expect(typeof result.responseTime).toBe('number');
    expect(result.responseTime).toBeGreaterThan(0);

    expect(dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'chat',
        variables: testInput.globalVariables,
        query: expect.arrayContaining([
          expect.objectContaining({
            text: { content: testInput.question }
          })
        ])
      })
    );
  });

  test('应该处理应用不存在的情况', async () => {
    (MongoApp.findById as any).mockResolvedValue(null);

    await expect(workflowTarget.execute(testInput)).rejects.toThrow('App not found');
  });

  test('应该解析历史对话', async () => {
    const inputWithHistory = {
      ...testInput,
      history: JSON.stringify([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' }
      ])
    };

    const mockAppData = { _id: 'app-id', teamId: 'team-id', tmbId: 'tmb-id' };
    const mockChatInfo = { timezone: 'UTC', externalProvider: {} };
    const mockVersionInfo = { nodes: [], edges: [], chatConfig: {} };
    const mockRunningUserInfo = { userId: 'user-id' };
    const mockWorkflowResult = {
      assistantResponses: [{ text: { content: 'Response' } }],
      flowUsages: []
    };

    (MongoApp.findById as any).mockResolvedValue(mockAppData);
    (getUserChatInfoAndAuthTeamPoints as any).mockResolvedValue(mockChatInfo);
    (getAppLatestVersion as any).mockResolvedValue(mockVersionInfo);
    (getRunningUserInfoByTmbId as any).mockResolvedValue(mockRunningUserInfo);
    (dispatchWorkFlow as any).mockResolvedValue(mockWorkflowResult);

    await workflowTarget.execute(inputWithHistory);

    expect(dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        histories: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' }
        ]
      })
    );
  });

  test('应该处理无效的历史对话 JSON', async () => {
    const inputWithBadHistory = {
      ...testInput,
      history: 'invalid json'
    };

    const mockAppData = { _id: 'app-id', teamId: 'team-id', tmbId: 'tmb-id' };
    const mockChatInfo = { timezone: 'UTC', externalProvider: {} };
    const mockVersionInfo = { nodes: [], edges: [], chatConfig: {} };
    const mockRunningUserInfo = { userId: 'user-id' };
    const mockWorkflowResult = {
      assistantResponses: [{ text: { content: 'Response' } }],
      flowUsages: []
    };

    (MongoApp.findById as any).mockResolvedValue(mockAppData);
    (getUserChatInfoAndAuthTeamPoints as any).mockResolvedValue(mockChatInfo);
    (getAppLatestVersion as any).mockResolvedValue(mockVersionInfo);
    (getRunningUserInfoByTmbId as any).mockResolvedValue(mockRunningUserInfo);
    (dispatchWorkFlow as any).mockResolvedValue(mockWorkflowResult);

    await workflowTarget.execute(inputWithBadHistory);

    expect(dispatchWorkFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        histories: [] // 应该回退到空数组
      })
    );
  });

  test('应该验证应用存在性', async () => {
    (MongoApp.findById as any).mockResolvedValue({ _id: 'app-id' });

    const isValid = await workflowTarget.validate();
    expect(isValid).toBe(true);
  });

  test('应该检测应用不存在', async () => {
    (MongoApp.findById as any).mockResolvedValue(null);

    const isValid = await workflowTarget.validate();
    expect(isValid).toBe(false);
  });
});

describe('ApiTarget', () => {
  let apiTarget: ApiTarget;
  const testInput: EvalInput = {
    question: 'What is the weather like today?',
    expectedResponse: 'The weather is sunny.',
    globalVariables: { location: 'New York', units: 'metric' }
  };

  beforeEach(() => {
    const config: ApiConfig = {
      url: 'https://api.example.com/chat',
      method: 'POST',
      headers: { Authorization: 'Bearer token123' },
      body: '{"query": "{{question}}", "location": "{{location}}"}',
      timeout: 30000
    };
    apiTarget = new ApiTarget(config, 'api-target-id');
  });

  test('应该成功执行 API 调用', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        response: 'The weather in New York is sunny with a temperature of 22°C.'
      })
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await apiTarget.execute(testInput);

    expect(result.response).toContain('sunny');
    expect(result.usage).toBeNull();
    expect(typeof result.responseTime).toBe('number');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/chat',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token123',
          'Content-Type': 'application/json'
        }),
        body: expect.stringContaining('What is the weather like today?')
      })
    );
  });

  test('应该替换模板变量', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ response: 'Weather response' })
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    await apiTarget.execute(testInput);

    const callArgs = (global.fetch as any).mock.calls[0];
    const requestBody = callArgs[1].body;

    expect(requestBody).toContain('What is the weather like today?');
    expect(requestBody).toContain('New York');
  });

  test('应该处理 HTTP 错误', async () => {
    const mockResponse = {
      ok: false,
      status: 404,
      statusText: 'Not Found'
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    await expect(apiTarget.execute(testInput)).rejects.toThrow('HTTP 404: Not Found');
  });

  test('应该处理网络错误', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network timeout'));

    await expect(apiTarget.execute(testInput)).rejects.toThrow('API call failed: Network timeout');
  });

  test('应该处理非 JSON 响应', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue('Simple string response')
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await apiTarget.execute(testInput);
    expect(result.response).toBe('Simple string response');
  });

  test('应该处理复杂对象响应', async () => {
    const complexResponse = {
      data: { message: 'Complex response' },
      metadata: { timestamp: '2024-01-01' }
    };

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue(complexResponse)
    };

    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await apiTarget.execute(testInput);
    expect(result.response).toBe(JSON.stringify(complexResponse));
  });

  test('应该验证 API 连通性', async () => {
    const mockResponse = { ok: true };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const isValid = await apiTarget.validate();
    expect(isValid).toBe(true);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/chat',
      expect.objectContaining({
        method: 'HEAD'
      })
    );
  });

  test('应该检测 API 不可用', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Connection refused'));

    const isValid = await apiTarget.validate();
    expect(isValid).toBe(false);
  });

  test('应该处理变量替换中的特殊字符', async () => {
    const inputWithSpecialChars = {
      ...testInput,
      question: 'What is "machine learning"?',
      globalVariables: { location: 'New York, NY', units: 'metric°C' }
    };

    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ response: 'ML response' })
    };

    vi.clearAllMocks();
    (global.fetch as any).mockResolvedValue(mockResponse);

    await apiTarget.execute(inputWithSpecialChars);

    const callArgs = (global.fetch as any).mock.calls[0];
    const requestBody = callArgs[1].body;

    expect(requestBody).toContain('What is "machine learning"?');
    expect(requestBody).toContain('New York, NY');
  });
});

describe('FunctionTarget', () => {
  let functionTarget: FunctionTarget;
  const testInput: EvalInput = {
    question: 'Calculate 2 + 2',
    expectedResponse: '4',
    globalVariables: { precision: 2 }
  };

  test('应该成功执行简单函数', async () => {
    const config: FunctionConfig = {
      code: `
        // 简单的计算器
        const question = input.question;
        if (question.includes('2 + 2')) {
          return 'The result is 4';
        }
        return 'I cannot calculate that';
      `,
      timeout: 5000
    };

    functionTarget = new FunctionTarget(config, 'function-target-id');

    const result = await functionTarget.execute(testInput);

    expect(result.response).toBe('The result is 4');
    expect(result.usage).toBeNull();
    expect(typeof result.responseTime).toBe('number');
  });

  test('应该访问输入参数', async () => {
    const config: FunctionConfig = {
      code: `
        const { question, expectedResponse, globalVariables } = input;
        return 'Q: ' + question + ', Expected: ' + expectedResponse + ', Precision: ' + globalVariables.precision;
      `,
      timeout: 5000
    };

    functionTarget = new FunctionTarget(config, 'function-target-id');

    const result = await functionTarget.execute(testInput);

    expect(result.response).toContain('Q: Calculate 2 + 2');
    expect(result.response).toContain('Expected: 4');
    expect(result.response).toContain('Precision: 2');
  });

  test('应该处理返回对象', async () => {
    const config: FunctionConfig = {
      code: `
        return {
          answer: '4',
          confidence: 0.95,
          method: 'arithmetic'
        };
      `,
      timeout: 5000
    };

    functionTarget = new FunctionTarget(config, 'function-target-id');

    const result = await functionTarget.execute(testInput);

    const responseObj = JSON.parse(result.response);
    expect(responseObj.answer).toBe('4');
    expect(responseObj.confidence).toBe(0.95);
    expect(responseObj.method).toBe('arithmetic');
  });

  test('应该处理函数执行错误', async () => {
    const config: FunctionConfig = {
      code: 'throw new Error("Intentional function error");',
      timeout: 5000
    };

    functionTarget = new FunctionTarget(config, 'function-target-id');

    await expect(functionTarget.execute(testInput)).rejects.toThrow(
      'Function execution failed: Intentional function error'
    );
  });

  test('应该处理语法错误', async () => {
    const config: FunctionConfig = {
      code: 'invalid javascript syntax [[[',
      timeout: 5000
    };

    functionTarget = new FunctionTarget(config, 'function-target-id');

    await expect(functionTarget.execute(testInput)).rejects.toThrow('Function execution failed:');
  });

  test('应该验证函数语法', async () => {
    const config: FunctionConfig = {
      code: 'return "valid function";',
      timeout: 5000
    };

    functionTarget = new FunctionTarget(config, 'function-target-id');

    const isValid = await functionTarget.validate();
    expect(isValid).toBe(true);
  });

  test('应该检测无效语法', async () => {
    const config: FunctionConfig = {
      code: 'function without proper syntax {{{',
      timeout: 5000
    };

    functionTarget = new FunctionTarget(config, 'function-target-id');

    const isValid = await functionTarget.validate();
    expect(isValid).toBe(false);
  });
});

describe('createTargetInstance', () => {
  test('应该创建工作流目标实例', () => {
    const config = {
      _id: 'target-id',
      name: 'Test Workflow Target',
      type: 'workflow' as const,
      config: {
        appId: 'app-id',
        chatConfig: {}
      }
    } as any;

    const instance = createTargetInstance(config);

    expect(instance).toBeInstanceOf(WorkflowTarget);
  });

  test('应该创建 API 目标实例', () => {
    const config = {
      _id: 'target-id',
      name: 'Test API Target',
      type: 'api' as const,
      config: {
        url: 'https://api.example.com',
        method: 'POST',
        headers: {},
        timeout: 30000
      }
    } as any;

    const instance = createTargetInstance(config);

    expect(instance).toBeInstanceOf(ApiTarget);
  });

  test('应该创建函数目标实例', () => {
    const config = {
      _id: 'target-id',
      name: 'Test Function Target',
      type: 'function' as const,
      config: {
        code: 'return "test";',
        timeout: 5000
      }
    } as any;

    const instance = createTargetInstance(config);

    expect(instance).toBeInstanceOf(FunctionTarget);
  });

  test('应该处理未知目标类型', () => {
    const config = {
      _id: 'target-id',
      name: 'Unknown Target',
      type: 'unknown' as any,
      config: {}
    } as any;

    expect(() => createTargetInstance(config)).toThrow('Unknown target type: unknown');
  });
});

describe('EvaluationTargetService - Integration', () => {
  let teamId: string;
  let tmbId: string;
  let targetId: string;
  let auth: AuthModeType;

  beforeAll(async () => {
    // 数据库连接在 setup.ts 中处理
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    auth = { req: {} as any, authToken: true };
  });

  afterAll(async () => {
    await MongoEvalTarget.deleteMany({ teamId });
  });

  test('应该执行完整的目标测试流程', async () => {
    // 1. 创建目标
    const params: CreateTargetParams = {
      name: 'Integration Test Target',
      description: 'End-to-end integration test for function target',
      type: 'function',
      config: {
        code: `
          // 处理不同类型的问题
          const question = input.question.toLowerCase();
          
          if (question.includes('weather')) {
            return 'The weather is sunny today.';
          }
          
          if (question.includes('time')) {
            return 'The current time is 12:00 PM.';
          }
          
          if (question.includes('calculate') || question.includes('+')) {
            // 简单的数学计算
            const match = question.match(/(\\d+)\\s*\\+\\s*(\\d+)/);
            if (match) {
              const result = parseInt(match[1]) + parseInt(match[2]);
              return 'The result is ' + result;
            }
          }
          
          return 'I received your question: ' + input.question;
        `,
        timeout: 5000
      } as FunctionConfig
    };

    const target = await EvaluationTargetService.createTarget(params, auth);
    targetId = target._id;

    // 2. 测试不同类型的输入
    const testCases = [
      {
        input: { question: 'What is the weather like?', expectedResponse: 'Sunny' },
        expectedContains: 'sunny'
      },
      {
        input: { question: 'What time is it?', expectedResponse: '12:00' },
        expectedContains: 'time is'
      },
      {
        input: { question: 'Calculate 5 + 3', expectedResponse: '8' },
        expectedContains: 'result is 8'
      },
      {
        input: { question: 'Hello there', expectedResponse: 'Hi' },
        expectedContains: 'I received your question'
      }
    ];

    const targetInstance = createTargetInstance(target);

    for (const testCase of testCases) {
      const result = await targetInstance.execute({
        ...testCase.input,
        globalVariables: {}
      });

      expect(result.response.toLowerCase()).toContain(testCase.expectedContains.toLowerCase());
      expect(typeof result.responseTime).toBe('number');
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
    }

    // 3. 测试目标验证
    const isValid = await targetInstance.validate();
    expect(isValid).toBe(true);

    // 4. 测试连通性
    const testResult = await EvaluationTargetService.testTarget(targetId, auth);
    expect(testResult.success).toBe(true);

    // 5. 删除目标
    await EvaluationTargetService.deleteTarget(targetId, auth);

    await expect(EvaluationTargetService.getTarget(targetId, auth)).rejects.toThrow(
      'Target not found'
    );
  });
});
