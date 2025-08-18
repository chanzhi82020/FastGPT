import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationTaskService } from '@fastgpt/service/core/evaluation/task';
import type { EvalItemSchemaType } from '@fastgpt/global/core/evaluation/type';
import { addLog } from '@fastgpt/service/common/system/log';

export type UpdateEvaluationItemBody = {
  evalItemId: string;
  question?: string;
  expectedResponse?: string;
  variables?: Record<string, any>;
};

export type UpdateEvaluationItemResponse = {
  message: string;
};

async function handler(
  req: ApiRequestProps<UpdateEvaluationItemBody>
): Promise<UpdateEvaluationItemResponse> {
  try {
    if (req.method !== 'PUT') {
      return Promise.reject('Method not allowed');
    }

    const { evalItemId, question, expectedResponse, variables } = req.body;

    if (!evalItemId) {
      return Promise.reject('Evaluation item ID is required');
    }

    // 构建更新对象
    const updates: Partial<EvalItemSchemaType> = {};

    if (question !== undefined || expectedResponse !== undefined || variables !== undefined) {
      updates.dataItem = {
        question: question || '',
        expectedResponse: expectedResponse || ''
      };
      if (variables !== undefined) {
        updates.dataItem.variables = variables;
      }
    }

    await EvaluationTaskService.updateEvaluationItem(evalItemId, updates, {
      req,
      authToken: true
    });

    addLog.info('[Evaluation] 评估项更新成功', {
      evalItemId,
      updates: { question, expectedResponse, variables }
    });

    return { message: 'Evaluation item updated successfully' };
  } catch (error) {
    addLog.error('[Evaluation] 更新评估项失败', {
      evalItemId: req.body?.evalItemId,
      error
    });
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
