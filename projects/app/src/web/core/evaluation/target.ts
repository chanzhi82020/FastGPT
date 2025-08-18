import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  CreateTargetParams,
  EvalTargetSchemaType
} from '@fastgpt/global/core/evaluation/type';
import type { PaginationResponse, PaginationProps } from '@fastgpt/web/common/fetch/type';

// ==================== 评估目标管理 API ====================

export const createTarget = (data: CreateTargetParams) =>
  POST<EvalTargetSchemaType>('/core/evaluation/target/create', data);

export const getTargetList = (
  data: PaginationProps<{
    searchKey?: string;
  }>
) => POST<PaginationResponse<EvalTargetSchemaType>>('/core/evaluation/target/list', data);

export const getTargetDetail = (targetId: string) =>
  GET<EvalTargetSchemaType>(`/core/evaluation/target/detail?id=${targetId}`);

export const updateTarget = (targetId: string, data: CreateTargetParams) =>
  PUT<EvalTargetSchemaType>(`/core/evaluation/target/update?id=${targetId}`, data);

export const deleteTarget = (targetId: string) =>
  DELETE(`/core/evaluation/target/delete?id=${targetId}`);

export const testTarget = (data: { targetId: string; testInput: any }) =>
  POST<{
    success: boolean;
    result?: any;
    error?: string;
  }>('/core/evaluation/target/test', data);
