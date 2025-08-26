# FastGPT 评估模块设计
## **1. FastGPT 评估模块产品设计**
### **1.1 背景**

评估模块旨在解决 LLM 应用从研发到生产的评估标准化、数据管理自动化、优化闭环化问题。通过模块化设计，提供从评估案例生成、多维度指标计算到优化建议输出的完整能力，类比传统软件测试框架，成为 LLM 应用的“质量保障基础设施”。  


**目标**：
+ 标准化 LLM 应用评估流程，支持多任务（QA、生成、分类等）统一评估逻辑；  
+ 简化评估数据管理，支持自动生成、格式兼容；  
+ 模块化设计：将评估系统拆分为独立的子模块
+ 可扩展性：支持多种评估目标和指标
+ 高并发：通过 BullMQ 实现eval_items级并发处理
+ 标准化：建立统一的评估接口标准

### **1.2 模块化架构设计**
![](https://cdn.nlark.com/yuque/__mermaid_v3/553b4ba500b694f41d31a8b4a63d58a4.svg)

### **1.3 核心组件设计**
#### **1.3.1 评估任务组成**
评估任务由以下三个独立组件组成：

- **评估数据集 (Evaluation Dataset)**: 包含测试数据和相关配置

- **评估目标 (Evaluation Target)**: 定义被评估的对象（应用、API等）

- **评估指标 (Evaluation Metrics)**: 定义评估标准和计算方法

#### **1.3.2 执行流程设计**
![](https://cdn.nlark.com/yuque/__mermaid_v3/cafc7cc016790225f4cfb86b1bd13e9c.svg)

## **2. 技术实现**
### **2.1 数据库设计**
#### **2.1.1 新增数据表结构**
**评估数据集表 (eval_datasets)**

```plain
interface EvalDatasetSchemaType {
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

interface DatasetColumn {
  name: string;
  type: 'string' | 'number' | 'boolean';
  required: boolean;
  description?: string;
}
```

**评估目标表 (eval_targets)**

```plain
interface EvalTargetSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  type: 'workflow' | 'api' | 'function';
  config: WorkflowConfig | ApiConfig | FunctionConfig;
  createTime: Date;
  updateTime: Date;
}
```

**评估指标表 (eval_metrics)**

```plain
interface EvalMetricSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  type: 'http' | 'function' | 'ai_model';
  config: HttpConfig | FunctionConfig | AiModelConfig;
  createTime: Date;
  updateTime: Date;
}
```

2.1.2 修改数据表结构

***修改后的评估任务表 (evaluations)**

```plain
interface EvaluationSchemaType {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  datasetId: string;  // 关联数据集
  targetId: string;   // 关联目标
  metricIds: string[]; // 关联指标数组
  usageId: string;
  status: EvaluationStatusEnum;
  createTime: Date;
  finishTime?: Date;
  avgScore?: number;
  errorMessage?: string;
}

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

export enum EvaluationStatusEnum {
  queuing = 0,
  evaluating = 1,
  completed = 2
}
```

### **2.2 API 设计**
#### **2.2.1 评估数据集 API**
```plain
// 数据集管理
POST   /api/core/evaluation/dataset/create     // 创建数据集
GET    /api/core/evaluation/dataset/:id        // 获取数据集详情
PUT    /api/core/evaluation/dataset/:id        // 更新数据集
DELETE /api/core/evaluation/dataset/:id        // 删除数据集
POST   /api/core/evaluation/dataset/list       // 获取数据集列表
POST   /api/core/evaluation/dataset/import     // 导入数据
GET    /api/core/evaluation/dataset/:id/export // 导出数据
```

#### **2.2.2 评估指标 API**
```plain
// 指标管理
POST   /api/core/evaluation/metric/create      // 创建评估指标
GET    /api/core/evaluation/metric/:id         // 获取指标详情
PUT    /api/core/evaluation/metric/:id         // 更新指标
DELETE /api/core/evaluation/metric/:id         // 删除指标
POST   /api/core/evaluation/metric/list        // 获取指标列表
POST   /api/core/evaluation/metric/test        // 测试指标执行
```

#### **2.2.3 评估任务(集成了评估目标) API**
| 模块 | 请求路径 | HTTP 方法 | API 描述 | 请求说明 | 响应说明 |
| --- | --- | --- | --- | --- | --- |
| **评估任务管理** | `/api/core/evaluation/task/create` | POST | 创建评估任务 | 请求体：`{name, description?, datasetId, target, metricIds[]}` | 返回创建的评估任务对象 |
|  | `/api/core/evaluation/task/list` | POST | 获取评估任务列表 | 请求体：`{pageNum?, pageSize?, searchKey?}` | 返回分页的评估任务列表 |
|  | `/api/core/evaluation/task/detail` | GET | 获取评估任务详情 | 查询参数：`id` | 返回评估任务详细信息 |
|  | `/api/core/evaluation/task/update` | PUT | 更新评估任务 | 请求体：任务更新信息 | 返回更新后的任务信息 |
|  | `/api/core/evaluation/task/delete` | DELETE | 删除评估任务 | 查询参数或请求体：任务 ID | 返回删除成功消息 |
|  | `/api/core/evaluation/task/start` | POST | 启动评估任务 | 请求体：`{evaluationId}` | 返回启动成功消息 |
|  | `/api/core/evaluation/task/stop` | POST | 停止评估任务 | 请求体：`{evaluationId}` | 返回停止成功消息 |
|  | `/api/core/evaluation/task/restart` | POST | 重启评估任务 | 请求体：任务 ID | 返回重启成功消息 |
|  | `/api/core/evaluation/task/stats` | GET | 获取评估任务统计 | 查询参数：`evaluationId` | 返回统计信息：`{total, completed, evaluating, queuing, error, avgScore?}` |
| **评估任务项管理** | `/api/core/evaluation/task/item/list` | POST | 获取评估项列表 | 请求体：`{evalId, pageNum?, pageSize?}` | 返回分页的评估项列表 |
|  | `/api/core/evaluation/task/item/detail` | GET | 获取评估项详情 | 查询参数：评估项 ID | 返回评估项详细信息 |
|  | `/api/core/evaluation/task/item/update` | PUT | 更新评估项 | 请求体：评估项更新信息 | 返回更新后的评估项 |
|  | `/api/core/evaluation/task/item/delete` | DELETE | 删除评估项 | 查询参数或请求体：评估项 ID | 返回删除成功消息 |
|  | `/api/core/evaluation/task/item/retry` | POST | 重试评估项 | 请求体：评估项 ID | 返回重试成功消息 |
|  | `/api/core/evaluation/task/item/export` | GET/POST | 导出评估项结果 | 查询参数或请求体：导出配置 | 返回导出文件或链接 |


### 关键说明：
1. **认证要求**: 所有 API 都需要团队认证 (`authToken: true`)
2. **分页参数**: `pageNum` (默认 1), `pageSize` (默认 20, 最大 100)
3. **任务状态**: `queuing`, `evaluating`, `completed`, `error`

  关键说明：

1. 认证要求: 所有API都需要团队认证 (authToken: true)
2. 分页参数: pageNum (默认1), pageSize (默认20, 最大100)
3. 任务状态: queuing, evaluating, completed, error

### **2.3 模块实现**
#### **2.3.1 评估数据集模块【具体实现看俊鹏的设计】**
```plain
// packages/service/core/evaluation/dataset/index.ts
export class EvaluationDatasetService {
  // 创建数据集
  async createDataset(params: CreateDatasetParams): Promise<EvalDatasetSchemaType>;
  
  // 读取数据集
  async getDataset(datasetId: string): Promise<EvalDatasetSchemaType>;
  
  // 更新数据集
  async updateDataset(datasetId: string, updates: UpdateDatasetParams): Promise<void>;
  
  // 删除数据集
  async deleteDataset(datasetId: string): Promise<void>;
  
  // 验证数据格式
  async validateDataFormat(data: any[], columns: DatasetColumn[]): Promise<ValidationResult>;
  
  // 导入数据
  async importData(datasetId: string, file: File): Promise<ImportResult>;
  
  // 导出数据
  async exportData(datasetId: string, format: 'csv' | 'json'): Promise<Buffer>;
}
```

#### **2.3.2 评估目标模块**
```plain
// packages/service/core/evaluation/target/index.ts
export abstract class EvaluationTarget {
  abstract execute(input: EvalInput): Promise<EvalOutput>;
  abstract validate(): Promise<boolean>;
}

export class WorkflowTarget extends EvaluationTarget {
  private config: WorkflowConfig;
  
  async execute(input: EvalInput): Promise<EvalOutput> {
    // 调用 dispatchWorkFlow
    const result = await dispatchWorkFlow({
      // ... workflow parameters
    });
    return {
      response: result.assistantResponses[0]?.text?.content,
      usage: result.flowUsages,
      responseTime: Date.now()
    };
  }
}

export class ApiTarget extends EvaluationTarget {
  private config: ApiConfig;
  
  async execute(input: EvalInput): Promise<EvalOutput> {
    // HTTP API 调用逻辑
  }
}
```

#### **2.3.3 评估指标模块【具体实现看祥成的设计】**
```plain
// packages/service/core/evaluation/metric/index.ts
export abstract class EvaluationMetric {
  abstract evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult>;
  abstract getName(): string;
}

export class HttpMetric extends EvaluationMetric {
  private config: HttpConfig;
  
  async evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult> {
    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: this.config.headers,
      body: JSON.stringify({ input, output })
    });
    return await response.json();
  }
}

export class FunctionMetric extends EvaluationMetric {
  private config: FunctionConfig;
  
  async evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult> {
    // 动态执行函数
    const func = new Function('input', 'output', this.config.code);
    return func(input, output);
  }
}

export class AiModelMetric extends EvaluationMetric {
  private config: AiModelConfig;
  
  async evaluate(input: EvalInput, output: EvalOutput): Promise<MetricResult> {
    // AI 模型评估逻辑
    return await getAppEvaluationScore({
      question: input.question,
      appAnswer: output.response,
      standardAnswer: input.expectedResponse,
      model: this.config.model
    });
  }
}
```

### **2.4 BullMQ 队列设计**
#### **2.4.1 队列结构**
```plain
// packages/service/core/evaluation/mq.ts
export enum EvaluationQueueNames {
  evaluation_task = 'evaluation_task',      // 评估任务队列
  evaluation_item = 'evaluation_item'       // 评估项队列
}

export interface EvaluationTaskJobData {
  evalId: string;
  datasetId: string;
  targetId: string;
  metricIds: string[];
}

export interface EvaluationItemJobData {
  evalId: string;
  evalItemId: string;
  dataItem: DatasetItem;
  targetConfig: EvalTargetSchemaType;
  metricsConfig: EvalMetricSchemaType[];
}
```



#### **2.4.2 任务处理器**
```plain
// packages/service/core/evaluation/processor.ts
const evaluationTaskProcessor = async (job: Job<EvaluationTaskJobData>) => {
  const { evalId, datasetId, targetId, metricIds } = job.data;
  
  // 1. 加载配置
  const [dataset, target, metrics] = await Promise.all([
    getEvaluationDataset(datasetId),
    getEvaluationTarget(targetId),
    getEvaluationMetrics(metricIds)
  ]);
  
  // 2. 创建 eval_items
  const evalItems = dataset.dataItems.map(dataItem => ({
    evalId,
    dataItem,
    targetConfig: target,
    metricsConfig: metrics,
    status: EvaluationStatusEnum.queuing
  }));
  
  // 3. 批量插入数据库
  await MongoEvalItem.insertMany(evalItems);
  
  // 4. 提交到 eval_item 队列进行并发处理
  const jobs = evalItems.map(item => ({
    name: 'process_eval_item',
    data: {
      evalId,
      evalItemId: item._id,
      dataItem: item.dataItem,
      targetConfig: item.targetConfig,
      metricsConfig: item.metricsConfig
    }
  }));
  
  await evaluationItemQueue.addBulk(jobs);
};

const evaluationItemProcessor = async (job: Job<EvaluationItemJobData>) => {
  const { evalId, evalItemId, dataItem, targetConfig, metricsConfig } = job.data;
  
  try {
    // 1. 用量检查
    await checkTeamAIPoints(targetConfig.teamId);
    
    // 2. 调用评估目标
    const targetInstance = createTargetInstance(targetConfig);
    const output = await targetInstance.execute({
      question: dataItem.question,
      expectedResponse: dataItem.expectedResponse,
      globalVariables: dataItem.globalVariables
    });
    
    // 3. 执行评估指标
    const metricResults = await Promise.all(
      metricsConfig.map(async (metricConfig) => {
        const metricInstance = createMetricInstance(metricConfig);
        return await metricInstance.evaluate(dataItem, output);
      })
    );
    
    // 4. 计算综合分数
    const avgScore = metricResults.reduce((sum, result) => sum + result.score, 0) / metricResults.length;
    
    // 5. 存储结果
    await MongoEvalItem.updateOne(
      { _id: evalItemId },
      {
        $set: {
          response: output.response,
          responseTime: new Date(output.responseTime),
          status: EvaluationStatusEnum.completed,
          score: avgScore,
          metricResults,
          finishTime: new Date()
        }
      }
    );
    
  } catch (error) {
    await handleEvalItemError(evalItemId, error);
  }
};
```

### **2.5 异常处理与流程控制**
#### **2.5.1 异常场景分析**
![](https://cdn.nlark.com/yuque/__mermaid_v3/a501d8334f85846ebdff41832d01f359.svg)

#### **2.5.2 错误处理策略**
```plain
// packages/service/core/evaluation/error-handler.ts
export class EvaluationErrorHandler {
  static async handleTargetError(evalItemId: string, error: any): Promise<void> {
    if (error.code === 'TARGET_TIMEOUT') {
      // 超时错误，可重试
      await this.scheduleRetry(evalItemId, error);
    } else if (error.code === 'TARGET_CONFIG_ERROR') {
      // 配置错误，不可重试
      await this.markAsPermanentError(evalItemId, error);
    }
  }
  
  static async handleMetricError(evalItemId: string, metricId: string, error: any): Promise<void> {
    // 记录单个指标的错误，但不影响其他指标的执行
    await MongoEvalItem.updateOne(
      { _id: evalItemId },
      {
        $set: {
          [`metricErrors.${metricId}`]: error.message
        }
      }
    );
  }
}
```

#### 2.5.3 评估资源改动引发范围
在评估任务被提交后，会将当前的评估数据项配置DatasetItem、评估目标配置EvalTargetSchemaType，评估指标配置EvalMetricSchemaType作为JobData传入各个子任务， 此时，评估任务的执行结果就不会因为这些关联改动而发生变更。



#### 2.5.4 评估目标-工作流对象删除
当评估目标-工作流被删除时，触发onDelOneApp回调，在其中添加对关联任务的删除操作，并将对应评估项/评估任务的状态修改为error状态。



## **3. 前端设计**
### **3.1 组件架构设计**
![](https://cdn.nlark.com/yuque/__mermaid_v3/95d34ae638fbf4b3aaed041d3c8ed75a.svg)

### **3.2 页面设计**
#### **3.2.1 评估主页面**
```plain
// projects/app/src/pages/dashboard/evaluation/index.tsx
const EvaluationPage = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  
  return (
    <Box>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <TabList>
          <Tab value="tasks">评估任务</Tab>
          <Tab value="datasets">数据集</Tab>
          <Tab value="targets">评估目标</Tab>
          <Tab value="metrics">评估指标</Tab>
        </TabList>
        
        <TabPanels>
          <TabPanel value="tasks">
            <EvaluationTasksPanel />
          </TabPanel>
          <TabPanel value="datasets">
            <EvaluationDatasetsPanel />
          </TabPanel>
          <TabPanel value="targets">
            <EvaluationTargetsPanel />
          </TabPanel>
          <TabPanel value="metrics">
            <EvaluationMetricsPanel />
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
};
```

#### **3.2.2 评估任务创建组件**
```plain
// projects/app/src/components/evaluation/TaskCreateModal.tsx
const TaskCreateModal = ({ isOpen, onClose }: Props) => {
  const { register, watch, setValue, handleSubmit } = useForm<CreateTaskFormType>({
    defaultValues: {
      name: '',
      datasetId: '',
      targetId: '',
      metricIds: []
    }
  });
  
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalHeader>创建评估任务</ModalHeader>
      <ModalBody>
        <FormControl>
          <FormLabel>任务名称</FormLabel>
          <Input {...register('name', { required: true })} />
        </FormControl>
        
        <FormControl>
          <FormLabel>选择数据集</FormLabel>
          <DatasetSelector
            value={watch('datasetId')}
            onChange={(id) => setValue('datasetId', id)}
          />
        </FormControl>
        
        <FormControl>
          <FormLabel>选择评估目标</FormLabel>
          <TargetSelector
            value={watch('targetId')}
            onChange={(id) => setValue('targetId', id)}
          />
        </FormControl>
        
        <FormControl>
          <FormLabel>选择评估指标</FormLabel>
          <MetricMultiSelector
            value={watch('metricIds')}
            onChange={(ids) => setValue('metricIds', ids)}
          />
        </FormControl>
      </ModalBody>
    </Modal>
  );
};
```

### **3.3 状态管理**
```plain
// projects/app/src/web/core/evaluation/store/evaluation.ts
interface EvaluationState {
  tasks: EvaluationTaskType[];
  datasets: EvalDatasetType[];
  targets: EvalTargetType[];
  metrics: EvalMetricType[];
  loading: boolean;
  error: string | null;
}

export const useEvaluationStore = create<EvaluationState & EvaluationActions>((set, get) => ({
  // State
  tasks: [],
  datasets: [],
  targets: [],
  metrics: [],
  loading: false,
  error: null,
  
  // Actions
  fetchTasks: async () => {
    set({ loading: true });
    try {
      const tasks = await getEvaluationTasks();
      set({ tasks, loading: false });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
  
  createTask: async (params: CreateTaskParams) => {
    const task = await createEvaluationTask(params);
    set({ tasks: [...get().tasks, task] });
  },
  
  // ... 其他操作
}));
```

## **4. 数据流程与交互流程**
### **4.1 评估任务创建流程**
![](https://cdn.nlark.com/yuque/__mermaid_v3/274ec2282b7635832adfb741d4a16120.svg)

### **4.2 评估项并发处理流程**
![](https://cdn.nlark.com/yuque/__mermaid_v3/8b0551379e0831fde4518056c9d1baa0.svg)

## **5. 测试策略**
### **5.1 单元测试**
```plain
// test/evaluation/dataset.test.ts
describe('EvaluationDatasetService', () => {
  test('should create dataset successfully', async () => {
    const service = new EvaluationDatasetService();
    const params = {
      name: 'Test Dataset',
      columns: [
        { name: 'question', type: 'string', required: true },
        { name: 'answer', type: 'string', required: true }
      ]
    };
    
    const dataset = await service.createDataset(params);
    expect(dataset.name).toBe(params.name);
    expect(dataset.columns).toEqual(params.columns);
  });
  
  test('should validate data format correctly', async () => {
    const service = new EvaluationDatasetService();
    const validData = [
      { question: 'What is AI?', answer: 'Artificial Intelligence' }
    ];
    const invalidData = [
      { question: 'What is AI?' } // missing required field
    ];
    
    const validResult = await service.validateDataFormat(validData, columns);
    const invalidResult = await service.validateDataFormat(invalidData, columns);
    
    expect(validResult.isValid).toBe(true);
    expect(invalidResult.isValid).toBe(false);
  });
});
```

### **5.2 集成测试**
```plain
// test/evaluation/integration.test.ts
describe('Evaluation Integration Tests', () => {
  test('should complete full evaluation workflow', async () => {
    // 1. 创建数据集
    const dataset = await createTestDataset();
    
    // 2. 创建评估目标
    const target = await createTestTarget();
    
    // 3. 创建评估指标
    const metrics = await createTestMetrics();
    
    // 4. 创建评估任务
    const task = await createEvaluationTask({
      datasetId: dataset._id,
      targetId: target._id,
      metricIds: metrics.map(m => m._id)
    });
    
    // 5. 等待任务完成
    await waitForTaskCompletion(task._id);
    
    // 6. 验证结果
    const results = await getEvaluationResults(task._id);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeDefined();
  });
});
```

# FastGPT Eval-Based APP-Optimization-Agent
基于FastGPT的评估、工作流等能力设计一个应用优化agent，目标是连接评估结果与应用优化，实现“问题诊断-策略生成-验证-执行”闭环。
可以参考
1. ReAct设计模式
2. MemGPT设计模式
3. Claude Code Agent 设计模式
注意：你只需要给出设计文档，不需要去具体实现代码