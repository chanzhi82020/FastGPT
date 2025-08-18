import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';

// Import API handlers directly - use named imports
import { handler as createHandler } from '@/pages/api/core/evaluation/target/create';
import { handler as listHandler } from '@/pages/api/core/evaluation/target/list';
import { handler as detailHandler } from '@/pages/api/core/evaluation/target/detail';
import { handler as updateHandler } from '@/pages/api/core/evaluation/target/update';
import { handler as deleteHandler } from '@/pages/api/core/evaluation/target/delete';
import { handler as testHandler } from '@/pages/api/core/evaluation/target/test';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/target', () => ({
  EvaluationTargetService: {
    createTarget: vi.fn(),
    listTargets: vi.fn(),
    getTarget: vi.fn(),
    updateTarget: vi.fn(),
    deleteTarget: vi.fn(),
    testTarget: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/auth/common', () => ({
  authCert: vi.fn().mockResolvedValue({
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId()
  })
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

import { EvaluationTargetService } from '@fastgpt/service/core/evaluation/target';
import { addLog } from '@fastgpt/service/common/system/log';
// Define target types as strings since enum doesn't exist
const EvaluationTargetTypeEnum = {
  workflow: 'workflow',
  api: 'api',
  function: 'function'
} as const;

describe('Target API Handler Tests (Direct Function Calls)', () => {
  const mockTarget = {
    _id: new Types.ObjectId(),
    name: 'Test Target',
    description: 'Test Description',
    type: EvaluationTargetTypeEnum.workflow,
    config: {
      appId: new Types.ObjectId().toString(),
      variables: { customVar: 'test value' }
    },
    teamId: new Types.ObjectId(),
    tmbId: new Types.ObjectId(),
    createTime: new Date(),
    updateTime: new Date()
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Create Target Handler', () => {
    test('应该成功创建Workflow应用目标', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          name: 'Test Workflow Target',
          description: 'Test Description',
          type: EvaluationTargetTypeEnum.workflow,
          config: {
            appId: new Types.ObjectId().toString(),
            variables: { customVar: 'test value' }
          }
        }
      } as any;

      (EvaluationTargetService.createTarget as any).mockResolvedValue(mockTarget);

      const result = await createHandler(mockReq);

      expect(EvaluationTargetService.createTarget).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Workflow Target',
          description: 'Test Description',
          type: EvaluationTargetTypeEnum.workflow,
          config: mockReq.body.config
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockTarget);
      expect(addLog.info).toHaveBeenCalledWith(
        '[Evaluation Target] 目标创建成功',
        expect.objectContaining({
          targetId: mockTarget._id,
          name: mockTarget.name,
          type: mockTarget.type
        })
      );
    });

    test('应该成功创建API目标', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          name: 'Test API Target',
          description: 'Test Description',
          type: EvaluationTargetTypeEnum.api,
          config: {
            url: 'https://api.example.com/chat',
            method: 'POST',
            headers: { Authorization: 'Bearer token' },
            body: { message: '{{question}}' }
          }
        }
      } as any;

      const apiTarget = { ...mockTarget, type: EvaluationTargetTypeEnum.api };
      (EvaluationTargetService.createTarget as any).mockResolvedValue(apiTarget);

      const result = await createHandler(mockReq);

      expect(result.type).toBe(EvaluationTargetTypeEnum.api);
    });

    test('应该成功创建函数目标', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          name: 'Test Function Target',
          description: 'Test Description',
          type: EvaluationTargetTypeEnum.function,
          config: {
            code: 'function process(question, variables) { return { answer: "Generated response" }; }'
          }
        }
      } as any;

      const functionTarget = { ...mockTarget, type: EvaluationTargetTypeEnum.function };
      (EvaluationTargetService.createTarget as any).mockResolvedValue(functionTarget);

      const result = await createHandler(mockReq);

      expect(result.type).toBe(EvaluationTargetTypeEnum.function);
    });

    test('应该拒绝空名称', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          name: '',
          type: EvaluationTargetTypeEnum.workflow,
          config: {}
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Target name is required');
    });

    test('应该拒绝无效目标类型', async () => {
      const mockReq = {
        body: {
          name: 'Test Target',
          type: 'invalid',
          config: {}
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Unknown target type: invalid');
    });

    test('应该拒绝缺少配置', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          name: 'Test Target',
          type: EvaluationTargetTypeEnum.workflow
          // 缺少 config
        }
      } as any;

      await expect(createHandler(mockReq)).rejects.toMatch('Target config is required');
    });
  });

  describe('List Targets Handler', () => {
    test('应该成功获取目标列表', async () => {
      const mockReq = {
        body: { pageNum: 1, pageSize: 10 }
      } as any;

      const mockResult = {
        targets: [mockTarget],
        total: 1
      };

      (EvaluationTargetService.listTargets as any).mockResolvedValue(mockResult);

      const result = await listHandler(mockReq);

      expect(EvaluationTargetService.listTargets).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1,
        10,
        undefined
      );
      expect(result).toEqual({
        list: mockResult.targets,
        total: mockResult.total
      });
    });

    test('应该处理搜索和类型过滤参数', async () => {
      const mockReq = {
        body: {
          pageNum: 1,
          pageSize: 10,
          searchKey: 'test search'
        }
      } as any;

      const mockResult = { targets: [], total: 0 };
      (EvaluationTargetService.listTargets as any).mockResolvedValue(mockResult);

      await listHandler(mockReq);

      expect(EvaluationTargetService.listTargets).toHaveBeenCalledWith(
        expect.objectContaining({
          req: mockReq,
          authToken: true
        }),
        1,
        10,
        'test search'
      );
    });
  });

  describe('Get Target Detail Handler', () => {
    test('应该成功获取目标详情', async () => {
      const targetId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'GET',
        query: { id: targetId }
      } as any;

      (EvaluationTargetService.getTarget as any).mockResolvedValue(mockTarget);

      const result = await detailHandler(mockReq);

      expect(EvaluationTargetService.getTarget).toHaveBeenCalledWith(
        targetId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockTarget);
    });

    test('应该拒绝缺少ID的请求', async () => {
      const mockReq = {
        method: 'GET',
        query: {}
      } as any;

      await expect(detailHandler(mockReq)).rejects.toMatch('Target ID is required');
    });
  });

  describe('Update Target Handler', () => {
    test('应该成功更新目标', async () => {
      const targetId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'PUT',
        query: { id: targetId },
        body: {
          name: 'Updated Target',
          description: 'Updated Description',
          config: {
            appId: new Types.ObjectId().toString(),
            variables: { updatedVar: 'updated value' }
          }
        }
      } as any;

      (EvaluationTargetService.updateTarget as any).mockResolvedValue(undefined);

      const result = await updateHandler(mockReq);

      expect(EvaluationTargetService.updateTarget).toHaveBeenCalledWith(
        targetId,
        expect.objectContaining({
          name: 'Updated Target',
          description: 'Updated Description',
          config: mockReq.body.config
        }),
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Target updated successfully' });
    });
  });

  describe('Delete Target Handler', () => {
    test('应该成功删除目标', async () => {
      const targetId = new Types.ObjectId().toString();
      const mockReq = {
        method: 'DELETE',
        query: { id: targetId }
      } as any;

      (EvaluationTargetService.deleteTarget as any).mockResolvedValue(undefined);

      const result = await deleteHandler(mockReq);

      expect(EvaluationTargetService.deleteTarget).toHaveBeenCalledWith(
        targetId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual({ message: 'Target deleted successfully' });
    });
  });

  describe('Test Target Handler', () => {
    test('应该成功测试目标', async () => {
      const mockReq = {
        method: 'POST',
        body: {
          targetId: new Types.ObjectId().toString()
        }
      } as any;

      const mockTestResult = {
        success: true,
        message: 'Test completed successfully'
      };

      (EvaluationTargetService.testTarget as any).mockResolvedValue(mockTestResult);

      const result = await testHandler(mockReq);

      expect(EvaluationTargetService.testTarget).toHaveBeenCalledWith(
        mockReq.body.targetId,
        expect.objectContaining({
          req: mockReq,
          authToken: true
        })
      );
      expect(result).toEqual(mockTestResult);
    });

    test('应该拒绝缺少目标ID的请求', async () => {
      const mockReq = {
        method: 'POST',
        body: {}
      } as any;

      await expect(testHandler(mockReq)).rejects.toMatch('Target ID is required');
    });
  });
});
