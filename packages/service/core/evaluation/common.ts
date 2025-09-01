import { Types } from 'mongoose';
import type { AuthModeType } from '../../support/permission/type';
import { authEvaluation } from '../../support/permission/evaluation/auth';
import { authEvalDataset, authEvalMetric } from '../../support/permission/evaluation/auth';
import { authUserPer } from '../../support/permission/user/auth';
import { TeamEvaluationCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { EvalTarget, EvaluationDetailType } from '@fastgpt/global/core/evaluation/type';
import { authApp } from '../../support/permission/app/auth';
import { authDataset } from '../../support/permission/dataset/auth';

// Generic validation functions removed - replaced with resource-specific functions below
export const buildListQuery = (
  teamId: string,
  searchKey?: string,
  searchFields: string[] = ['name', 'description']
): any => {
  const filter: any = { teamId: new Types.ObjectId(teamId) };

  if (searchKey) {
    filter.$or = searchFields.map((field) => ({
      [field]: { $regex: searchKey, $options: 'i' }
    }));
  }

  return filter;
};
// Generic list validation removed - replaced with resource-specific functions below
export const buildPaginationOptions = (page: number = 1, pageSize: number = 20) => ({
  skip: (page - 1) * pageSize,
  limit: pageSize,
  sort: { createTime: -1 as const }
});
export const checkUpdateResult = (result: any, resourceName: string = 'Resource') => {
  if (result.matchedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};

export const checkDeleteResult = (result: any, resourceName: string = 'Resource') => {
  if (result.deletedCount === 0) {
    throw new Error(`${resourceName} not found`);
  }
};

// ================ 评估模块专用权限验证函数 ================

/**
 * 验证评估任务创建权限
 * 包含: 团队创建权限 + target关联APP读权限
 */
export const validateEvaluationTaskCreate = async (
  target: EvalTarget,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    authApiKey: true, // 添加API Key支持
    per: TeamEvaluationCreatePermissionVal
  });

  if (target.type == 'workflow') {
    if (!target.config?.appId) {
      return Promise.reject('Invalid target configuration: missing appId');
    }
    await authApp({
      ...auth,
      appId: target.config.appId,
      per: ReadPermissionVal // APP需要读权限才能被评估调用
    });
  }

  return {
    teamId,
    tmbId
  };
};

/**
 * 验证评估任务读取权限
 */
export const validateEvaluationTaskRead = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
  teamId: string;
  tmbId: string;
}> => {
  const { evaluation, teamId, tmbId } = await authEvaluation({
    ...auth,
    evaluationId,
    per: ReadPermissionVal
  });

  return { evaluation, teamId, tmbId };
};

/**
 * 验证评估任务写入权限
 */
export const validateEvaluationTaskWrite = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  evaluation: EvaluationDetailType;
  teamId: string;
  tmbId: string;
}> => {
  const { evaluation, teamId, tmbId } = await authEvaluation({
    ...auth,
    evaluationId,
    per: WritePermissionVal
  });

  return { evaluation, teamId, tmbId };
};

/**
 * 验证评估任务执行权限
 * 包含: 评估写权限 + target关联APP读权限
 */
export const validateEvaluationTaskExecution = async (
  evaluationId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  // 验证评估任务的写权限并获取详情
  const { evaluation, teamId, tmbId } = await authEvaluation({
    ...auth,
    evaluationId,
    per: WritePermissionVal
  });

  // 验证target关联APP的读权限
  if (evaluation.target.type == 'workflow') {
    if (!evaluation.target.config?.appId) {
      return Promise.reject('Invalid target configuration: missing appId');
    }
    await authApp({
      ...auth,
      appId: evaluation.target.config.appId,
      per: ReadPermissionVal // APP需要读权限才能被评估调用
    });
  }

  return {
    teamId,
    tmbId
  };
};

/**
 * 验证从知识库生成评估数据集的权限
 */
export const validateKnowledgeBaseForEvalDataset = async (
  datasetId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    authApiKey: true, // 添加API Key支持
    per: TeamEvaluationCreatePermissionVal
  });

  // 验证知识库的读权限
  await authDataset({
    ...auth,
    datasetId,
    per: ReadPermissionVal
  });

  return {
    teamId,
    tmbId
  };
};

// ================ 评估项目(EvaluationItem)专用权限验证函数 ================

/**
 * 验证评估项目读取权限
 */
export const validateEvaluationItemRead = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  evalItemId: string;
  evalId: string;
}> => {
  const { MongoEvalItem } = await import('./task/schema');

  // 根据evalItemId获取evalId
  const evalItem = await MongoEvalItem.findById(evalItemId).select('evalId').lean();
  if (!evalItem) {
    throw new Error('Evaluation item not found');
  }

  // 验证评估任务的读权限
  const { teamId, tmbId } = await validateEvaluationTaskRead(evalItem.evalId, auth);

  return { teamId, tmbId, evalItemId, evalId: evalItem.evalId };
};

/**
 * 验证评估项目写入权限
 */
export const validateEvaluationItemWrite = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  evalItemId: string;
  evalId: string;
}> => {
  const { MongoEvalItem } = await import('./task/schema');

  // 根据evalItemId获取evalId
  const evalItem = await MongoEvalItem.findById(evalItemId).select('evalId').lean();
  if (!evalItem) {
    throw new Error('Evaluation item not found');
  }

  // 验证评估任务的写权限
  const { teamId, tmbId } = await validateEvaluationTaskWrite(evalItem.evalId, auth);

  return { teamId, tmbId, evalItemId, evalId: evalItem.evalId };
};

/**
 * 验证评估项目重试权限
 */
export const validateEvaluationItemRetry = async (
  evalItemId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  evalItemId: string;
  evalId: string;
}> => {
  // 重试权限等同于写入权限
  return await validateEvaluationItemWrite(evalItemId, auth);
};

// ================ 评估数据集(EvaluationDataset)专用权限验证函数 ================

/**
 * 验证评估数据集创建权限
 */
export const validateEvaluationDatasetCreate = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  // 评估数据集创建需要团队评估创建权限
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    authApiKey: true, // 添加API Key支持
    per: TeamEvaluationCreatePermissionVal
  });

  return { teamId, tmbId };
};

/**
 * 验证评估数据集读取权限
 */
export const validateEvaluationDatasetRead = async (
  datasetId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  datasetId: string;
}> => {
  const { teamId, tmbId } = await authEvalDataset({
    ...auth,
    datasetId,
    per: ReadPermissionVal
  });

  return { teamId, tmbId, datasetId };
};

/**
 * 验证评估数据集写入权限
 */
export const validateEvaluationDatasetWrite = async (
  datasetId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  datasetId: string;
}> => {
  const { teamId, tmbId } = await authEvalDataset({
    ...auth,
    datasetId,
    per: WritePermissionVal
  });

  return { teamId, tmbId, datasetId };
};

// ================ 评估指标(EvaluationMetric)专用权限验证函数 ================

/**
 * 验证评估指标创建权限
 */
export const validateEvaluationMetricCreate = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
}> => {
  // 评估指标创建需要团队评估创建权限
  const { teamId, tmbId } = await authUserPer({
    ...auth,
    authApiKey: true, // 添加API Key支持
    per: TeamEvaluationCreatePermissionVal
  });

  return { teamId, tmbId };
};

/**
 * 验证评估指标读取权限
 */
export const validateEvaluationMetricRead = async (
  metricId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  metricId: string;
}> => {
  const { teamId, tmbId } = await authEvalMetric({
    ...auth,
    metricId,
    per: ReadPermissionVal
  });

  return { teamId, tmbId, metricId };
};

/**
 * 获取用户的评估权限聚合信息（用于列表查询）
 */
export const getEvaluationPermissionAggregation = async (
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  isOwner: boolean;
  roleList: any[];
  myGroupMap: Map<string, 1>;
  myOrgSet: Set<string>;
}> => {
  const { authUserPer } = await import('../../support/permission/user/auth');
  const { PerResourceTypeEnum, ReadPermissionVal } = await import(
    '@fastgpt/global/support/permission/constant'
  );
  const { MongoResourcePermission } = await import('../../support/permission/schema');
  const { getGroupsByTmbId } = await import('../../support/permission/memberGroup/controllers');
  const { getOrgIdSetWithParentByTmbId } = await import('../../support/permission/org/controllers');

  // Auth user permission - 支持API Key和Token认证
  const {
    tmbId,
    teamId,
    permission: teamPer
  } = await authUserPer({
    ...auth,
    authApiKey: true, // 添加API Key支持
    per: ReadPermissionVal
  });

  // Get team all evaluation permissions
  const [roleList, myGroupMap, myOrgSet] = await Promise.all([
    MongoResourcePermission.find({
      resourceType: PerResourceTypeEnum.evaluation,
      teamId,
      resourceId: {
        $exists: true
      }
    }).lean(),
    getGroupsByTmbId({
      tmbId,
      teamId
    }).then((item) => {
      const map = new Map<string, 1>();
      item.forEach((item) => {
        map.set(String(item._id), 1);
      });
      return map;
    }),
    getOrgIdSetWithParentByTmbId({
      teamId,
      tmbId
    })
  ]);

  return {
    teamId,
    tmbId,
    isOwner: teamPer.isOwner,
    roleList,
    myGroupMap,
    myOrgSet
  };
};

/**
 * 验证评估指标写入权限
 */
export const validateEvaluationMetricWrite = async (
  metricId: string,
  auth: AuthModeType
): Promise<{
  teamId: string;
  tmbId: string;
  metricId: string;
}> => {
  const { teamId, tmbId } = await authEvalMetric({
    ...auth,
    metricId,
    per: WritePermissionVal
  });

  return { teamId, tmbId, metricId };
};
