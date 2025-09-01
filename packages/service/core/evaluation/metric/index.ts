import { MongoEvalMetric } from './schema';
import type {
  EvaluationMetricSchemaType,
  CreateMetricParams
} from '@fastgpt/global/core/evaluation/type';
import { checkUpdateResult, checkDeleteResult } from '../common';
import { Types } from 'mongoose';
// parseHeaderCert import removed - not needed anymore

export class EvaluationMetricService {
  static async createMetric(
    params: CreateMetricParams & {
      teamId: string;
      tmbId: string;
    }
  ): Promise<EvaluationMetricSchemaType> {
    const { teamId, tmbId, ...metricParams } = params;

    const metric = await MongoEvalMetric.create({
      ...metricParams,
      teamId,
      tmbId
    });

    return metric.toObject();
  }

  static async getMetric(metricId: string, teamId: string): Promise<EvaluationMetricSchemaType> {
    const metric = await MongoEvalMetric.findOne({
      _id: new Types.ObjectId(metricId),
      teamId: new Types.ObjectId(teamId)
    }).lean();

    if (!metric) {
      throw new Error('Metric not found');
    }

    return metric;
  }

  static async updateMetric(
    metricId: string,
    updates: Partial<CreateMetricParams>,
    teamId: string
  ): Promise<void> {
    const result = await MongoEvalMetric.updateOne(
      { _id: new Types.ObjectId(metricId), teamId: new Types.ObjectId(teamId) },
      { $set: updates }
    );

    checkUpdateResult(result, 'Metric');
  }

  static async deleteMetric(metricId: string, teamId: string): Promise<void> {
    const result = await MongoEvalMetric.deleteOne({
      _id: new Types.ObjectId(metricId),
      teamId: new Types.ObjectId(teamId)
    });

    checkDeleteResult(result, 'Metric');
  }

  static async listMetrics(
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
          ...(tmbId ? [{ tmbId: new Types.ObjectId(tmbId) }] : []) // Own metrics
        ]
      };
    }

    const [metrics, total] = await Promise.all([
      MongoEvalMetric.find(finalFilter).sort(sort).skip(skip).limit(limit).lean(),
      MongoEvalMetric.countDocuments(finalFilter)
    ]);

    return {
      list: metrics,
      total
    };
  }
}
