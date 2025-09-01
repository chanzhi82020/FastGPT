import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  DatasetDetailRequest,
  DatasetDetailResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationDatasetRead } from '@fastgpt/service/core/evaluation/common';

async function handler(
  req: ApiRequestProps<{}, DatasetDetailRequest>
): Promise<DatasetDetailResponse> {
  try {
    const { datasetId } = req.query;

    if (!datasetId) {
      return Promise.reject('Dataset ID is required');
    }

    // API层权限验证: 评估数据集读权限
    const { teamId } = await validateEvaluationDatasetRead(datasetId, {
      req,
      authToken: true
    });

    // Service层业务逻辑
    const dataset = await EvaluationDatasetService.getDataset(datasetId, teamId);

    addLog.info('[Evaluation Dataset] Dataset details retrieved successfully', {
      datasetId: datasetId,
      name: dataset.name,
      itemCount: dataset.dataItems?.length || 0
    });

    return dataset;
  } catch (error) {
    addLog.error('[Evaluation Dataset] Failed to get dataset details', {
      datasetId: req.query.datasetId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
