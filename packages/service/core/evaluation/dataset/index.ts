import { MongoEvalDataset } from './schema';
import type {
  EvaluationDatasetSchemaType,
  CreateDatasetParams,
  UpdateDatasetParams,
  ValidationResult,
  ImportResult,
  DatasetColumn,
  DatasetItem
} from '@fastgpt/global/core/evaluation/type';
import { Types } from 'mongoose';
import { checkUpdateResult, checkDeleteResult } from '../common';
import Papa from 'papaparse';

export class EvaluationDatasetService {
  static async createDataset(
    params: CreateDatasetParams & {
      teamId: string;
      tmbId: string;
    }
  ): Promise<EvaluationDatasetSchemaType> {
    const { teamId, tmbId, ...datasetParams } = params;

    const dataset = await MongoEvalDataset.create({
      ...datasetParams,
      teamId,
      tmbId,
      dataItems: []
    });

    return dataset.toObject();
  }

  static async getDataset(datasetId: string, teamId: string): Promise<EvaluationDatasetSchemaType> {
    const dataset = await MongoEvalDataset.findOne({
      _id: new Types.ObjectId(datasetId),
      teamId: new Types.ObjectId(teamId)
    }).lean();

    if (!dataset) {
      throw new Error('Dataset not found');
    }

    return dataset;
  }

  static async updateDataset(
    datasetId: string,
    updates: UpdateDatasetParams,
    teamId: string
  ): Promise<void> {
    const result = await MongoEvalDataset.updateOne(
      { _id: new Types.ObjectId(datasetId), teamId: new Types.ObjectId(teamId) },
      { $set: updates }
    );

    checkUpdateResult(result, 'Dataset');
  }

  static async deleteDataset(datasetId: string, teamId: string): Promise<void> {
    const result = await MongoEvalDataset.deleteOne({
      _id: new Types.ObjectId(datasetId),
      teamId: new Types.ObjectId(teamId)
    });

    checkDeleteResult(result, 'Dataset');
  }

  static async listDatasets(
    teamId: string,
    page: number = 1,
    pageSize: number = 20,
    searchKey?: string,
    accessibleIds?: string[],
    tmbId?: string,
    isOwner: boolean = false
  ): Promise<{
    list: any[];
    total: number;
  }> {
    // Service层专注业务逻辑 - 权限聚合已在API层处理

    // Build basic filter and pagination
    const filter: any = { teamId: new Types.ObjectId(teamId) };
    if (searchKey) {
      filter.$or = [
        { name: { $regex: searchKey, $options: 'i' } },
        { description: { $regex: searchKey, $options: 'i' } }
      ];
    }
    const skip = (page - 1) * pageSize;
    const limit = pageSize;
    const sort = { createTime: -1 as const };

    // If not owner, filter by accessible resources
    let finalFilter = filter;
    if (!isOwner && accessibleIds) {
      finalFilter = {
        ...filter,
        $or: [
          { _id: { $in: accessibleIds.map((id) => new Types.ObjectId(id)) } },
          ...(tmbId ? [{ tmbId: new Types.ObjectId(tmbId) }] : []) // Own datasets
        ]
      };
    }

    const [datasets, total] = await Promise.all([
      MongoEvalDataset.find(finalFilter).sort(sort).skip(skip).limit(limit).lean(),
      MongoEvalDataset.countDocuments(finalFilter)
    ]);

    // Return raw data - permissions will be handled in API layer
    return {
      list: datasets,
      total
    };
  }

  static async validateDataFormat(
    data: any[],
    columns: DatasetColumn[]
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Array.isArray(data)) {
      errors.push('Data must be an array');
      return { isValid: false, errors, warnings };
    }

    const requiredColumns = columns.filter((col) => col.required);

    data.forEach((item, index) => {
      if (typeof item !== 'object' || item === null) {
        errors.push(`Row ${index + 1}: Item must be an object`);
        return;
      }

      requiredColumns.forEach((col) => {
        if (!(col.name in item) || item[col.name] === null || item[col.name] === undefined) {
          errors.push(`Row ${index + 1}: Missing required field '${col.name}'`);
        }
      });

      Object.keys(item).forEach((key) => {
        const column = columns.find((col) => col.name === key);
        if (!column) {
          warnings.push(`Row ${index + 1}: Unknown field '${key}'`);
          return;
        }

        const value = item[key];
        if (value === null || value === undefined) return;

        switch (column.type) {
          case 'string':
            if (typeof value !== 'string') {
              errors.push(`Row ${index + 1}: Field '${key}' must be string`);
            }
            break;
          case 'number':
            if (typeof value !== 'number') {
              errors.push(`Row ${index + 1}: Field '${key}' must be number`);
            }
            break;
          case 'boolean':
            if (typeof value !== 'boolean') {
              errors.push(`Row ${index + 1}: Field '${key}' must be boolean`);
            }
            break;
        }
      });
    });

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  static async parseFileContent(
    fileContent: Buffer,
    fileName: string,
    mimeType: string
  ): Promise<any[]> {
    let parsedData: any[];

    if (mimeType === 'application/json' || fileName?.endsWith('.json')) {
      try {
        const jsonContent = fileContent.toString('utf-8');
        parsedData = JSON.parse(jsonContent);

        if (!Array.isArray(parsedData)) {
          throw new Error('JSON file must contain an array of objects');
        }
      } catch (error) {
        throw new Error(
          `Invalid JSON format: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else if (
      mimeType === 'text/csv' ||
      mimeType === 'application/csv' ||
      fileName?.endsWith('.csv')
    ) {
      try {
        const csvContent = fileContent.toString('utf-8');

        const parseResult = Papa.parse(csvContent, {
          header: true,
          skipEmptyLines: true,
          transform: (value: string) => {
            if (value === '') return null;
            if (value === 'true') return true;
            if (value === 'false') return false;

            const num = Number(value);
            if (!isNaN(num) && value.trim() !== '') {
              return num;
            }

            return value;
          }
        });

        if (parseResult.errors.length > 0) {
          const errorMessages = parseResult.errors.map(
            (err: any) => `Row ${err.row}: ${err.message}`
          );
          throw new Error(`CSV parsing errors: ${errorMessages.join('; ')}`);
        }

        parsedData = parseResult.data;

        if (parsedData.length === 0) {
          throw new Error('CSV file contains no data rows');
        }
      } catch (error) {
        throw new Error(
          `Invalid CSV format: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      throw new Error('Unsupported file format. Only JSON and CSV files are supported.');
    }

    if (!parsedData || parsedData.length === 0) {
      throw new Error('File contains no data');
    }

    return parsedData;
  }

  static async importDataFromFile(
    datasetId: string,
    fileContent: Buffer,
    fileName: string,
    mimeType: string,
    teamId: string
  ): Promise<ImportResult> {
    try {
      const parsedData = await this.parseFileContent(fileContent, fileName, mimeType);

      return await this.importData(datasetId, parsedData, teamId);
    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  static async importData(
    datasetId: string,
    data: DatasetItem[],
    teamId: string
  ): Promise<ImportResult> {
    try {
      const dataset = await MongoEvalDataset.findOne({
        _id: new Types.ObjectId(datasetId),
        teamId: new Types.ObjectId(teamId)
      });

      if (!dataset) {
        throw new Error('Dataset not found');
      }

      const validation = await this.validateDataFormat(data, dataset.columns);
      if (!validation.isValid) {
        return {
          success: false,
          importedCount: 0,
          errors: validation.errors
        };
      }

      await MongoEvalDataset.updateOne(
        { _id: new Types.ObjectId(datasetId) },
        {
          $set: {
            dataItems: data,
            updateTime: new Date()
          }
        }
      );

      return {
        success: true,
        importedCount: data.length,
        errors: validation.warnings
      };
    } catch (error) {
      return {
        success: false,
        importedCount: 0,
        errors: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  static async exportData(
    datasetId: string,
    format: 'csv' | 'json',
    teamId: string
  ): Promise<Buffer> {
    const dataset = await this.getDataset(datasetId, teamId);

    if (format === 'json') {
      return Buffer.from(JSON.stringify(dataset.dataItems, null, 2));
    } else {
      if (dataset.dataItems.length === 0) {
        return Buffer.from('');
      }

      const headers = dataset.columns.map((col) => col.name);
      const csvRows = [headers.join(',')];

      dataset.dataItems.forEach((item) => {
        const row = headers.map((header) => {
          const value = item[header];
          if (value === null || value === undefined) {
            return '';
          }
          const stringValue = String(value);
          if (
            stringValue.includes(',') ||
            stringValue.includes('"') ||
            stringValue.includes('\n')
          ) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        });
        csvRows.push(row.join(','));
      });

      return Buffer.from(csvRows.join('\n'));
    }
  }
}
