import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateKnowledgeBaseForEvalDataset } from '@fastgpt/service/core/evaluation/common';

// 请求类型定义
interface GenerateEvalDatasetFromKBRequest {
  datasetId: string; // 知识库ID
  sampleCount?: number; // 样本数量
  questionTypes?: string[]; // 问题类型
}

// 响应类型定义
interface GenerateEvalDatasetFromKBResponse {
  evalDatasetId: string;
  message: string;
}

/**
 * 从知识库生成评估数据集的API
 *
 * 权限要求:
 * 1. 需要知识库的读权限
 * 2. 需要团队的评估创建权限（通过团队权限验证）
 */
async function handler(
  req: ApiRequestProps<GenerateEvalDatasetFromKBRequest>
): Promise<GenerateEvalDatasetFromKBResponse> {
  try {
    const { datasetId, sampleCount = 50, questionTypes = [] } = req.body;

    if (!datasetId) {
      return Promise.reject('Dataset ID is required');
    }

    // 权限验证: 验证知识库的读权限
    const { teamId, tmbId } = await validateKnowledgeBaseForEvalDataset(datasetId, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation Dataset] Starting generation from knowledge base', {
      datasetId,
      teamId,
      tmbId,
      sampleCount,
      questionTypes
    });

    // TODO: 实现从知识库生成评估数据集的核心逻辑
    // const evalDataset = await EvaluationDatasetService.generateFromKnowledgeBase({
    //   datasetId,
    //   teamId,
    //   tmbId,
    //   sampleCount,
    //   questionTypes
    // });

    // 临时返回，等待实际功能实现
    return Promise.reject('Feature not implemented yet. Permission validation is ready.');

    // return {
    //   evalDatasetId: evalDataset._id,
    //   message: 'Evaluation dataset generated successfully'
    // };
  } catch (error) {
    addLog.error('[Evaluation Dataset] Failed to generate from knowledge base', {
      datasetId: req.body?.datasetId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
