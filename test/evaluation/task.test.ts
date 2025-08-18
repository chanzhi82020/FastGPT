import { beforeAll, afterAll, beforeEach, describe, test, expect, vi } from 'vitest';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import { MongoEvaluation, MongoEvalItem } from '@fastgpt/service/core/evaluation/task/schema';
import { MongoEvalDataset } from '@fastgpt/service/core/evaluation/dataset/schema';
import { MongoEvalTarget } from '@fastgpt/service/core/evaluation/target/schema';
import { MongoEvalMetric } from '@fastgpt/service/core/evaluation/metric/schema';
import type { CreateEvaluationParams } from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType } from '@fastgpt/service/support/permission/type';
import { EvaluationStatusEnum } from '@fastgpt/global/core/evaluation/constants';
import { Types } from '@fastgpt/service/common/mongo';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/mq', () => ({
  evaluationTaskQueue: {
    add: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/wallet/usage/controller', () => ({
  createTrainingUsage: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  parseHeaderCert: vi.fn()
}));

import { evaluationTaskQueue } from '@fastgpt/service/core/evaluation/mq';
import { createTrainingUsage } from '@fastgpt/service/support/wallet/usage/controller';
import { addLog } from '@fastgpt/service/common/system/log';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

describe('EvaluationTaskService', () => {
  let teamId: string;
  let tmbId: string;
  let datasetId: string;
  let targetId: string;
  let metricId: string;
  let auth: AuthModeType;

  beforeAll(async () => {
    // 数据库连接在 setup.ts 中处理
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    auth = { req: {} as any, authToken: true };

    // 创建测试数据
    const dataset = await MongoEvalDataset.create({
      teamId,
      tmbId,
      name: 'Test Dataset',
      description: 'Dataset for task testing',
      dataFormat: 'json',
      columns: [
        { name: 'question', type: 'string', required: true },
        { name: 'expectedResponse', type: 'string', required: true }
      ],
      dataItems: [
        { question: 'What is AI?', expectedResponse: 'Artificial Intelligence' },
        { question: 'What is ML?', expectedResponse: 'Machine Learning' }
      ]
    });
    datasetId = dataset._id.toString();

    const target = await MongoEvalTarget.create({
      teamId,
      tmbId,
      name: 'Test Target',
      description: 'Target for task testing',
      type: 'function',
      config: {
        code: 'return "AI is " + input.question;',
        timeout: 5000
      }
    });
    targetId = target._id.toString();

    const metric = await MongoEvalMetric.create({
      teamId,
      tmbId,
      name: 'Test Metric',
      description: 'Metric for task testing',
      type: 'function',
      config: {
        code: 'return { score: 90, details: { test: true } };',
        timeout: 5000
      }
    });
    metricId = metric._id.toString();
  });

  afterAll(async () => {
    // 清理测试数据
    await Promise.all([
      MongoEvaluation.deleteMany({ teamId }),
      MongoEvalItem.deleteMany({}),
      MongoEvalDataset.deleteMany({ teamId }),
      MongoEvalTarget.deleteMany({ teamId }),
      MongoEvalMetric.deleteMany({ teamId })
    ]);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock createTrainingUsage
    (createTrainingUsage as any).mockResolvedValue({ billId: new Types.ObjectId() });
    // Mock parseHeaderCert - 返回正确的ObjectId类型
    (parseHeaderCert as any).mockResolvedValue({
      teamId: new Types.ObjectId(teamId),
      tmbId: new Types.ObjectId(tmbId)
    });
  });

  describe('createEvaluation', () => {
    test('应该成功创建评估任务', async () => {
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation',
        description: 'A test evaluation for unit testing',
        datasetId,
        targetId,
        metricIds: [metricId]
      };

      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);

      expect(evaluation.name).toBe(params.name);
      expect(evaluation.description).toBe(params.description);
      expect(evaluation.datasetId.toString()).toBe(datasetId);
      expect(evaluation.targetId.toString()).toBe(targetId);
      expect(evaluation.metricIds.map((id) => id.toString())).toEqual([metricId]);
      expect(evaluation.teamId.toString()).toBe(teamId);
      expect(evaluation.tmbId.toString()).toBe(tmbId);
      expect(evaluation.status).toBe(EvaluationStatusEnum.queuing);
      expect(Types.ObjectId.isValid(evaluation.usageId)).toBe(true);

      // 验证创建用量记录被调用
      expect(createTrainingUsage).toHaveBeenCalledWith({
        teamId: expect.any(Object), // ObjectId from auth
        tmbId: expect.any(Object), // ObjectId from auth
        appName: params.name,
        billSource: expect.any(String)
      });
    });

    test('缺少必填字段时应该抛出错误', async () => {
      const invalidParams = {
        name: 'Invalid Evaluation'
        // 缺少其他必填字段
      };

      await expect(
        EvaluationTaskService.createEvaluation(invalidParams as any, auth)
      ).rejects.toThrow();
    });
  });

  describe('getEvaluation', () => {
    test('应该成功获取评估任务', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Get Test Evaluation',
        description: 'Test evaluation for get operation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      const evaluation = await EvaluationTaskService.getEvaluation(created._id, auth);

      expect(evaluation._id.toString()).toBe(created._id.toString());
      expect(evaluation.name).toBe('Get Test Evaluation');
      expect(evaluation.status).toBe(EvaluationStatusEnum.queuing);
    });

    test('评估任务不存在时应该抛出错误', async () => {
      const nonExistentId = new Types.ObjectId().toString();

      await expect(EvaluationTaskService.getEvaluation(nonExistentId, auth)).rejects.toThrow(
        'Evaluation not found'
      );
    });
  });

  describe('updateEvaluation', () => {
    test('应该成功更新评估任务', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Update Test Evaluation',
        description: 'Original description',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      const updates = {
        name: 'Updated Test Evaluation',
        description: 'Updated description'
      };

      await EvaluationTaskService.updateEvaluation(created._id, updates, auth);

      const updatedEvaluation = await EvaluationTaskService.getEvaluation(created._id, auth);
      expect(updatedEvaluation.name).toBe(updates.name);
      expect(updatedEvaluation.description).toBe(updates.description);
    });
  });

  describe('listEvaluations', () => {
    test('应该成功获取评估任务列表', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'List Test Evaluation',
        description: 'Test evaluation for list operation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      const result = await EvaluationTaskService.listEvaluations(auth, 1, 10);

      expect(Array.isArray(result.evaluations)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.evaluations.length).toBeGreaterThanOrEqual(1);

      const evaluation = result.evaluations.find(
        (e) => e._id.toString() === created._id.toString()
      );
      expect(evaluation).toBeDefined();
      expect(evaluation?.name).toBe('List Test Evaluation');
    });

    test('应该支持搜索功能', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Searchable Test Evaluation',
        description: 'Test evaluation for search operation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      await EvaluationTaskService.createEvaluation(params, auth);

      const result = await EvaluationTaskService.listEvaluations(auth, 1, 10, 'Searchable');

      expect(Array.isArray(result.evaluations)).toBe(true);
      expect(result.evaluations.some((evaluation) => evaluation.name.includes('Searchable'))).toBe(
        true
      );
    });
  });

  describe('startEvaluation', () => {
    test('应该成功启动评估任务', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'Start Test Evaluation',
        description: 'Test evaluation for start operation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      await EvaluationTaskService.startEvaluation(created._id, auth);

      // 验证状态已更新
      const evaluation = await EvaluationTaskService.getEvaluation(created._id, auth);
      expect(evaluation.status).toBe(EvaluationStatusEnum.evaluating);

      // 验证任务已提交到队列
      expect(evaluationTaskQueue.add).toHaveBeenCalledWith(
        `eval_task_${created._id}`,
        expect.objectContaining({
          evalId: created._id,
          datasetId: expect.any(Object), // ObjectId from database
          targetId: expect.any(Object), // ObjectId from database
          metricIds: expect.any(Array) // Array of ObjectIds from database
        })
      );

      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`任务已提交到队列: ${created._id}`)
      );
    });

    test('非排队状态的任务不能启动', async () => {
      // 先创建一个评估任务
      const params: CreateEvaluationParams = {
        name: 'No Start Test Evaluation',
        description: 'Test evaluation for no start operation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const created = await EvaluationTaskService.createEvaluation(params, auth);

      // 先更新状态为已完成
      await MongoEvaluation.updateOne(
        { _id: created._id },
        { $set: { status: EvaluationStatusEnum.completed } }
      );

      await expect(EvaluationTaskService.startEvaluation(created._id, auth)).rejects.toThrow(
        'Only queuing evaluations can be started'
      );
    });
  });

  describe('stopEvaluation', () => {
    test('应该成功停止评估任务', async () => {
      // 为这个测试创建专门的evaluation
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for stopEvaluation',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 重置为evaluating状态
      await MongoEvaluation.updateOne(
        { _id: testEvaluationId },
        { $set: { status: EvaluationStatusEnum.evaluating } }
      );

      // 创建一些测试评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test 1', expectedResponse: 'Answer 1' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test 2', expectedResponse: 'Answer 2' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        }
      ]);

      await EvaluationTaskService.stopEvaluation(testEvaluationId, auth);

      // 验证评估任务状态
      const updatedEvaluation = await EvaluationTaskService.getEvaluation(testEvaluationId, auth);
      expect(updatedEvaluation.status).toBe(EvaluationStatusEnum.completed);
      expect(updatedEvaluation.errorMessage).toBe('Manually stopped');
      expect(updatedEvaluation.finishTime).toBeDefined();

      // 验证评估项状态
      const items = await MongoEvalItem.find({ evalId: testEvaluationId });
      items.forEach((item) => {
        expect(item.status).toBe(EvaluationStatusEnum.completed);
        expect(item.errorMessage).toBe('Manually stopped');
        expect(item.finishTime).toBeDefined();
      });

      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`任务已手动停止: ${testEvaluationId}`)
      );
    });
  });

  describe('restartEvaluation', () => {
    test('应该成功重启已完成的评估任务', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for restartEvaluation',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 设置为completed状态用于重启测试
      await MongoEvaluation.updateOne(
        { _id: testEvaluationId },
        {
          $set: {
            status: EvaluationStatusEnum.completed,
            finishTime: new Date(),
            avgScore: 85
          }
        }
      );

      // 创建一些已完成的评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test question 1', expectedResponse: 'Test answer 1' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          response: 'Generated response 1',
          score: 80,
          retry: 2
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test question 2', expectedResponse: 'Test answer 2' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Test error',
          retry: 1
        }
      ]);

      await EvaluationTaskService.restartEvaluation(testEvaluationId, auth);

      // 验证评估任务状态
      const restartedEvaluation = await EvaluationTaskService.getEvaluation(testEvaluationId, auth);
      expect(restartedEvaluation.status).toBe(EvaluationStatusEnum.queuing);
      expect(restartedEvaluation.finishTime).toBeNull();
      expect(restartedEvaluation.avgScore).toBeNull();
      expect(restartedEvaluation.errorMessage).toBeNull();

      // 验证评估项状态
      const items = await MongoEvalItem.find({ evalId: testEvaluationId });
      items.forEach((item) => {
        expect(item.status).toBe(EvaluationStatusEnum.queuing);
        expect(item.response).toBeNull();
        expect(item.errorMessage).toBeNull();
        expect(item.retry).toBe(3);
      });

      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`任务已重置为排队状态: ${testEvaluationId}`)
      );
    });

    test('非已完成状态的任务不能重启', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for restart error',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 更新为evaluating状态
      await MongoEvaluation.updateOne(
        { _id: testEvaluationId },
        { $set: { status: EvaluationStatusEnum.evaluating } }
      );

      await expect(EvaluationTaskService.restartEvaluation(testEvaluationId, auth)).rejects.toThrow(
        'Only completed evaluations can be restarted'
      );
    });
  });

  describe('getEvaluationStats', () => {
    test('应该返回正确的统计信息', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for getEvaluationStats',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建测试评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Q1', expectedResponse: 'A1' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 85
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Q2', expectedResponse: 'A2' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 95
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Q3', expectedResponse: 'A3' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.evaluating
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Q4', expectedResponse: 'A4' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Q5', expectedResponse: 'A5' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Test error'
        }
      ]);

      const stats = await EvaluationTaskService.getEvaluationStats(testEvaluationId, auth);

      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(3); // 2个成功 + 1个错误
      expect(stats.evaluating).toBe(1);
      expect(stats.queuing).toBe(1);
      expect(stats.error).toBe(1);
      expect(stats.avgScore).toBe(90); // (85 + 95) / 2
    });
  });

  describe('listEvaluationItems', () => {
    test('应该成功获取评估项列表', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for listEvaluationItems',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些测试评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test question 1', expectedResponse: 'Test answer 1' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test question 2', expectedResponse: 'Test answer 2' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 85
        }
      ]);

      const result = await EvaluationTaskService.listEvaluationItems(testEvaluationId, auth, 1, 10);

      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe('number');
      expect(result.items.length).toBeGreaterThan(0);

      const item = result.items[0];
      expect(item.evalItemId).toBeDefined();
      expect(item.evalId.toString()).toBe(testEvaluationId.toString());
      expect(item.dataItem).toBeDefined();
    });
  });

  describe('Evaluation Item Operations', () => {
    describe('getEvaluationItem', () => {
      test('应该成功获取评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for getEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          targetId,
          metricIds: [metricId]
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { question: 'Test Item', expectedResponse: 'Test Response' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        const retrievedItem = await EvaluationTaskService.getEvaluationItem(itemId, auth);

        expect(retrievedItem._id.toString()).toBe(itemId);
        expect(retrievedItem.evalId.toString()).toBe(testEvaluationId.toString());
        expect(retrievedItem.dataItem.question).toBe('Test Item');
      });

      test('评估项不存在时应该抛出错误', async () => {
        const nonExistentId = new Types.ObjectId().toString();

        await expect(EvaluationTaskService.getEvaluationItem(nonExistentId, auth)).rejects.toThrow(
          'Evaluation item not found'
        );
      });
    });

    describe('updateEvaluationItem', () => {
      test('应该成功更新评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for updateEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          targetId,
          metricIds: [metricId]
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { question: 'Test Item', expectedResponse: 'Test Response' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        const updates = {
          status: EvaluationStatusEnum.completed,
          score: 88,
          response: 'Updated response'
        };

        await EvaluationTaskService.updateEvaluationItem(itemId, updates, auth);

        const updatedItem = await EvaluationTaskService.getEvaluationItem(itemId, auth);
        expect(updatedItem.status).toBe(updates.status);
        expect(updatedItem.score).toBe(updates.score);
        expect(updatedItem.response).toBe(updates.response);
      });
    });

    describe('retryEvaluationItem', () => {
      test('应该成功重试失败的评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for retryEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          targetId,
          metricIds: [metricId]
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { question: 'Test Item', expectedResponse: 'Test Response' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Test error',
          retry: 2
        });
        const itemId = item._id.toString();

        await EvaluationTaskService.retryEvaluationItem(itemId, auth);

        const retriedItem = await EvaluationTaskService.getEvaluationItem(itemId, auth);
        expect(retriedItem.status).toBe(EvaluationStatusEnum.queuing);
        expect(retriedItem.errorMessage).toBeNull();
        expect(retriedItem.retry).toBeGreaterThanOrEqual(1);

        expect(addLog.info).toHaveBeenCalledWith(
          expect.stringContaining(`评估项已重置为排队状态: ${itemId}`)
        );
      });

      test('非失败状态的评估项不能重试', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for retry error',
          description: 'A test evaluation',
          datasetId,
          targetId,
          metricIds: [metricId]
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { question: 'Test Item', expectedResponse: 'Test Response' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        await expect(EvaluationTaskService.retryEvaluationItem(itemId, auth)).rejects.toThrow(
          'Only failed evaluation items can be retried'
        );
      });
    });

    describe('deleteEvaluationItem', () => {
      test('应该成功删除评估项', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for deleteEvaluationItem',
          description: 'A test evaluation',
          datasetId,
          targetId,
          metricIds: [metricId]
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { question: 'Test Item', expectedResponse: 'Test Response' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        });
        const itemId = item._id.toString();

        await EvaluationTaskService.deleteEvaluationItem(itemId, auth);

        await expect(EvaluationTaskService.getEvaluationItem(itemId, auth)).rejects.toThrow(
          'Evaluation item not found'
        );
      });
    });

    describe('getEvaluationItemResult', () => {
      test('应该返回评估项详细结果', async () => {
        // 创建一个新的evaluation和item用于此测试
        const params: CreateEvaluationParams = {
          name: 'Test Evaluation for getEvaluationItemResult',
          description: 'A test evaluation',
          datasetId,
          targetId,
          metricIds: [metricId]
        };
        const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
        const testEvaluationId = evaluation._id;

        const item = await MongoEvalItem.create({
          evalId: testEvaluationId,
          dataItem: { question: 'Test Item', expectedResponse: 'Test Response' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing,
          response: 'Test response',
          score: 92,
          metricResults: [
            { metricId, metricName: 'Test Metric', score: 92, details: { test: true } }
          ]
        });
        const itemId = item._id.toString();

        const result = await EvaluationTaskService.getEvaluationItemResult(itemId, auth);

        expect(result.item._id.toString()).toBe(itemId);
        expect(result.dataItem.question).toBe('Test Item');
        expect(result.response).toBe('Test response');
        expect(result.score).toBe(92);
        expect(result.metricResults).toHaveLength(1);
        expect(result.metricResults[0].score).toBe(92);
      });
    });
  });

  describe('searchEvaluationItems', () => {
    let testEvaluationId: string;

    beforeEach(async () => {
      // 为每个测试创建新的evaluation和items
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for searchEvaluationItems',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      testEvaluationId = evaluation._id;

      // 创建测试数据
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { question: 'JavaScript question', expectedResponse: 'JS answer' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 85,
          response: 'JavaScript is a programming language'
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Python question', expectedResponse: 'Python answer' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 95,
          response: 'Python is also a programming language'
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Failed question', expectedResponse: 'Failed answer' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 45,
          errorMessage: 'Processing failed'
        }
      ]);
    });

    test('应该按状态搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        status: EvaluationStatusEnum.completed
      });

      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    test('应该按错误状态搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        hasError: true
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].dataItem.question).toBe('Failed question');
    });

    test('应该按分数范围搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        scoreRange: { min: 80, max: 90 }
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].score).toBe(85);
    });

    test('应该按关键词搜索', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        keyword: 'JavaScript'
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].dataItem.question).toContain('JavaScript');
    });

    test('应该支持分页', async () => {
      const result = await EvaluationTaskService.searchEvaluationItems(testEvaluationId, auth, {
        page: 1,
        pageSize: 2
      });

      expect(result.items).toHaveLength(2);
      expect(result.total).toBe(3);
    });
  });

  describe('exportEvaluationResults', () => {
    test('应该成功导出 JSON 格式', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for exportEvaluationResults JSON',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些测试数据
      await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { question: 'Test question', expectedResponse: 'Test answer' },
        targetId,
        metricIds: [metricId],
        status: EvaluationStatusEnum.completed,
        score: 85,
        response: 'Test response'
      });

      const buffer = await EvaluationTaskService.exportEvaluationResults(
        testEvaluationId,
        auth,
        'json'
      );
      const data = JSON.parse(buffer.toString());

      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);

      const item = data[0];
      expect(item.itemId).toBeDefined();
      expect(item.question).toBeDefined();
      expect(item.expectedResponse).toBeDefined();
    });

    test('应该成功导出 CSV 格式', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for exportEvaluationResults CSV',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些测试数据
      await MongoEvalItem.create({
        evalId: testEvaluationId,
        dataItem: { question: 'JavaScript question', expectedResponse: 'JS answer' },
        targetId,
        metricIds: [metricId],
        status: EvaluationStatusEnum.completed,
        score: 85,
        response: 'JavaScript response'
      });

      const buffer = await EvaluationTaskService.exportEvaluationResults(
        testEvaluationId,
        auth,
        'csv'
      );
      const csvContent = buffer.toString();

      expect(csvContent.includes('ItemId,Question,ExpectedResponse')).toBe(true);
      expect(csvContent.includes('JavaScript question')).toBe(true);
    });

    test('空数据时应该返回空内容', async () => {
      // 创建新的空评估任务
      const emptyEvaluation = await MongoEvaluation.create({
        teamId,
        tmbId,
        name: 'Empty Evaluation',
        datasetId,
        targetId,
        metricIds: [metricId],
        usageId: new Types.ObjectId(),
        status: EvaluationStatusEnum.queuing
      });

      const buffer = await EvaluationTaskService.exportEvaluationResults(
        emptyEvaluation._id.toString(),
        auth,
        'csv'
      );

      expect(buffer.toString()).toBe('');
    });
  });

  describe('retryFailedItems', () => {
    test('应该批量重试失败的评估项', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for retryFailedItems',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建失败的评估项和成功的评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Failed 1', expectedResponse: 'Answer 1' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Error 1'
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Failed 2', expectedResponse: 'Answer 2' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          errorMessage: 'Error 2'
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Success', expectedResponse: 'Answer' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 90 // 成功的项目，不应该被重试
        }
      ]);

      const retryCount = await EvaluationTaskService.retryFailedItems(testEvaluationId, auth);

      expect(retryCount).toBe(2);

      // 验证失败的项目被重试
      const failedItems = await MongoEvalItem.find({
        evalId: testEvaluationId,
        'dataItem.question': { $in: ['Failed 1', 'Failed 2'] }
      });

      failedItems.forEach((item) => {
        expect(item.status).toBe(EvaluationStatusEnum.queuing);
        expect(item.errorMessage).toBeNull();
      });

      // 验证成功的项目未受影响
      const successItem = await MongoEvalItem.findOne({
        evalId: testEvaluationId,
        'dataItem.question': 'Success'
      });
      expect(successItem?.status).toBe(EvaluationStatusEnum.completed);
      expect(successItem?.score).toBe(90);

      expect(addLog.info).toHaveBeenCalledWith(
        expect.stringContaining(`批量重试失败项: ${testEvaluationId}, 影响数量: 2`)
      );
    });
  });

  describe('deleteEvaluation', () => {
    test('应该成功删除评估任务及其评估项', async () => {
      // 创建一个新的evaluation用于此测试
      const params: CreateEvaluationParams = {
        name: 'Test Evaluation for delete',
        description: 'A test evaluation',
        datasetId,
        targetId,
        metricIds: [metricId]
      };
      const evaluation = await EvaluationTaskService.createEvaluation(params, auth);
      const testEvaluationId = evaluation._id;

      // 创建一些评估项
      await MongoEvalItem.create([
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test question 1', expectedResponse: 'Test answer 1' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.queuing
        },
        {
          evalId: testEvaluationId,
          dataItem: { question: 'Test question 2', expectedResponse: 'Test answer 2' },
          targetId,
          metricIds: [metricId],
          status: EvaluationStatusEnum.completed,
          score: 85
        }
      ]);

      const itemCount = await MongoEvalItem.countDocuments({ evalId: testEvaluationId });
      expect(itemCount).toBeGreaterThan(0); // 确保有评估项存在

      await EvaluationTaskService.deleteEvaluation(testEvaluationId, auth);

      // 验证评估任务被删除
      await expect(EvaluationTaskService.getEvaluation(testEvaluationId, auth)).rejects.toThrow(
        'Evaluation not found'
      );

      // 验证所有评估项被删除
      const remainingItems = await MongoEvalItem.countDocuments({ evalId: testEvaluationId });
      expect(remainingItems).toBe(0);
    });
  });
});
