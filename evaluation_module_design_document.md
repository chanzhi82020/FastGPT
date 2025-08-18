# FastGPT 评估模块设计文档

## 1. 产品设计

### 1.1 背景

FastGPT 评估模块是为了帮助用户对 AI 应用进行批量测试和评估而设计的功能模块。它允许用户上传包含测试数据的 CSV 文件，自动运行应用并对结果进行评分，从而快速验证应用的准确性和性能。

### 1.2 实现的效果以及解决的问题

**解决的问题：**
- 手动测试 AI 应用效率低下
- 缺乏标准化的评估流程
- 难以批量验证应用性能
- 无法量化应用的准确性

**实现的效果：**
- 支持批量上传测试数据（CSV 格式）
- 自动运行应用并收集响应结果
- 使用 AI 模型对结果进行自动评分
- 提供详细的评估报告和统计数据
- 支持评估任务的管理和监控

### 1.3 大致交互效果及页面改动

**主要页面：**

1. **评估任务列表页** (`/dashboard/evaluation/index.tsx`)
   - 显示所有评估任务
   - 支持搜索和筛选
   - 显示任务状态、进度、评分等信息
   - 提供删除和查看详情功能

2. **评估任务创建页** (`/dashboard/evaluation/create.tsx`)
   - 任务基本信息配置（名称、评估模型）
   - 选择要评估的应用
   - 上传评估数据文件
   - 下载 CSV 模板功能

3. **评估详情弹窗** (`DetailModal.tsx`)
   - 显示评估任务概览信息
   - 展示具体的评估项列表
   - 支持查看每个评估项的详细结果
   - 提供导出、重试、删除功能

## 2. 技术实现

### 2.1 API

#### 2.1.1 API 端点设计

**评估任务管理 API：**

- `POST /api/core/evaluation/create` - 创建评估任务
  - 支持文件上传（multipart/form-data）
  - 验证 CSV 文件格式和内容
  - 创建评估任务和评估项

- `POST /api/core/evaluation/list` - 获取评估任务列表
  - 支持分页和搜索
  - 包含权限校验和统计信息聚合

- `DELETE /api/core/evaluation/delete` - 删除评估任务

**评估项管理 API：**

- `POST /api/core/evaluation/listItems` - 获取评估项列表
- `DELETE /api/core/evaluation/deleteItem` - 删除评估项
- `POST /api/core/evaluation/retryItem` - 重试失败的评估项
- `POST /api/core/evaluation/updateItem` - 更新评估项内容
- `GET /api/core/evaluation/exportItems` - 导出评估结果

#### 2.1.2 Schema 设计

**评估任务 Schema (evalSchema.ts:13-57):**
```typescript
const EvaluationSchema = new Schema({
  teamId: { type: Schema.Types.ObjectId, ref: TeamCollectionName, required: true },
  tmbId: { type: Schema.Types.ObjectId, ref: TeamMemberCollectionName, required: true },
  appId: { type: Schema.Types.ObjectId, ref: AppCollectionName, required: true },
  usageId: { type: Schema.Types.ObjectId, ref: UsageCollectionName, required: true },
  evalModel: { type: String, required: true },
  name: { type: String, required: true },
  createTime: { type: Date, required: true, default: () => new Date() },
  finishTime: Date,
  score: Number,
  errorMessage: String
});
```

**评估项 Schema (evalItemSchema.ts:13-56):**
```typescript
const EvalItemSchema = new Schema({
  evalId: { type: Schema.Types.ObjectId, ref: EvaluationCollectionName, required: true },
  question: { type: String, required: true },
  expectedResponse: { type: String, required: true },
  history: String,
  globalVariables: Object,
  response: String,
  responseTime: Date,
  status: { type: Number, default: EvaluationStatusEnum.queuing, enum: EvaluationStatusValues },
  retry: { type: Number, default: 3 },
  finishTime: Date,
  accuracy: Number,
  relevance: Number,
  semanticAccuracy: Number,
  score: Number,
  errorMessage: String
});
```

### 2.2 Infra

#### 2.2.1 BullMQ 队列系统

**队列配置 (mq.ts:9-17):**
```typescript
export const evaluationQueue = getQueue<EvaluationJobData>(QueueNames.evaluation, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});
```

**Worker 配置 (mq.ts:20-27):**
- 并发数：通过环境变量 `EVAL_CONCURRENCY` 配置，默认为 3
- 失败任务保留：保留最近 1000 个失败任务
- 支持任务去重机制

#### 2.2.2 MongoDB 存储

**集合结构：**
- `eval` - 评估任务主表
- `eval_items` - 评估项子表
- 通过 `evalId` 关联两个集合

**索引优化：**
- `eval` 集合：`{ teamId: 1 }` 
- `eval_items` 集合：`{ evalId: 1, status: 1 }`

### 2.3 Support

#### 2.3.1 认证与鉴权 (auth.ts:11-64)

**权限体系：**
- 评估任务创建者拥有完全权限
- 通过应用权限继承机制控制访问
- 读权限：需要对应应用的读权限
- 写权限：需要对应应用的管理权限

#### 2.3.2 计费系统

**费用计算：**
- 应用运行费用：根据实际 token 消耗计算
- 评估模型费用：根据评估时的 token 使用量计算
- 统一记录到 usage 表中，支持分项计费

### 2.4 交互流程

#### 2.4.1 用户如何创建评估任务

1. **选择应用** - 用户在创建页面选择要评估的应用
2. **下载模板** - 系统根据应用的变量配置生成 CSV 模板
3. **准备数据** - 用户按模板格式准备测试数据
4. **上传文件** - 上传 CSV 文件，系统进行格式验证
5. **配置参数** - 设置任务名称和评估模型
6. **提交创建** - 系统创建评估任务并加入队列

#### 2.4.2 用户如何查看评估结果

1. **任务列表** - 在评估页面查看所有任务状态
2. **实时更新** - 通过轮询机制自动更新进度
3. **详情查看** - 点击详情按钮查看具体结果
4. **结果导出** - 支持导出完整的评估报告

#### 2.4.3 用户如何管理评估任务

1. **任务监控** - 实时查看任务执行状态和进度
2. **错误处理** - 查看错误信息，支持重试失败项
3. **结果编辑** - 对评估项进行编辑和更新
4. **批量操作** - 支持批量删除和导出

#### 2.4.4 用户如何删除评估任务

1. **权限校验** - 验证用户是否有删除权限
2. **任务清理** - 删除队列中的待执行任务
3. **数据清理** - 删除评估任务和所有关联的评估项
4. **确认操作** - 通过确认弹窗防止误删

### 2.5 数据流程

#### 2.5.1 评估任务数据的存储结构

```typescript
// 评估任务主表
interface EvaluationSchemaType {
  _id: string;           // 任务 ID
  teamId: string;        // 团队 ID
  tmbId: string;         // 创建者 ID
  evalModel: string;     // 评估模型
  appId: string;         // 应用 ID
  usageId: string;       // 计费记录 ID
  name: string;          // 任务名称
  createTime: Date;      // 创建时间
  finishTime?: Date;     // 完成时间
  score?: number;        // 总体评分
  errorMessage?: string; // 错误信息
}
```

#### 2.5.2 评估结果数据的存储结构

```typescript
// 评估项详情表
interface EvalItemSchemaType {
  evalId: string;              // 关联评估任务 ID
  question: string;            // 测试问题
  expectedResponse: string;    // 期望回答
  globalVariables?: Record<string, any>; // 全局变量
  history?: string;            // 历史对话
  response?: string;           // 实际回答
  responseTime?: Date;         // 响应时间
  status: EvaluationStatusEnum; // 执行状态
  retry: number;               // 重试次数
  errorMessage?: string;       // 错误信息
  accuracy?: number;           // 准确度评分
  relevance?: number;          // 相关性评分
  semanticAccuracy?: number;   // 语义准确度评分
  score?: number;              // 综合评分
}
```

### 2.6 异常场景分析

#### 2.6.1 可能出现异常的情况

1. **文件格式错误**
   - CSV 文件格式不正确
   - 必填字段缺失
   - 数据类型不匹配

2. **资源不足**
   - AI Points 余额不足
   - 并发任务过多
   - 系统资源限制

3. **应用执行异常**
   - 应用配置错误
   - 工作流执行失败
   - 模型调用异常

4. **评估模型异常**
   - 评估模型不可用
   - API 调用失败
   - 超时错误

#### 2.6.2 异常处理机制

1. **文件验证 (utils.ts:14-91)**
   - 严格的 CSV 格式验证
   - 数据类型和范围检查
   - 变量配置匹配验证

2. **重试机制**
   - 每个评估项默认重试 3 次
   - 指数退避策略
   - 错误状态保存

3. **资源检查**
   - 创建前检查 AI Points 余额
   - 限制团队同时运行的评估任务数量
   - 暂停机制：余额不足时暂停任务

4. **队列管理**
   - 任务去重避免重复提交
   - 失败任务清理机制
   - 支持手动移除队列中的任务

## 3. 前端设计

### 3.1 组件设计

#### 3.1.1 核心组件

1. **EvaluationDetailModal** (`DetailModal.tsx`)
   - 评估任务详情展示
   - 评估项列表和详情查看
   - 支持编辑、重试、删除操作

2. **FileSelector** 
   - CSV 文件上传组件
   - 支持文件格式验证
   - 错误状态展示

3. **AppSelect**
   - 应用选择器
   - 权限过滤
   - 支持搜索

4. **AIModelSelector**
   - 评估模型选择器
   - 过滤支持评估的模型

#### 3.1.2 状态管理

**表单状态 (create.tsx:51-58):**
```typescript
const { register, setValue, watch, handleSubmit } = useForm<EvaluationFormType>({
  defaultValues: {
    name: '',
    evalModel: evalModelList[0]?.model,
    appId: '',
    evaluationFiles: []
  }
});
```

**列表状态 (index.tsx:46-61):**
```typescript
const {
  data: evaluationList,
  Pagination,
  getData: fetchData,
  total,
  pageSize
} = usePagination(getEvaluationList, {
  defaultPageSize: 20,
  pollingInterval,
  pollingWhenHidden: true,
  params: { searchKey },
  refreshDeps: [searchKey]
});
```

### 3.2 页面设计

#### 3.2.1 评估任务列表页

**核心功能：**
- 任务列表展示和搜索
- 实时状态更新（轮询间隔：10 秒）
- 进度展示和错误提示
- 支持删除和查看详情操作

**关键实现：**
- 自适应轮询：有运行任务时启用轮询，否则停止
- 状态渲染：根据完成情况显示不同的进度状态
- 错误处理：通过 Tooltip 展示详细错误信息

#### 3.2.2 评估任务创建页

**核心功能：**
- 表单验证和数据收集
- 文件上传和格式检查
- 模板下载功能
- 实时上传进度显示

**交互流程：**
1. 选择应用 → 启用模板下载
2. 上传文件 → 格式验证
3. 配置参数 → 提交创建
4. 显示进度 → 跳转列表

#### 3.2.3 评估详情弹窗

**布局设计：**
- 左侧 2/3：评估项列表
- 右侧 1/3：选中项详情
- 顶部：任务概览信息

**交互特性：**
- 支持评估项的实时编辑
- 错误项高亮显示
- 支持单项重试和删除
- 完整数据导出功能

## 4. 关键实现细节

### 4.1 文件格式验证 (utils.ts:14-91)

系统对上传的 CSV 文件进行严格验证：
- 文件头格式检查：必须匹配应用变量配置
- 必填字段验证：`*q`（问题）和 `*a`（答案）为必填
- 数据行数限制：默认最多 1000 行
- 变量类型验证：根据应用配置验证数据类型

### 4.2 队列处理机制 (index.ts:274-354)

评估任务通过 BullMQ 队列异步处理：
- 任务初始化检查：验证评估任务和应用存在性
- 循环处理机制：逐个处理评估项
- 资源检查：每轮处理前检查 AI Points 余额
- 错误处理：失败项自动重试，超过限制则标记错误

### 4.3 评分机制 (index.ts:244-251)

使用 AI 模型对评估结果进行自动评分：
- 调用专用评估模型
- 比较应用回答与期望回答
- 生成准确度评分
- 记录评估过程的 token 消耗

### 4.4 权限控制 (auth.ts:11-64)

基于应用权限的继承机制：
- 评估任务创建者拥有完全权限
- 其他用户需要相应应用的读/写权限
- 支持团队内权限共享
- 细粒度的操作权限控制

### 4.5 实时状态更新 (index.tsx:68-76)

前端通过智能轮询机制更新状态：
- 有运行中或错误任务时启用 10 秒轮询
- 所有任务完成后停止轮询
- 避免不必要的网络请求

这个评估模块的设计充分考虑了用户体验、系统性能和可扩展性，通过队列机制保证了大规模评估任务的稳定执行，同时提供了完善的错误处理和监控机制。