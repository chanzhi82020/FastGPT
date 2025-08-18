import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type {
  EvaluationSchemaType,
  EvalItemSchemaType
} from '@fastgpt/global/core/evaluation/type';
import { UsageCollectionName } from '../../../support/wallet/usage/schema';
import {
  EvaluationStatusEnum,
  EvaluationStatusValues
} from '@fastgpt/global/core/evaluation/constants';

const { Schema } = connectionMongo;

// Collection names
export const EvaluationCollectionName = 'eval';
export const EvalItemCollectionName = 'eval_items';
export const EvalDatasetCollectionName = 'eval_datasets';
export const EvalTargetCollectionName = 'eval_targets';
export const EvalMetricCollectionName = 'eval_metrics';

// Evaluation Schema
const EvaluationSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  datasetId: {
    type: Schema.Types.ObjectId,
    ref: EvalDatasetCollectionName,
    required: true
  },
  targetId: {
    type: Schema.Types.ObjectId,
    ref: EvalTargetCollectionName,
    required: true
  },
  metricIds: [
    {
      type: Schema.Types.ObjectId,
      ref: EvalMetricCollectionName
    }
  ],
  usageId: {
    type: Schema.Types.ObjectId,
    ref: UsageCollectionName,
    required: true
  },
  status: {
    type: Number,
    enum: EvaluationStatusValues,
    default: EvaluationStatusEnum.queuing
  },
  createTime: {
    type: Date,
    required: true,
    default: () => new Date()
  },
  finishTime: Date,
  avgScore: Number,
  errorMessage: String
});

EvaluationSchema.index({ teamId: 1 });

// Evaluation Item Schema
const EvalItemSchema = new Schema({
  evalId: {
    type: Schema.Types.ObjectId,
    ref: EvaluationCollectionName,
    required: true
  },
  dataItem: {
    type: Object,
    required: true
  },
  targetId: {
    type: Schema.Types.ObjectId,
    ref: EvalTargetCollectionName,
    required: true
  },
  metricIds: [
    {
      type: Schema.Types.ObjectId,
      ref: EvalMetricCollectionName
    }
  ],
  response: String,
  responseTime: Date,
  status: {
    type: Number,
    default: EvaluationStatusEnum.queuing,
    enum: EvaluationStatusValues
  },
  retry: {
    type: Number,
    default: 3
  },
  finishTime: Date,
  score: Number,
  metricResults: [
    {
      metricId: {
        type: Schema.Types.ObjectId,
        ref: EvalMetricCollectionName
      },
      metricName: String,
      score: Number,
      details: Object,
      error: String
    }
  ],
  errorMessage: String
});

EvalItemSchema.index({ evalId: 1, status: 1 });

// Export models
export const MongoEvaluation = getMongoModel<EvaluationSchemaType>(
  EvaluationCollectionName,
  EvaluationSchema
);

export const MongoEvalItem = getMongoModel<EvalItemSchemaType>(
  EvalItemCollectionName,
  EvalItemSchema
);
