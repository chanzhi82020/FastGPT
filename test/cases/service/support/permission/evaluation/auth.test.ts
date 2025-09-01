import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  authEvaluation,
  authEvaluationByTmbId,
  authEvalDataset,
  authEvalDatasetByTmbId,
  authEvalMetric,
  authEvalMetricByTmbId,
  EvaluationAuthErrors
} from '@fastgpt/service/support/permission/evaluation/auth';
import { MongoEvaluation } from '@fastgpt/service/core/evaluation/task';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import { getResourcePermission } from '@fastgpt/service/support/permission/controller';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import {
  ReadPermissionVal,
  WritePermissionVal,
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';

// Mock dependencies
vi.mock('@fastgpt/service/core/evaluation/task', () => ({
  MongoEvaluation: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/controller', () => ({
  getResourcePermission: vi.fn(),
  parseHeaderCert: vi.fn()
}));

vi.mock('@fastgpt/service/core/evaluation/dataset/schema', () => ({
  MongoEvalDataset: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/evaluation/metric/schema', () => ({
  MongoEvalMetric: {
    findOne: vi.fn()
  }
}));

describe('Evaluation Permission Auth', () => {
  const mockTmbId = 'tmb_123456789';
  const mockTeamId = 'team_123456789';
  const mockEvaluationId = 'eval_123456789';
  const mockDatasetId = 'dataset_123456789';
  const mockMetricId = 'metric_123456789';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authEvaluationByTmbId', () => {
    it('should reject with evaluation not found error when evaluation does not exist', async () => {
      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => null
      } as any);

      await expect(
        authEvaluationByTmbId({
          tmbId: mockTmbId,
          evaluationId: mockEvaluationId,
          per: ReadPermissionVal
        })
      ).rejects.toBe(EvaluationAuthErrors.evaluationNotFound);
    });

    it('should grant full permission for root user', async () => {
      const mockEvaluation = {
        _id: mockEvaluationId,
        teamId: mockTeamId,
        tmbId: mockTmbId,
        name: 'Test Evaluation'
      };

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => mockEvaluation
      } as any);

      const result = await authEvaluationByTmbId({
        tmbId: mockTmbId,
        evaluationId: mockEvaluationId,
        per: ManagePermissionVal,
        isRoot: true
      });

      expect(result.evaluation).toMatchObject(mockEvaluation);
      expect(result.evaluation.permission).toBeInstanceOf(EvaluationPermission);
      expect(result.evaluation.permission.checkPer(ManagePermissionVal)).toBe(true);
    });

    it('should reject with evaluation not found when user is not in the same team', async () => {
      const mockEvaluation = {
        _id: mockEvaluationId,
        teamId: 'different_team_id',
        tmbId: mockTmbId
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => mockEvaluation
      } as any);

      await expect(
        authEvaluationByTmbId({
          tmbId: mockTmbId,
          evaluationId: mockEvaluationId,
          per: ReadPermissionVal
        })
      ).rejects.toBe(EvaluationAuthErrors.evaluationNotFound);
    });

    it('should grant full permission for owner', async () => {
      const mockEvaluation = {
        _id: mockEvaluationId,
        teamId: mockTeamId,
        tmbId: mockTmbId,
        name: 'Test Evaluation'
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: true }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => mockEvaluation
      } as any);

      const result = await authEvaluationByTmbId({
        tmbId: mockTmbId,
        evaluationId: mockEvaluationId,
        per: ManagePermissionVal
      });

      expect(result.evaluation).toMatchObject(mockEvaluation);
      expect(result.evaluation.permission).toBeInstanceOf(EvaluationPermission);
      expect(result.evaluation.permission.checkPer(ManagePermissionVal)).toBe(true);
    });

    it('should grant full permission for evaluation creator', async () => {
      const mockEvaluation = {
        _id: mockEvaluationId,
        teamId: mockTeamId,
        tmbId: mockTmbId,
        name: 'Test Evaluation'
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => mockEvaluation
      } as any);

      const result = await authEvaluationByTmbId({
        tmbId: mockTmbId,
        evaluationId: mockEvaluationId,
        per: ManagePermissionVal
      });

      expect(result.evaluation).toMatchObject(mockEvaluation);
      expect(result.evaluation.permission).toBeInstanceOf(EvaluationPermission);
      expect(result.evaluation.permission.checkPer(ManagePermissionVal)).toBe(true);
    });

    it('should use resource permission for non-owner users', async () => {
      const mockEvaluation = {
        _id: mockEvaluationId,
        teamId: mockTeamId,
        tmbId: 'different_tmb_id',
        name: 'Test Evaluation'
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => mockEvaluation
      } as any);

      vi.mocked(getResourcePermission).mockResolvedValue(0b100); // Read permission

      const result = await authEvaluationByTmbId({
        tmbId: mockTmbId,
        evaluationId: mockEvaluationId,
        per: ReadPermissionVal
      });

      expect(result.evaluation).toMatchObject(mockEvaluation);
      expect(result.evaluation.permission).toBeInstanceOf(EvaluationPermission);
      expect(result.evaluation.permission.checkPer(ReadPermissionVal)).toBe(true);
      expect(getResourcePermission).toHaveBeenCalledWith({
        teamId: mockTeamId,
        tmbId: mockTmbId,
        resourceId: mockEvaluationId,
        resourceType: PerResourceTypeEnum.evaluation
      });
    });

    it('should reject with permission denied when user lacks required permission', async () => {
      const mockEvaluation = {
        _id: mockEvaluationId,
        teamId: mockTeamId,
        tmbId: 'different_tmb_id'
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => mockEvaluation
      } as any);

      vi.mocked(getResourcePermission).mockResolvedValue(0b100); // Read permission

      await expect(
        authEvaluationByTmbId({
          tmbId: mockTmbId,
          evaluationId: mockEvaluationId,
          per: ManagePermissionVal // Requesting manage permission but only has read
        })
      ).rejects.toBe(EvaluationAuthErrors.permissionDenied);
    });
  });

  describe('authEvaluation', () => {
    it('should reject with evaluation ID required error when evaluationId is empty', async () => {
      vi.mocked(parseHeaderCert).mockResolvedValue({
        tmbId: mockTmbId,
        isRoot: false
      } as any);

      await expect(
        authEvaluation({
          evaluationId: '',
          req: {} as any,
          authToken: true
        })
      ).rejects.toBe(EvaluationAuthErrors.evaluationIdRequired);
    });

    it('should successfully authenticate evaluation with valid parameters', async () => {
      vi.mocked(parseHeaderCert).mockResolvedValue({
        tmbId: mockTmbId,
        isRoot: false,
        teamId: mockTeamId
      } as any);

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: true }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => ({
          _id: mockEvaluationId,
          teamId: mockTeamId,
          tmbId: mockTmbId,
          name: 'Test Evaluation'
        })
      } as any);

      const result = await authEvaluation({
        evaluationId: mockEvaluationId,
        per: ReadPermissionVal,
        req: {} as any,
        authToken: true
      });

      expect(result.evaluation).toBeDefined();
      expect(result.permission).toBeInstanceOf(EvaluationPermission);
      expect(result.tmbId).toBe(mockTmbId);
    });
  });

  describe('authEvalDatasetByTmbId', () => {
    it('should reject with dataset not found error when dataset does not exist', async () => {
      const { MongoEvalDataset } = await import('@fastgpt/service/core/evaluation/dataset/schema');

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvalDataset.findOne).mockReturnValue({
        lean: () => null
      } as any);

      await expect(
        authEvalDatasetByTmbId({
          tmbId: mockTmbId,
          datasetId: mockDatasetId,
          per: ReadPermissionVal
        })
      ).rejects.toBe(EvaluationAuthErrors.datasetNotFound);
    });

    it('should grant full permission for root user', async () => {
      const { MongoEvalDataset } = await import('@fastgpt/service/core/evaluation/dataset/schema');
      const mockDataset = {
        _id: mockDatasetId,
        teamId: mockTeamId,
        tmbId: mockTmbId,
        name: 'Test Dataset'
      };

      vi.mocked(MongoEvalDataset.findOne).mockReturnValue({
        lean: () => mockDataset
      } as any);

      const result = await authEvalDatasetByTmbId({
        tmbId: mockTmbId,
        datasetId: mockDatasetId,
        per: ManagePermissionVal,
        isRoot: true
      });

      expect(result.dataset).toMatchObject(mockDataset);
      expect(result.dataset.permission).toBeInstanceOf(EvaluationPermission);
      expect(result.dataset.permission.checkPer(ManagePermissionVal)).toBe(true);
    });

    it('should use evaluation resource type for permission check', async () => {
      const { MongoEvalDataset } = await import('@fastgpt/service/core/evaluation/dataset/schema');
      const mockDataset = {
        _id: mockDatasetId,
        teamId: mockTeamId,
        tmbId: 'different_tmb_id',
        name: 'Test Dataset'
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvalDataset.findOne).mockReturnValue({
        lean: () => mockDataset
      } as any);

      vi.mocked(getResourcePermission).mockResolvedValue(0b100); // Read permission

      const result = await authEvalDatasetByTmbId({
        tmbId: mockTmbId,
        datasetId: mockDatasetId,
        per: ReadPermissionVal
      });

      expect(result.dataset).toMatchObject(mockDataset);
      expect(getResourcePermission).toHaveBeenCalledWith({
        teamId: mockTeamId,
        tmbId: mockTmbId,
        resourceId: mockDatasetId,
        resourceType: PerResourceTypeEnum.evaluation // Should use evaluation resource type
      });
    });
  });

  describe('authEvalDataset', () => {
    it('should reject with dataset ID required error when datasetId is empty', async () => {
      vi.mocked(parseHeaderCert).mockResolvedValue({
        tmbId: mockTmbId,
        isRoot: false
      } as any);

      await expect(
        authEvalDataset({
          datasetId: '',
          req: {} as any,
          authToken: true
        })
      ).rejects.toBe(EvaluationAuthErrors.datasetIdRequired);
    });
  });

  describe('authEvalMetricByTmbId', () => {
    it('should reject with metric not found error when metric does not exist', async () => {
      const { MongoEvalMetric } = await import('@fastgpt/service/core/evaluation/metric/schema');

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvalMetric.findOne).mockReturnValue({
        lean: () => null
      } as any);

      await expect(
        authEvalMetricByTmbId({
          tmbId: mockTmbId,
          metricId: mockMetricId,
          per: ReadPermissionVal
        })
      ).rejects.toBe(EvaluationAuthErrors.metricNotFound);
    });

    it('should grant full permission for root user', async () => {
      const { MongoEvalMetric } = await import('@fastgpt/service/core/evaluation/metric/schema');
      const mockMetric = {
        _id: mockMetricId,
        teamId: mockTeamId,
        tmbId: mockTmbId,
        name: 'Test Metric'
      };

      vi.mocked(MongoEvalMetric.findOne).mockReturnValue({
        lean: () => mockMetric
      } as any);

      const result = await authEvalMetricByTmbId({
        tmbId: mockTmbId,
        metricId: mockMetricId,
        per: ManagePermissionVal,
        isRoot: true
      });

      expect(result.metric).toMatchObject(mockMetric);
      expect(result.metric.permission).toBeInstanceOf(EvaluationPermission);
      expect(result.metric.permission.checkPer(ManagePermissionVal)).toBe(true);
    });

    it('should use evaluation resource type for permission check', async () => {
      const { MongoEvalMetric } = await import('@fastgpt/service/core/evaluation/metric/schema');
      const mockMetric = {
        _id: mockMetricId,
        teamId: mockTeamId,
        tmbId: 'different_tmb_id',
        name: 'Test Metric'
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvalMetric.findOne).mockReturnValue({
        lean: () => mockMetric
      } as any);

      vi.mocked(getResourcePermission).mockResolvedValue(0b100); // Read permission

      const result = await authEvalMetricByTmbId({
        tmbId: mockTmbId,
        metricId: mockMetricId,
        per: ReadPermissionVal
      });

      expect(result.metric).toMatchObject(mockMetric);
      expect(getResourcePermission).toHaveBeenCalledWith({
        teamId: mockTeamId,
        tmbId: mockTmbId,
        resourceId: mockMetricId,
        resourceType: PerResourceTypeEnum.evaluation // Should use evaluation resource type
      });
    });
  });

  describe('authEvalMetric', () => {
    it('should reject with metric ID required error when metricId is empty', async () => {
      vi.mocked(parseHeaderCert).mockResolvedValue({
        tmbId: mockTmbId,
        isRoot: false
      } as any);

      await expect(
        authEvalMetric({
          metricId: '',
          req: {} as any,
          authToken: true
        })
      ).rejects.toBe(EvaluationAuthErrors.metricIdRequired);
    });
  });

  describe('Permission Level Tests', () => {
    it('should handle different permission levels correctly', async () => {
      const mockEvaluation = {
        _id: mockEvaluationId,
        teamId: mockTeamId,
        tmbId: 'different_tmb_id'
      };

      vi.mocked(getTmbInfoByTmbId).mockResolvedValue({
        teamId: mockTeamId,
        permission: { isOwner: false }
      } as any);

      vi.mocked(MongoEvaluation.findOne).mockReturnValue({
        lean: () => mockEvaluation
      } as any);

      // Test read permission
      vi.mocked(getResourcePermission).mockResolvedValue(0b100); // Read only
      const readResult = await authEvaluationByTmbId({
        tmbId: mockTmbId,
        evaluationId: mockEvaluationId,
        per: ReadPermissionVal
      });
      expect(readResult.evaluation.permission.checkPer(ReadPermissionVal)).toBe(true);
      expect(readResult.evaluation.permission.checkPer(WritePermissionVal)).toBe(false);

      // Test write permission
      vi.mocked(getResourcePermission).mockResolvedValue(0b110); // Read + Write
      const writeResult = await authEvaluationByTmbId({
        tmbId: mockTmbId,
        evaluationId: mockEvaluationId,
        per: WritePermissionVal
      });
      expect(writeResult.evaluation.permission.checkPer(ReadPermissionVal)).toBe(true);
      expect(writeResult.evaluation.permission.checkPer(WritePermissionVal)).toBe(true);

      // Test manage permission
      vi.mocked(getResourcePermission).mockResolvedValue(0b111); // Read + Write + Manage
      const manageResult = await authEvaluationByTmbId({
        tmbId: mockTmbId,
        evaluationId: mockEvaluationId,
        per: ManagePermissionVal
      });
      expect(manageResult.evaluation.permission.checkPer(ReadPermissionVal)).toBe(true);
      expect(manageResult.evaluation.permission.checkPer(WritePermissionVal)).toBe(true);
      expect(manageResult.evaluation.permission.checkPer(ManagePermissionVal)).toBe(true);
    });
  });
});
