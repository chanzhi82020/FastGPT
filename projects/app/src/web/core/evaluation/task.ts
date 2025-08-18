import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  listEvalItemsBody,
  listEvaluationsBody,
  retryEvalItemBody,
  updateEvalItemBody
} from '@fastgpt/global/core/evaluation/api';
import type {
  evaluationType,
  listEvalItemsItem,
  CreateEvaluationParams,
  EvaluationSchemaType,
  EvalItemSchemaType
} from '@fastgpt/global/core/evaluation/type';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';

// ==================== 评估任务管理 API ====================

export const createEvaluation = (data: CreateEvaluationParams) =>
  POST<EvaluationSchemaType>('/core/evaluation/task/create', data);

export const getEvaluationList = (data: listEvaluationsBody) =>
  POST<PaginationResponse<evaluationType>>('/core/evaluation/task/list', data);

export const getEvaluationDetail = (evaluationId: string) =>
  GET<EvaluationSchemaType>(`/core/evaluation/task/detail?id=${evaluationId}`);

export const updateEvaluation = (evaluationId: string, data: Partial<CreateEvaluationParams>) =>
  PUT<EvaluationSchemaType>(`/core/evaluation/task/update?id=${evaluationId}`, data);

export const deleteEvaluation = (data: { evalId: string }) =>
  DELETE(`/core/evaluation/task/delete?id=${data.evalId}`);

export const startEvaluation = (evaluationId: string) =>
  POST<{ message: string }>('/core/evaluation/task/start', { evaluationId });

export const stopEvaluation = (evaluationId: string) =>
  POST<{ message: string }>('/core/evaluation/task/stop', { evaluationId });

export const restartEvaluation = (evaluationId: string) =>
  POST<{ message: string }>('/core/evaluation/task/restart', { evaluationId });

export const getEvaluationStats = (evaluationId: string) =>
  GET<{
    totalCount: number;
    completedCount: number;
    errorCount: number;
    avgScore?: number;
    progress: number;
  }>(`/core/evaluation/task/stats?id=${evaluationId}`);

// ==================== 评估项目管理 API ====================

export const getEvalItemsList = (data: listEvalItemsBody) =>
  POST<PaginationResponse<listEvalItemsItem>>('/core/evaluation/task/item/list', data);

export const getEvalItemDetail = (evalItemId: string) =>
  GET<EvalItemSchemaType>(`/core/evaluation/task/item/detail?id=${evalItemId}`);

export const updateEvalItem = (data: updateEvalItemBody) =>
  POST('/core/evaluation/task/item/update', data);

export const deleteEvalItem = (data: { evalItemId: string }) =>
  DELETE(`/core/evaluation/task/item/delete?evalItemId=${data.evalItemId}`);

export const retryEvalItem = (data: retryEvalItemBody) =>
  POST('/core/evaluation/task/item/retry', data);

export const exportEvalItems = (evaluationId: string, format: 'csv' | 'json' = 'csv') =>
  GET(`/core/evaluation/task/item/export?evalId=${evaluationId}&format=${format}`, {
    responseType: 'blob'
  });
