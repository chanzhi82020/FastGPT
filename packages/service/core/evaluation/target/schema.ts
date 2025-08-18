import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';
import { connectionMongo, getMongoModel } from '../../../common/mongo';
import type { EvalTargetSchemaType } from '@fastgpt/global/core/evaluation/type';
const { Schema } = connectionMongo;

const WorkflowConfigSchema = new Schema({
  appId: { type: Schema.Types.ObjectId, required: true },
  chatConfig: { type: Object, default: {} }
});

const ApiConfigSchema = new Schema({
  url: { type: String, required: true },
  method: { type: String, enum: ['GET', 'POST', 'PUT', 'DELETE'], default: 'POST' },
  headers: { type: Object, default: {} },
  body: String,
  timeout: { type: Number, default: 30000 }
});

const FunctionConfigSchema = new Schema({
  code: { type: String, required: true },
  timeout: { type: Number, default: 5000 }
});

const EvalTargetSchema = new Schema({
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
  type: { type: String, enum: ['workflow', 'api', 'function'], required: true },
  config: {
    type: Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function (config: any) {
        const type = (this as any).type;
        if (type === 'workflow') {
          return config.appId != null;
        } else if (type === 'api') {
          return config.url != null && config.method != null;
        } else if (type === 'function') {
          return config.code != null;
        }
        return false;
      },
      message: 'Config must match the target type'
    }
  },
  createTime: { type: Date, default: () => new Date() },
  updateTime: { type: Date, default: () => new Date() }
});

// 索引
EvalTargetSchema.index({ teamId: 1, name: 1 });
EvalTargetSchema.index({ type: 1 });
EvalTargetSchema.index({ createTime: -1 });

// 中间件：更新时自动设置 updateTime
EvalTargetSchema.pre('save', function (next) {
  this.updateTime = new Date();
  next();
});

EvalTargetSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  this.set({ updateTime: new Date() });
  next();
});

export const EvalTargetCollectionName = 'eval_targets';

export const MongoEvalTarget = getMongoModel<EvalTargetSchemaType>(
  EvalTargetCollectionName,
  EvalTargetSchema
);
