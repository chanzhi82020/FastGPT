import { describe, expect, it } from 'vitest';

describe('Evaluation Permission Module', () => {
  describe('Module Exports', () => {
    it('should export evaluation permission constants', async () => {
      const constants = await import('@fastgpt/global/support/permission/evaluation/constant');

      expect(constants.EvaluationPerList).toBeDefined();
      expect(constants.EvaluationRoleList).toBeDefined();
      expect(constants.EvaluationRolePerMap).toBeDefined();
      expect(constants.EvaluationDefaultRoleVal).toBeDefined();
      expect(constants.EvaluationReadPermissionVal).toBeDefined();
      expect(constants.EvaluationWritePermissionVal).toBeDefined();
      expect(constants.EvaluationManagePermissionVal).toBeDefined();
    });

    it('should export evaluation permission controller', async () => {
      const controller = await import('@fastgpt/global/support/permission/evaluation/controller');

      expect(controller.EvaluationPermission).toBeDefined();
      expect(typeof controller.EvaluationPermission).toBe('function');
    });

    it('should export evaluation auth functions', async () => {
      const auth = await import('@fastgpt/service/support/permission/evaluation/auth');

      expect(auth.authEvaluation).toBeDefined();
      expect(auth.authEvaluationByTmbId).toBeDefined();
      expect(auth.authEvalDataset).toBeDefined();
      expect(auth.authEvalDatasetByTmbId).toBeDefined();
      expect(auth.authEvalMetric).toBeDefined();
      expect(auth.authEvalMetricByTmbId).toBeDefined();
      expect(auth.EvaluationAuthErrors).toBeDefined();
    });
  });

  describe('Integration', () => {
    it('should have consistent permission values across modules', async () => {
      const constants = await import('@fastgpt/global/support/permission/evaluation/constant');
      const globalConstants = await import('@fastgpt/global/support/permission/constant');

      // Evaluation permissions should match common permissions
      expect(constants.EvaluationReadPermissionVal).toBe(globalConstants.ReadPermissionVal);
      expect(constants.EvaluationWritePermissionVal).toBe(globalConstants.WritePermissionVal);
      expect(constants.EvaluationManagePermissionVal).toBe(globalConstants.ManagePermissionVal);
    });

    it('should have resource type enum for evaluation', async () => {
      const globalConstants = await import('@fastgpt/global/support/permission/constant');

      expect(globalConstants.PerResourceTypeEnum.evaluation).toBe('evaluation');
    });
  });

  describe('Error Messages', () => {
    it('should define appropriate error messages', async () => {
      const auth = await import('@fastgpt/service/support/permission/evaluation/auth');

      expect(auth.EvaluationAuthErrors.evaluationNotFound).toBe('Evaluation not found');
      expect(auth.EvaluationAuthErrors.datasetNotFound).toBe('Evaluation dataset not found');
      expect(auth.EvaluationAuthErrors.metricNotFound).toBe('Evaluation metric not found');
      expect(auth.EvaluationAuthErrors.permissionDenied).toBe('Permission denied');
      expect(auth.EvaluationAuthErrors.evaluationIdRequired).toBe('Evaluation ID is required');
      expect(auth.EvaluationAuthErrors.datasetIdRequired).toBe('Evaluation dataset ID is required');
      expect(auth.EvaluationAuthErrors.metricIdRequired).toBe('Evaluation metric ID is required');
    });
  });
});
