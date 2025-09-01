/* Auth evaluation permission */
import { parseHeaderCert } from '../controller';
import { getResourcePermission } from '../controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import type { EvaluationDetailType } from '@fastgpt/global/core/evaluation/type';
import type { AuthModeType, AuthResponseType } from '../type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { MongoEvaluation } from '../../../core/evaluation/task';
import { EvaluationPermission } from '@fastgpt/global/support/permission/evaluation/controller';

// ================ 评估模块错误枚举 ================
export const EvaluationAuthErrors = {
  evaluationNotFound: 'Evaluation not found',
  datasetNotFound: 'Evaluation dataset not found',
  metricNotFound: 'Evaluation metric not found',
  permissionDenied: 'Permission denied',
  evaluationIdRequired: 'Evaluation ID is required',
  datasetIdRequired: 'Evaluation dataset ID is required',
  metricIdRequired: 'Evaluation metric ID is required'
} as const;

// ================ 评估任务权限验证 ================
export const authEvaluationByTmbId = async ({
  tmbId,
  evaluationId,
  per,
  isRoot
}: {
  tmbId: string;
  evaluationId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{ evaluation: EvaluationDetailType }> => {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const evaluation = await MongoEvaluation.findOne({ _id: evaluationId }).lean();
  if (!evaluation) {
    return Promise.reject(EvaluationAuthErrors.evaluationNotFound);
  }

  // Root用户权限特殊处理
  if (isRoot) {
    return {
      evaluation: {
        ...evaluation,
        permission: new EvaluationPermission({ isOwner: true })
      }
    };
  }

  // 团队权限验证
  if (String(evaluation.teamId) !== teamId) {
    return Promise.reject(EvaluationAuthErrors.evaluationNotFound);
  }

  // 所有者检查
  const isOwner = tmbPer.isOwner || String(evaluation.tmbId) === String(tmbId);

  // 权限计算
  const { Per } = await (async () => {
    if (isOwner) {
      return { Per: new EvaluationPermission({ isOwner: true }) };
    }

    // 获取评估资源的权限
    const role = await getResourcePermission({
      teamId,
      tmbId,
      resourceId: evaluationId,
      resourceType: PerResourceTypeEnum.evaluation
    });

    return { Per: new EvaluationPermission({ role, isOwner }) };
  })();

  // 权限验证
  if (!Per.checkPer(per)) {
    return Promise.reject(EvaluationAuthErrors.permissionDenied);
  }

  return {
    evaluation: {
      ...evaluation,
      permission: Per
    }
  };
};

export const authEvaluation = async ({
  evaluationId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  evaluationId: string;
  per?: PermissionValueType;
}): Promise<
  AuthResponseType & {
    evaluation: EvaluationDetailType;
  }
> => {
  const result = await parseHeaderCert({
    ...props,
    authApiKey: true // 添加API Key支持
  });
  const { tmbId } = result;

  if (!evaluationId) {
    return Promise.reject(EvaluationAuthErrors.evaluationIdRequired);
  }

  const { evaluation } = await authEvaluationByTmbId({
    tmbId,
    evaluationId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: evaluation.permission,
    evaluation
  };
};

// ================ 评估数据集权限验证 ================
export const authEvalDatasetByTmbId = async ({
  tmbId,
  datasetId,
  per,
  isRoot
}: {
  tmbId: string;
  datasetId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{ dataset: any }> => {
  const { MongoEvalDataset } = await import('../../../core/evaluation/dataset/schema');
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const dataset = await MongoEvalDataset.findOne({ _id: datasetId }).lean();
  if (!dataset) {
    return Promise.reject(EvaluationAuthErrors.datasetNotFound);
  }

  // Root用户权限特殊处理
  if (isRoot) {
    return {
      dataset: {
        ...dataset,
        permission: new EvaluationPermission({ isOwner: true })
      }
    };
  }

  // 团队权限验证
  if (String(dataset.teamId) !== teamId) {
    return Promise.reject(EvaluationAuthErrors.datasetNotFound);
  }

  // 所有者检查
  const isOwner = tmbPer.isOwner || String(dataset.tmbId) === String(tmbId);

  // 权限计算 - 使用evaluation资源类型
  const { Per } = await (async () => {
    if (isOwner) {
      return { Per: new EvaluationPermission({ isOwner: true }) };
    }

    // 获取evaluation资源的权限（evalDataset复用evaluation权限）
    const role = await getResourcePermission({
      teamId,
      tmbId,
      resourceId: datasetId,
      resourceType: PerResourceTypeEnum.evaluation
    });

    return { Per: new EvaluationPermission({ role, isOwner }) };
  })();

  // 权限验证
  if (!Per.checkPer(per)) {
    return Promise.reject(EvaluationAuthErrors.permissionDenied);
  }

  return {
    dataset: {
      ...dataset,
      permission: Per
    }
  };
};

export const authEvalDataset = async ({
  datasetId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  datasetId: string;
  per?: PermissionValueType;
}): Promise<
  AuthResponseType & {
    dataset: any;
  }
> => {
  const result = await parseHeaderCert({
    ...props,
    authApiKey: true // 添加API Key支持
  });
  const { tmbId } = result;

  if (!datasetId) {
    return Promise.reject(EvaluationAuthErrors.datasetIdRequired);
  }

  const { dataset } = await authEvalDatasetByTmbId({
    tmbId,
    datasetId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: dataset.permission,
    dataset
  };
};

// ================ 评估指标权限验证 ================
export const authEvalMetricByTmbId = async ({
  tmbId,
  metricId,
  per,
  isRoot
}: {
  tmbId: string;
  metricId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{ metric: any }> => {
  const { MongoEvalMetric } = await import('../../../core/evaluation/metric/schema');
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const metric = await MongoEvalMetric.findOne({ _id: metricId }).lean();
  if (!metric) {
    return Promise.reject(EvaluationAuthErrors.metricNotFound);
  }

  // Root用户权限特殊处理
  if (isRoot) {
    return {
      metric: {
        ...metric,
        permission: new EvaluationPermission({ isOwner: true })
      }
    };
  }

  // 团队权限验证
  if (String(metric.teamId) !== teamId) {
    return Promise.reject(EvaluationAuthErrors.metricNotFound);
  }

  // 所有者检查
  const isOwner = tmbPer.isOwner || String(metric.tmbId) === String(tmbId);

  // 权限计算 - 使用evaluation资源类型
  const { Per } = await (async () => {
    if (isOwner) {
      return { Per: new EvaluationPermission({ isOwner: true }) };
    }

    // 获取evaluation资源的权限（evalMetric复用evaluation权限）
    const role = await getResourcePermission({
      teamId,
      tmbId,
      resourceId: metricId,
      resourceType: PerResourceTypeEnum.evaluation
    });

    return { Per: new EvaluationPermission({ role, isOwner }) };
  })();

  // 权限验证
  if (!Per.checkPer(per)) {
    return Promise.reject(EvaluationAuthErrors.permissionDenied);
  }

  return {
    metric: {
      ...metric,
      permission: Per
    }
  };
};

export const authEvalMetric = async ({
  metricId,
  per = ReadPermissionVal,
  ...props
}: AuthModeType & {
  metricId: string;
  per?: PermissionValueType;
}): Promise<
  AuthResponseType & {
    metric: any;
  }
> => {
  const result = await parseHeaderCert({
    ...props,
    authApiKey: true // 添加API Key支持
  });
  const { tmbId } = result;

  if (!metricId) {
    return Promise.reject(EvaluationAuthErrors.metricIdRequired);
  }

  const { metric } = await authEvalMetricByTmbId({
    tmbId,
    metricId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: metric.permission,
    metric
  };
};
