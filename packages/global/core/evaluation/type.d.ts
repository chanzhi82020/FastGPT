import type { EvaluationStatusEnum } from './constants';

// 数据集相关类型
export interface DatasetColumn {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
}

export interface DatasetItem {
  question: string;
  expectedResponse: string;
  globalVariables?: Record<string, any>;
  history?: string;
  [key: string]: any; // 支持自定义字段
}

export interface EvalDatasetSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  dataFormat: 'csv' | 'json';
  columns: DatasetColumn[];
  dataItems: DatasetItem[];
  createTime: Date;
  updateTime: Date;
}

// 评估目标相关类型
export interface WorkflowConfig {
  appId: string;
  chatConfig?: any;
}

export interface ApiConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers: Record<string, string>;
  body?: string;
  timeout: number;
}

export interface FunctionConfig {
  code: string;
  timeout: number;
}

export interface EvalTargetSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  type: 'workflow' | 'api' | 'function';
  config: WorkflowConfig | ApiConfig | FunctionConfig;
  createTime: Date;
  updateTime: Date;
}

// 评估指标相关类型
export interface HttpConfig {
  url: string;
  method: 'GET' | 'POST';
  headers: Record<string, string>;
  timeout: number;
}

export interface AiModelConfig {
  model: string;
  prompt?: string;
}

export interface EvalMetricSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  type: 'http' | 'function' | 'ai_model';
  config: HttpConfig | FunctionConfig | AiModelConfig;
  createTime: Date;
  updateTime: Date;
}

// 改进后的评估任务类型
export type EvaluationSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  description?: string;
  datasetId: string; // 关联数据集
  targetId: string; // 关联目标
  metricIds: string[]; // 关联指标数组
  usageId: string;
  status: EvaluationStatusEnum;
  createTime: Date;
  finishTime?: Date;
  avgScore?: number;
  errorMessage?: string;
};

// 评估项类型 - 增强版
export type EvalItemSchemaType = {
  _id: string;
  evalId: string;
  dataItem: DatasetItem;
  targetId: string;
  metricIds: string[];
  response?: string;
  responseTime?: Date;
  status: EvaluationStatusEnum;
  retry: number;
  finishTime?: Date;
  errorMessage?: string;
  metricResults: MetricResult[];
  score?: number;
};

// 指标结果类型
export interface MetricResult {
  metricId: string;
  metricName: string;
  score: number;
  details?: Record<string, any>;
  error?: string;
}

// 评估输入输出类型
export interface EvalInput {
  question: string;
  expectedResponse: string;
  globalVariables?: Record<string, any>;
  history?: string;
}

export interface EvalOutput {
  response: string;
  usage?: any;
  responseTime: number;
}

// 前端展示类型
export type evaluationType = Pick<
  EvaluationSchemaType,
  'name' | 'createTime' | 'finishTime' | 'status' | 'errorMessage' | 'avgScore'
> & {
  _id: string;
  executorAvatar: string;
  executorName: string;
  datasetName: string;
  targetName: string;
  metricNames: string[];
  completedCount: number;
  errorCount: number;
  totalCount: number;
};

export type listEvalItemsItem = EvalItemSchemaType & {
  evalItemId: string;
};

// 验证结果类型
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// 导入结果类型
export interface ImportResult {
  success: boolean;
  importedCount: number;
  errors: string[];
}

// API 请求参数类型
export interface CreateDatasetParams {
  name: string;
  description?: string;
  dataFormat: 'csv' | 'json';
  columns: DatasetColumn[];
}

export interface UpdateDatasetParams {
  name?: string;
  description?: string;
  columns?: DatasetColumn[];
}

export interface CreateTargetParams {
  name: string;
  description?: string;
  type: 'workflow' | 'api' | 'function';
  config: WorkflowConfig | ApiConfig | FunctionConfig;
}

export interface CreateMetricParams {
  name: string;
  description?: string;
  type: 'http' | 'function' | 'ai_model';
  config: HttpConfig | FunctionConfig | AiModelConfig;
}

export interface CreateEvaluationParams {
  name: string;
  description?: string;
  datasetId: string;
  targetId: string;
  metricIds: string[];
}
