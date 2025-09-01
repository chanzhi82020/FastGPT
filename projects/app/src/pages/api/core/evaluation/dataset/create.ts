import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { EvaluationDatasetService } from '@fastgpt/service/core/evaluation/dataset';
import type {
  CreateDatasetRequest,
  CreateDatasetResponse
} from '@fastgpt/global/core/evaluation/api';
import { addLog } from '@fastgpt/service/common/system/log';
import { validateEvaluationParams } from '@fastgpt/global/core/evaluation/utils';
import { validateEvaluationDatasetCreate } from '@fastgpt/service/core/evaluation/common';

async function handler(req: ApiRequestProps<CreateDatasetRequest>): Promise<CreateDatasetResponse> {
  try {
    const { name, description, dataFormat, columns } = req.body;

    // Validate name and description
    const paramValidation = validateEvaluationParams(
      { name, description },
      { namePrefix: 'Dataset' }
    );
    if (!paramValidation.success) {
      return Promise.reject(paramValidation.message);
    }

    if (!columns || !Array.isArray(columns) || columns.length === 0) {
      return Promise.reject('Dataset columns are required');
    }

    // Validate column definitions
    for (const column of columns) {
      if (!column.name?.trim()) {
        return Promise.reject('Column name is required');
      }
      if (!['string', 'number', 'boolean'].includes(column.type)) {
        return Promise.reject(`Invalid column type: ${column.type}`);
      }
    }

    // Check for duplicate column names
    const columnNames = columns.map((col) => col.name.trim());
    const uniqueNames = new Set(columnNames);
    if (columnNames.length !== uniqueNames.size) {
      return Promise.reject('Duplicate column names are not allowed');
    }

    // API层权限验证: 团队评估创建权限
    const { teamId, tmbId } = await validateEvaluationDatasetCreate({
      req,
      authToken: true
    });

    // Service层业务逻辑
    const dataset = await EvaluationDatasetService.createDataset({
      name: name.trim(),
      description: description?.trim(),
      dataFormat: dataFormat || 'csv',
      columns,
      teamId,
      tmbId
    });

    addLog.info('[Evaluation Dataset] Dataset created successfully', {
      datasetId: dataset._id,
      name: dataset.name,
      columnCount: dataset.columns.length
    });

    return dataset;
  } catch (error) {
    addLog.error('[Evaluation Dataset] Failed to create dataset', error);
    return Promise.reject(error);
  }
}

export default NextAPI(handler);
export { handler };
