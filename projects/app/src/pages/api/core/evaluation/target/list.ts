import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTargetService } from '@fastgpt/service/core/evaluation/target';
import type { EvalTargetSchemaType } from '@fastgpt/global/core/evaluation/type';
import type { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type ListTargetsBody = PaginationProps<{
  searchKey?: string;
}>;

async function handler(
  req: ApiRequestProps<ListTargetsBody>
): Promise<PaginationResponse<EvalTargetSchemaType>> {
  try {
    const { pageNum = 1, pageSize = 20, searchKey } = req.body;

    // 验证分页参数
    const pageNumInt = Number(pageNum);
    const pageSizeInt = Number(pageSize);

    if (pageNumInt < 1) {
      return Promise.reject('Invalid page number');
    }

    if (pageSizeInt < 1 || pageSizeInt > 100) {
      return Promise.reject('Invalid page size (1-100)');
    }

    const result = await EvaluationTargetService.listTargets(
      {
        req,
        authToken: true
      },
      pageNumInt,
      pageSizeInt,
      searchKey?.trim()
    );

    addLog.info('[Evaluation Target] 目标列表查询成功', {
      pageNum: pageNumInt,
      pageSize: pageSizeInt,
      searchKey: searchKey?.trim(),
      total: result.total,
      returned: result.targets.length
    });

    return {
      list: result.targets,
      total: result.total
    };
  } catch (error) {
    addLog.error('[Evaluation Target] 查询目标列表失败', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
