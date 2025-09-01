import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationMetricService } from '@fastgpt/service/core/evaluation/metric';
import type { ListMetricsRequest, ListMetricsResponse } from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { getEvaluationPermissionAggregation } from '@fastgpt/service/core/evaluation/common';

async function handler(req: ApiRequestProps<ListMetricsRequest>): Promise<ListMetricsResponse> {
  try {
    const { pageNum = 1, pageSize = 20, searchKey } = req.body;

    // Validate pagination parameters
    const pageNumInt = Number(pageNum);
    const pageSizeInt = Number(pageSize);

    if (pageNumInt < 1) {
      return Promise.reject('Invalid page number');
    }

    if (pageSizeInt < 1 || pageSizeInt > 100) {
      return Promise.reject('Invalid page size (1-100)');
    }

    // API层权限验证: 获取权限聚合信息
    const { teamId, tmbId, isOwner, roleList, myGroupMap, myOrgSet } =
      await getEvaluationPermissionAggregation({
        req,
        authToken: true
      });

    // 计算用户可访问的资源ID
    const myRoles = roleList.filter(
      (item) =>
        String(item.tmbId) === String(tmbId) ||
        myGroupMap.has(String(item.groupId)) ||
        myOrgSet.has(String(item.orgId))
    );
    const accessibleIds = myRoles.map((item) => item.resourceId);

    // Service层业务逻辑
    const result = await EvaluationMetricService.listMetrics(
      teamId,
      pageNumInt,
      pageSizeInt,
      searchKey?.trim(),
      accessibleIds,
      tmbId,
      isOwner
    );

    // API层权限处理：添加权限信息和过滤
    const { EvaluationPermission } = await import(
      '@fastgpt/global/support/permission/evaluation/controller'
    );
    const { sumPer } = await import('@fastgpt/global/support/permission/utils');
    const { addSourceMember } = await import('@fastgpt/service/support/user/utils');

    const formatMetrics = result.list
      .map((metric: any) => {
        const getPer = (metricId: string) => {
          const tmbRole = myRoles.find(
            (item) => String(item.resourceId) === metricId && !!item.tmbId
          )?.permission;
          const groupRole = sumPer(
            ...myRoles
              .filter(
                (item) => String(item.resourceId) === metricId && (!!item.groupId || !!item.orgId)
              )
              .map((item) => item.permission)
          );
          return new EvaluationPermission({
            role: tmbRole ?? groupRole,
            isOwner: String(metric.tmbId) === String(tmbId) || isOwner
          });
        };

        const getClbCount = (metricId: string) => {
          return roleList.filter((item) => String(item.resourceId) === String(metricId)).length;
        };

        const getPrivateStatus = (metricId: string) => {
          const collaboratorCount = getClbCount(metricId);
          if (isOwner) {
            return collaboratorCount <= 1;
          }
          return (
            collaboratorCount === 0 ||
            (collaboratorCount === 1 && String(metric.tmbId) === String(tmbId))
          );
        };

        return {
          ...metric,
          permission: getPer(String(metric._id)),
          private: getPrivateStatus(String(metric._id))
        };
      })
      .filter((metric: any) => metric.permission.hasReadPer);

    const formattedResult = await addSourceMember({
      list: formatMetrics
    });

    const finalResult = {
      list: formattedResult,
      total: result.total
    };

    addLog.info('[Evaluation Metric] Metric list query successful', {
      pageNum: pageNumInt,
      pageSize: pageSizeInt,
      searchKey: searchKey?.trim(),
      total: finalResult.total,
      returned: finalResult.list.length
    });

    return finalResult;
  } catch (error) {
    addLog.error('[Evaluation Metric] Failed to query metric list', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
