import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { EvalMetricSchemaType } from '@fastgpt/global/core/evaluation/type';
const { Schema } = connectionMongo;

const HttpConfigSchema = new Schema({
  url: { type: String, required: true },
  method: { type: String, enum: ['GET', 'POST'], default: 'POST' },
  headers: { type: Object, default: {} },
  timeout: { type: Number, default: 30000 }
});

const FunctionConfigSchema = new Schema({
  code: { type: String, required: true },
  timeout: { type: Number, default: 5000 }
});

const AiModelConfigSchema = new Schema({
  model: { type: String, required: true },
  prompt: String
});

const EvalMetricSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true,
    index: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  name: { type: String, required: true },
  description: String,
  type: { type: String, enum: ['http', 'function', 'ai_model'], required: true },
  config: {
    type: Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function (config: any) {
        const type = (this as any).type;
        if (type === 'http') {
          return config.url != null && config.method != null;
        } else if (type === 'function') {
          return config.code != null;
        } else if (type === 'ai_model') {
          return config.model != null;
        }
        return false;
      },
      message: 'Config must match the metric type'
    }
  },
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

// 索引
EvalMetricSchema.index({ teamId: 1, name: 1 });
EvalMetricSchema.index({ type: 1 });
EvalMetricSchema.index({ createTime: -1 });

// 中间件：更新时自动设置 updateTime
EvalMetricSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

EvalMetricSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  this.set({ updateTime: new Date() });
  next();
});

export const EvalMetricCollectionName = 'eval_metrics';

export const MongoEvalMetric = getMongoModel<EvalMetricSchemaType>(
  EvalMetricCollectionName,
  EvalMetricSchema
);
