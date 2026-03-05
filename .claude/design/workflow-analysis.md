# FastGPT 工作流原理分析文档

> 本文档分析 FastGPT 工作流的核心原理，包括节点定义、执行引擎、数据流转机制，以及如何拓展新的节点类型。

## 目录

- [1. 工作流架构概览](#1-工作流架构概览)
- [2. 节点定义机制](#2-节点定义机制)
- [3. 执行引擎原理](#3-执行引擎原理)
- [4. 数据流转机制](#4-数据流转机制)
- [5. 如何拓展新的节点类型](#5-如何拓展新的节点类型)
- [6. 总结](#6-总结)
- [7. 参考文件索引](#7-参考文件索引)

---

## 1. 工作流架构概览

### 1.1 核心代码结构

```
packages/
├── global/core/workflow/              # 工作流全局定义
│   ├── node/constant.ts               # 节点类型常量定义
│   ├── type/node.ts                   # 节点类型定义
│   ├── template/system/               # 系统节点模板
│   │   ├── textEditor.ts              # 文本编辑器节点模板
│   │   ├── aiChat/                    # AI 对话节点模板
│   │   └── ...                        # 其他节点模板
│   └── runtime/utils.ts               # 运行时工具（变量替换等）
│
└── service/core/workflow/             # 工作流服务端逻辑
    └── dispatch/                      # 节点执行调度
        ├── index.ts                   # 工作流执行引擎
        ├── constants.ts               # 节点回调映射
        ├── ai/                        # AI 相关节点执行
        │   ├── chat.ts                # 对话节点执行
        │   └── ...
        └── tools/                     # 工具类节点执行
            ├── textEditor.ts          # 文本编辑器执行
            └── ...

projects/app/
└── src/pageComponents/app/detail/
    └── WorkflowComponents/            # 工作流前端编辑器
```

### 1.2 核心组件关系图

```
┌─────────────────────────────────────────────────────────────┐
│                      工作流系统                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │  节点定义层   │      │  前端编辑器  │                     │
│  │              │      │              │                     │
│  │ - 节点类型    │ ───▶ │ - 拖拽编辑   │                     │
│  │ - 节点模板    │      │ - 连线配置   │                     │
│  │ - 输入输出    │      │ - 参数设置   │                     │
│  └──────────────┘      └──────────────┘                    │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │  执行引擎层   │      │  数据流转层  │                     │
│  │              │ ───▶ │              │                     │
│  │ - 队列管理    │      │ - 变量替换   │                     │
│  │ - 并发控制    │      │ - 类型转换   │                     │
│  │ - 节点调度    │      │ - 数据传递   │                     │
│  └──────────────┘      └──────────────┘                    │
│         │                                                   │
│         ▼                                                   │
│  ┌──────────────────────────────────────┐                  │
│  │         节点执行回调映射               │                  │
│  │                                       │                  │
│  │  chatNode   → dispatchChatCompletion │                  │
│  │  textEditor → dispatchTextEditor     │                  │
│  │  ifElseNode → dispatchIfElse         │                  │
│  │  ...                                  │                  │
│  └──────────────────────────────────────┘                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 节点定义机制

### 2.1 节点类型系统

#### 2.1.1 核心类型枚举

**位置**: `packages/global/core/workflow/node/constant.ts`

```typescript
// 节点类型枚举（45+ 种节点类型）
export enum FlowNodeTypeEnum {
  // 基础节点
  workflowStart = 'workflowStart',
  chatNode = 'chatNode',

  // 工具节点
  textEditor = 'textEditor',
  ifElseNode = 'ifElseNode',
  code = 'code',
  httpRequest468 = 'httpRequest468',

  // AI 节点
  classifyQuestion = 'classifyQuestion',
  contentExtract = 'contentExtract',
  datasetSearchNode = 'datasetSearchNode',

  // ... 更多节点类型
}

// 输入类型（UI 渲染类型）
export enum FlowNodeInputTypeEnum {
  reference = 'reference',        // 引用其他节点输出
  input = 'input',                // 单行输入
  textarea = 'textarea',          // 多行文本
  numberInput = 'numberInput',    // 数字输入
  switch = 'switch',              // 开关
  select = 'select',              // 下拉选择
  JSONEditor = 'JSONEditor',      // JSON 编辑器
  selectLLMModel = 'selectLLMModel', // LLM 模型选择
  // ... 更多输入类型
}

// 输出类型
export enum FlowNodeOutputTypeEnum {
  static = 'static',    // 静态输出
  dynamic = 'dynamic',  // 动态输出
  hidden = 'hidden',    // 隐藏输出
  source = 'source',    // 源输出
  error = 'error'       // 错误输出
}
```

#### 2.1.2 节点模板类型定义

**位置**: `packages/global/core/workflow/type/node.ts:116-140`

```typescript
export const FlowNodeTemplateTypeSchema = FlowNodeCommonTypeSchema.extend({
  id: z.string(),                        // 节点唯一标识
  templateType: z.string(),              // 模板类型（ai/tools/interactive等）
  flowNodeType: z.enum(FlowNodeTypeEnum), // 节点类型

  // UI 配置
  showSourceHandle: z.boolean().optional(),  // 显示源连接点
  showTargetHandle: z.boolean().optional(),  // 显示目标连接点
  avatar: z.string().optional(),             // 节点图标
  avatarLinear: z.string().optional(),       // 线性图标
  colorSchema: z.enum(NodeColorSchemaEnum).optional(), // 颜色方案

  // 节点属性
  name: z.string(),                      // 节点名称
  intro: z.string().optional(),          // 简介
  isTool: z.boolean().optional(),        // 是否可作为工具

  // 行为控制
  forbidDelete: z.boolean().optional(),  // 禁止删除
  unique: z.boolean().optional(),        // 唯一节点

  // 数据
  inputs: z.array(FlowNodeInputItemTypeSchema),   // 输入配置
  outputs: z.array(FlowNodeOutputItemTypeSchema), // 输出配置

  // 文档
  courseUrl: z.string().optional(),      // 教程链接
  userGuide: z.string().optional(),      // 使用指南
});

export type FlowNodeTemplateType = z.infer<typeof FlowNodeTemplateTypeSchema>;
```

### 2.2 节点模板定义示例

#### 2.2.1 文本编辑器节点 (TextEditor)

**位置**: `packages/global/core/workflow/template/system/textEditor.ts`

```typescript
export const TextEditorNode: FlowNodeTemplateType = {
  // 基础配置
  id: FlowNodeTypeEnum.textEditor,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.textEditor,

  // UI 配置
  showSourceHandle: true,
  showTargetHandle: true,
  avatar: 'core/workflow/template/textConcat',
  avatarLinear: 'core/workflow/template/textConcatLinear',
  colorSchema: 'orange',

  // 显示信息
  name: i18nT('workflow:text_concatenation'),
  intro: i18nT('workflow:intro_text_concatenation'),
  courseUrl: '/docs/introduction/guide/dashboard/workflow/text_editor/',

  // 输入配置
  inputs: [
    {
      key: NodeInputKeyEnum.textareaInput,
      renderTypeList: [FlowNodeInputTypeEnum.textarea], // 多行文本输入
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: i18nT('workflow:concatenation_text'),
      placeholder: i18nT('workflow:input_variable_list')
    }
  ],

  // 输出配置
  outputs: [
    {
      id: NodeOutputKeyEnum.text,
      key: NodeOutputKeyEnum.text,
      label: i18nT('workflow:concatenation_result'),
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
```

### 2.3 节点回调映射

**位置**: `packages/service/core/workflow/dispatch/constants.ts:35-83`

每个节点类型都需要映射到一个执行函数：

```typescript
export const callbackMap: Record<FlowNodeTypeEnum, Function> = {
  // 入口节点
  [FlowNodeTypeEnum.workflowStart]: dispatchWorkflowStart,

  // AI 节点
  [FlowNodeTypeEnum.chatNode]: dispatchChatCompletion,
  [FlowNodeTypeEnum.classifyQuestion]: dispatchClassifyQuestion,
  [FlowNodeTypeEnum.contentExtract]: dispatchContentExtract,

  // 工具节点
  [FlowNodeTypeEnum.textEditor]: dispatchTextEditor,
  [FlowNodeTypeEnum.ifElseNode]: dispatchIfElse,
  [FlowNodeTypeEnum.code]: dispatchCodeSandbox,
  [FlowNodeTypeEnum.httpRequest468]: dispatchHttp468Request,

  // ... 更多映射

  // 纯配置节点（无需执行）
  [FlowNodeTypeEnum.systemConfig]: dispatchSystemConfig,
  [FlowNodeTypeEnum.emptyNode]: () => Promise.resolve(),
  [FlowNodeTypeEnum.comment]: () => Promise.resolve(),
};
```

---

## 3. 执行引擎原理

### 3.1 核心执行流程

**位置**: `packages/service/core/workflow/dispatch/index.ts`

#### 3.1.1 执行入口

```typescript
// dispatchWorkFlow() - 工作流执行入口（第85行）
export async function dispatchWorkFlow(props: DispatchProps) {
  // 1. 权限验证
  // 2. 初始化变量和上下文
  // 3. 建立 SSE 连接（流式响应）
  // 4. 调用 runWorkflow 执行工作流
  // 5. 返回结果
}

// runWorkflow() - 工作流执行主逻辑（第269行）
export const runWorkflow = async (data: RunWorkflowProps) => {
  // 1. 深度检查（防止无限递归）
  // 2. 过滤孤立边
  // 3. 重写运行时工作流
  // 4. 创建工作流队列
  // 5. 执行队列
  // 6. 返回结果
}
```

### 3.2 工作流队列系统 (WorkflowQueue)

**位置**: `packages/service/core/workflow/dispatch/index.ts:341-1097`

这是整个执行引擎的核心，采用**回调模式**避免深层递归。

#### 3.2.1 队列特点

```
1. 可以控制一个 team 下，并发运行的节点数量（最大10个）
2. 每个节点同时只会执行一次，不可能同时运行多次
3. 都会返回 resolve，不存在 reject 状态
4. 采用回调方式避免深度递归
```

#### 3.2.2 核心数据结构

```typescript
class WorkflowQueue {
  // 节点映射
  runtimeNodesMap = new Map(runtimeNodes.map((item) => [item.nodeId, item]));

  // 工作流变量
  workflowRunTimes = 0;                              // 运行次数
  chatResponses: ChatHistoryItemResType[] = [];      // 聊天响应
  chatAssistantResponse: AIChatItemValueItemType[] = []; // 助手响应
  chatNodeUsages: ChatNodeUsageType[] = [];          // 节点使用统计
  system_memories: Record<string, any> = {};         // 节点内存

  // 队列控制
  activeRunQueue: string[] = [];                     // 待检查运行的节点队列
  runningNodes: Set<string> = new Set();             // 正在运行的节点集合
  executedNodes: Set<string> = new Set();            // 已执行的节点集合
  skipNodeQueue: SkipNodeQueueType[] = [];           // 跳过的节点队列

  // 调试信息
  memoryEdges: RuntimeEdgeItemType[] = [];           // 内存边
  memoryNodes: RuntimeNodeItemType[] = [];           // 内存节点
}
```

#### 3.2.3 执行流程

```
┌─────────────────────────────────────────────────┐
│  1. init()  初始化队列                           │
│     - 找到所有入口节点（workflowStart）          │
│     - 将入口节点加入 activeRunQueue              │
│     - 调用 processActiveNode()                   │
└─────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  2. processActiveNode()  处理活跃节点            │
│     - 检查是否应该停止                           │
│     - 检查并发限制（最多10个节点同时运行）        │
│     - 从 activeRunQueue 取出一个节点             │
│     - 调用 checkNodeCanRun()                     │
└─────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  3. checkNodeCanRun()  检查节点能否运行          │
│     ┌─────────────────────────────────────┐     │
│     │ 判断前置条件：                       │     │
│     │ - 节点是否已执行？                   │     │
│     │ - 节点是否正在运行？                 │     │
│     │ - 所有源边是否都已完成？             │     │
│     │ - 节点是否应该跳过？                 │     │
│     └─────────────────────────────────────┘     │
│              ▼          ▼           ▼            │
│         不满足      可以运行      应该跳过        │
│           │           │             │            │
└───────────┼───────────┼─────────────┼────────────┘
            │           │             │
            ▼           ▼             ▼
          跳出      运行节点       跳过节点
                        ▼             ▼
┌─────────────────────────────────────────────────┐
│  4. runNode()  执行节点                          │
│     - 标记节点为"运行中"                         │
│     - 准备节点输入（变量替换）                   │
│     - 从 callbackMap 获取执行函数                │
│     - 执行节点回调                               │
│     - 更新节点输出                               │
│     - 将目标节点加入 activeRunQueue              │
│     - 调用 processActiveNode() 继续处理          │
└─────────────────────────────────────────────────┘
                     ▼
┌─────────────────────────────────────────────────┐
│  5. 循环直到：                                   │
│     - activeRunQueue 为空                        │
│     - runningNodes 为空                          │
│     - 或触发了交互节点                           │
└─────────────────────────────────────────────────┘
```

#### 3.2.4 并发控制

```typescript
async processActiveNode() {
  // 最多10个节点并发运行
  const MAX_CONCURRENT_NODES = 10;

  // 检查是否达到并发上限
  if (this.runningNodes.size >= MAX_CONCURRENT_NODES) {
    return; // 等待当前运行节点完成
  }

  // 从队列取出一个节点
  const nodeId = this.activeRunQueue.shift();

  // 检查节点能否运行
  const canRun = await this.checkNodeCanRun(nodeId);

  if (canRun === 'run') {
    await this.runNode(nodeId);
  } else if (canRun === 'skip') {
    await this.skipNode(nodeId);
  }
  // else: 不满足条件，等待下次检查

  // 继续处理队列中的下一个节点
  await this.processActiveNode();
}
```

### 3.3 节点执行回调

#### 3.3.1 回调函数接口

每个节点的执行函数都遵循相同的接口：

```typescript
type ModuleDispatchProps<T = Record<string, any>> = {
  node: RuntimeNodeItemType;        // 节点信息
  params: T;                        // 节点参数（已完成变量替换）
  variables: Record<string, any>;   // 全局变量
  histories: ChatItemType[];        // 对话历史
  query: string;                    // 当前查询
  workflowStreamResponse?: any;     // 流式响应对象
  // ... 更多上下文参数
};

type DispatchNodeResultType<T = Record<string, any>> = {
  data: T;                          // 节点输出数据
  nodeResponse?: any;               // 节点响应（用于调试显示）
  toolResponses?: any;              // 工具响应
  // ... 更多响应字段
};
```

#### 3.3.2 示例：文本编辑器节点执行

**位置**: `packages/service/core/workflow/dispatch/tools/textEditor.ts`

```typescript
export const dispatchTextEditor = (props: Record<string, any>): Response => {
  const {
    variables,  // 全局变量
    params: {
      system_textareaInput: text = '',
      system_addInputParam: customVariables = {}
    }
  } = props as Props;

  // 1. 格式化变量
  Object.keys(customVariables).forEach((key) => {
    let val = customVariables[key];

    if (typeof val === 'object') {
      val = JSON.stringify(val, null, 2);
    } else if (typeof val === 'number') {
      val = String(val);
    } else if (typeof val === 'boolean') {
      val = val ? 'true' : 'false';
    }

    customVariables[key] = val;
  });

  // 2. 替换文本中的变量
  const textResult = replaceVariable(text, {
    ...customVariables,
    ...variables
  });

  // 3. 返回结果
  return {
    data: {
      [NodeOutputKeyEnum.text]: textResult
    },
    nodeResponse: {
      textOutput: textResult
    }
  };
};
```

---

## 4. 数据流转机制

### 4.1 变量系统

FastGPT 工作流支持两种变量：

1. **节点输出引用**: `{{$nodeId.outputKey$}}`
2. **全局变量引用**: `{{variableKey}}`

### 4.2 变量替换系统

**位置**: `packages/global/core/workflow/runtime/utils.ts:656+`

#### 4.2.1 核心函数

```typescript
// 替换编辑器变量（节点输出引用）
function replaceEditorVariable(
  text: string,
  variables: Record<string, any>
): string {
  // 匹配 {{$nodeId.outputKey$}} 格式
  const regex = /\{\{\$([^\.\}]+)\.([^\}]+)\$\}\}/g;

  return text.replace(regex, (match, nodeId, outputKey) => {
    const value = variables[`${nodeId}.${outputKey}`];
    return formatValue(value);
  });
}

// 获取引用变量值（全局变量引用）
function getReferenceVariableValue({
  value,
  variables
}: {
  value: any;
  variables: Record<string, any>;
}): any {
  if (typeof value !== 'string') return value;

  // 匹配 {{variableKey}} 格式
  const regex = /\{\{([^\}]+)\}\}/g;

  return value.replace(regex, (match, key) => {
    return variables[key] ?? match;
  });
}
```

#### 4.2.2 数据类型转换

**位置**: `packages/global/core/workflow/runtime/utils.ts`

```typescript
export enum WorkflowIOValueTypeEnum {
  string = 'string',
  number = 'number',
  boolean = 'boolean',
  object = 'object',
  arrayString = 'arrayString',
  arrayNumber = 'arrayNumber',
  arrayBoolean = 'arrayBoolean',
  arrayObject = 'arrayObject',
  arrayAny = 'arrayAny',
  any = 'any',
  chatHistory = 'chatHistory',
  datasetQuote = 'datasetQuote',
  dynamic = 'dynamic',
  // ... 更多类型
}

function valueTypeFormat(
  value: any,
  type: WorkflowIOValueTypeEnum
): any {
  // 根据目标类型进行转换
  switch (type) {
    case WorkflowIOValueTypeEnum.string:
      return String(value);
    case WorkflowIOValueTypeEnum.number:
      return Number(value);
    case WorkflowIOValueTypeEnum.boolean:
      return Boolean(value);
    case WorkflowIOValueTypeEnum.object:
      return typeof value === 'object' ? value : JSON.parse(value);
    // ... 更多类型转换
  }
}
```

### 4.3 数据流转流程

```
┌─────────────────────────────────────────────────┐
│  节点 A 执行                                     │
│  ┌─────────────────────────────────┐            │
│  │ 输入: text = "Hello"            │            │
│  │ 执行: process(text)             │            │
│  │ 输出: result = "HELLO"          │            │
│  └─────────────────────────────────┘            │
│         │                                        │
│         │ 保存到 node.outputs                    │
│         ▼                                        │
│  outputs: [                                     │
│    {                                            │
│      key: 'result',                             │
│      value: 'HELLO'  ◀─── 存储在这里            │
│    }                                            │
│  ]                                              │
└─────────────────────────────────────────────────┘
                     ▼
         连接到节点 B (通过边 edge)
                     ▼
┌─────────────────────────────────────────────────┐
│  节点 B 执行前                                   │
│  ┌─────────────────────────────────┐            │
│  │ 配置的输入:                     │            │
│  │   input = "{{$nodeA.result$}}"  │            │
│  └─────────────────────────────────┘            │
│         │                                        │
│         │ 变量替换                               │
│         ▼                                        │
│  ┌─────────────────────────────────┐            │
│  │ 实际的输入:                     │            │
│  │   input = "HELLO"               │            │
│  └─────────────────────────────────┘            │
│         │                                        │
│         ▼                                        │
│  执行节点 B 的回调函数                           │
└─────────────────────────────────────────────────┘
```

### 4.4 边的状态管理

每条边都有状态生命周期：

```typescript
type EdgeStatus = 'waiting' | 'active' | 'skipped';

// 边的状态流转
waiting → active    // 源节点执行成功，数据传递
waiting → skipped   // 源节点被跳过或条件不满足
```

---

## 5. 如何拓展新的节点类型

### 5.1 完整步骤清单

拓展一个新节点需要完成以下 6 个步骤：

```
✓ 步骤 1: 定义节点类型枚举
✓ 步骤 2: 创建节点模板
✓ 步骤 3: 实现节点执行逻辑
✓ 步骤 4: 注册节点回调
✓ 步骤 5: 添加前端支持（可选）
✓ 步骤 6: 注册节点模板（必需）
```

### 5.2 详细实现步骤

#### 步骤 1: 定义节点类型枚举

**文件**: `packages/global/core/workflow/node/constant.ts`

```typescript
export enum FlowNodeTypeEnum {
  // ... 现有节点类型

  // 新增节点类型
  myCustomNode = 'myCustomNode',
}
```

#### 步骤 2: 创建节点模板

**文件**: `packages/global/core/workflow/template/system/myCustomNode.ts`

```typescript
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum,
  NodeInputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../constants';

export const MyCustomNode: FlowNodeTemplateType = {
  // 基础配置
  id: FlowNodeTypeEnum.myCustomNode,
  templateType: FlowNodeTemplateTypeEnum.tools, // ai/tools/interactive
  flowNodeType: FlowNodeTypeEnum.myCustomNode,

  // UI 配置
  showSourceHandle: true,    // 显示源连接点
  showTargetHandle: true,    // 显示目标连接点
  avatar: 'path/to/icon',    // 节点图标
  colorSchema: 'blue',       // 颜色方案

  // 显示信息
  name: '我的自定义节点',
  intro: '这是一个自定义节点的示例',

  // 输入配置
  inputs: [
    {
      key: NodeInputKeyEnum.customInput,
      renderTypeList: [FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      required: true,
      label: '输入参数',
      description: '输入参数的描述'
    },
    {
      key: 'numberParam',
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      required: false,
      label: '数字参数',
      defaultValue: 0
    }
  ],

  // 输出配置
  outputs: [
    {
      id: NodeOutputKeyEnum.customOutput,
      key: NodeOutputKeyEnum.customOutput,
      label: '输出结果',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.string
    }
  ]
};
```

#### 步骤 3: 实现节点执行逻辑

**文件**: `packages/service/core/workflow/dispatch/custom/myCustomNode.ts`

```typescript
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { type DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

// 定义输入类型
type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.customInput]: string;
  numberParam: number;
}>;

// 定义输出类型
type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.customOutput]: string;
}>;

// 节点执行函数
export const dispatchMyCustomNode = async (
  props: Record<string, any>
): Promise<Response> => {
  const {
    node,
    params: {
      system_customInput: input = '',
      numberParam = 0
    },
    variables,
    // ... 其他上下文参数
  } = props as Props;

  // 1. 参数验证
  if (!input) {
    throw new Error('输入参数不能为空');
  }

  // 2. 执行核心逻辑
  const result = await processCustomLogic(input, numberParam);

  // 3. 返回结果
  return {
    // 输出数据（会被保存到 node.outputs 中）
    data: {
      [NodeOutputKeyEnum.customOutput]: result
    },

    // 节点响应（用于调试显示）
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      customOutput: result,
      // 可以添加更多调试信息
      debugInfo: {
        inputLength: input.length,
        numberParam
      }
    }
  };
};

// 核心处理逻辑
async function processCustomLogic(
  input: string,
  numberParam: number
): Promise<string> {
  // 实现你的业务逻辑
  return `处理结果: ${input} (${numberParam})`;
}
```

#### 步骤 4: 注册节点回调

**文件**: `packages/service/core/workflow/dispatch/constants.ts`

```typescript
import { dispatchMyCustomNode } from './custom/myCustomNode';

export const callbackMap: Record<FlowNodeTypeEnum, Function> = {
  // ... 现有映射

  // 新增节点映射
  [FlowNodeTypeEnum.myCustomNode]: dispatchMyCustomNode,
};
```

#### 步骤 5: 添加前端支持（可选）

如果需要自定义前端渲染，可以在以下位置添加：

**文件**: `projects/app/src/pageComponents/app/detail/WorkflowComponents/`

```typescript
// 自定义渲染组件
export const MyCustomNodeComponent = ({ node }: { node: FlowNodeItemType }) => {
  return (
    <Box>
      {/* 自定义 UI */}
    </Box>
  );
};
```

#### 步骤 6: 注册节点模板（必需）

**文件**: `packages/global/core/workflow/template/system/index.ts`

```typescript
import { MyCustomNode } from './myCustomNode';

export const systemWorkflowTemplates = [
  // ... 现有模板
  MyCustomNode,
];
```

### 5.3 节点拓展最佳实践

#### 5.3.1 输入输出设计原则

```typescript
// ✓ 好的设计：明确的输入输出类型
inputs: [
  {
    key: 'text',
    valueType: WorkflowIOValueTypeEnum.string,
    required: true
  },
  {
    key: 'maxLength',
    valueType: WorkflowIOValueTypeEnum.number,
    defaultValue: 100
  }
]

// ✗ 避免：过于宽泛的类型
inputs: [
  {
    key: 'data',
    valueType: WorkflowIOValueTypeEnum.any  // 不推荐
  }
]
```

#### 5.3.2 错误处理

```typescript
export const dispatchMyCustomNode = async (props) => {
  try {
    // 执行逻辑
    const result = await processLogic();

    return {
      data: { result }
    };
  } catch (error) {
    // 返回错误信息
    throw new Error(`节点执行失败: ${error.message}`);
  }
};
```

#### 5.3.3 支持流式响应

```typescript
export const dispatchMyCustomNode = async (props) => {
  const { workflowStreamResponse } = props;

  // 如果支持流式响应
  if (workflowStreamResponse) {
    workflowStreamResponse({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: '流式输出的文本...'
      })
    });
  }

  return { data: {} };
};
```

---

## 6. 总结

### 6.1 核心要点

1. **节点定义**: 基于 Zod Schema 的类型系统 + 模板定义
2. **执行引擎**: 队列驱动 + 回调模式 + 并发控制（最多10个节点并发）
3. **数据流转**: 变量替换系统 + 类型转换
4. **节点拓展**: 6 步流程，清晰明确

### 6.2 拓展新节点的核心步骤

```
1. FlowNodeTypeEnum 添加类型
2. 创建节点模板 (FlowNodeTemplateType)
3. 实现执行函数 (dispatch*)
4. callbackMap 注册映射
5. (可选) 前端自定义组件
6. (必需) 注册节点模板到 systemWorkflowTemplates
```

### 6.3 关键设计特点

1. **类型安全**: 使用 Zod Schema 确保类型安全
2. **并发控制**: WorkflowQueue 实现最多10个节点并发执行
3. **回调模式**: 避免深层递归，提高执行效率
4. **变量系统**: 支持节点输出引用和全局变量引用
5. **可扩展性**: 统一的节点定义和执行接口

---

## 7. 参考文件索引

| 功能模块 | 文件路径 | 行号/说明 |
|---------|---------|---------|
| **节点类型定义** | `packages/global/core/workflow/node/constant.ts` | 全文 |
| **节点模板类型** | `packages/global/core/workflow/type/node.ts` | 116-140 |
| **节点回调映射** | `packages/service/core/workflow/dispatch/constants.ts` | 35-83 |
| **工作流执行引擎** | `packages/service/core/workflow/dispatch/index.ts` | 269-1097 |
| **变量替换系统** | `packages/global/core/workflow/runtime/utils.ts` | 656+ |
| **TextEditor 模板** | `packages/global/core/workflow/template/system/textEditor.ts` | 全文 |
| **TextEditor 执行** | `packages/service/core/workflow/dispatch/tools/textEditor.ts` | 全文 |
| **节点模板注册** | `packages/global/core/workflow/template/system/index.ts` | 导出所有系统模板 |

---

**文档版本**: 2.0
**生成日期**: 2026-03-03
**适用版本**: FastGPT v4.16.0+
