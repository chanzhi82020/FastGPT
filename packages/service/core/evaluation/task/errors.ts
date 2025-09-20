import { UnrecoverableError } from 'bullmq';
import { addLog } from '../../../common/system/log';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { EvaluationErrEnum } from '@fastgpt/global/common/error/code/evaluation';
import { getErrText } from '@fastgpt/global/common/error/utils';

/**
 * 不可重试的评估错误类
 * 继承自 BullMQ 的 UnrecoverableError，抛出此错误会阻止 BullMQ 自动重试
 */
export class EvaluationUnrecoverableError extends UnrecoverableError {
  constructor(
    message: string,
    public readonly stage: string
  ) {
    super(message);
    this.name = 'EvaluationUnrecoverableError';
  }
}

/**
 * 可重试的评估错误类
 * 普通 Error 类，允许 BullMQ 根据队列配置进行自动重试
 */
export class EvaluationRetryableError extends Error {
  constructor(
    message: string,
    public readonly stage: string
  ) {
    super(message);
    this.name = 'EvaluationRetryableError';
  }
}

/**
 * 错误分析接口
 */
export interface ErrorAnalysisResult {
  isRetriable: boolean;
  category?: string;
  pattern?: string;
}

/**
 * 简化的错误分析函数 - 仅保留核心重试逻辑
 */
export const analyzeError = (error: any): ErrorAnalysisResult => {
  const errorStr = error?.message || error?.code || String(error);
  const lowerErrorStr = errorStr.toLowerCase();

  // 检查网络相关错误
  const networkErrors = [
    'NETWORK_ERROR',
    'ECONNRESET',
    'ENOTFOUND',
    'ECONNREFUSED',
    'socket hang up',
    'timeout'
  ];
  if (networkErrors.some((pattern) => lowerErrorStr.includes(pattern.toLowerCase()))) {
    return { isRetriable: true, category: 'network' };
  }

  // 检查 HTTP 状态码
  const httpStatusMatch = errorStr.match(/\b(4\d{2}|5\d{2})\b/);
  if (httpStatusMatch) {
    const statusCode = httpStatusMatch[1];
    // 429 (Too Many Requests) 和 5xx 错误可重试
    if (statusCode === '429' || statusCode.startsWith('5')) {
      return {
        isRetriable: true,
        category: statusCode.startsWith('5') ? 'serverError' : 'rateLimit'
      };
    }
  }

  return { isRetriable: false };
};

/**
 * 错误上下文接口
 */
export interface EvaluationErrorContext {
  evalId?: string;
  evalItemId?: string;
  resourceName?: string;
}

/**
 * 创建合适的 BullMQ 错误类型用于自动重试
 * 这个函数将替代所有现有的错误分析和手动重试逻辑
 */
export const createEvaluationError = (
  error: any,
  stage: string,
  context?: EvaluationErrorContext
): Error => {
  const errorStr = error?.message || error?.code || String(error);
  const errorMessage = getErrText(error);

  // 构建详细的错误上下文
  const logContext = {
    stage,
    error: errorStr,
    originalError: error,
    ...context
  };

  // 不可重试的错误类型
  if (
    error === TeamErrEnum.aiPointsNotEnough ||
    error === EvaluationErrEnum.evalItemNotFound ||
    error === EvaluationErrEnum.evalTaskNotFound
  ) {
    addLog.error(`[Evaluation] Unrecoverable error in stage ${stage}`, logContext);
    return new EvaluationUnrecoverableError(errorMessage, stage);
  }

  // 使用现有的错误分析逻辑来判断是否可重试
  const { isRetriable, category } = analyzeError(error);

  if (isRetriable) {
    addLog.warn(
      `[Evaluation] Retryable error in stage ${stage} (category: ${category})`,
      logContext
    );
    return new EvaluationRetryableError(errorMessage, stage);
  } else {
    addLog.error(`[Evaluation] Non-retryable error in stage ${stage}`, logContext);
    return new EvaluationUnrecoverableError(errorMessage, stage);
  }
};
