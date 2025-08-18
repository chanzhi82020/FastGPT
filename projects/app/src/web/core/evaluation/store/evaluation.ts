import { create, devtools, immer } from '@fastgpt/web/common/zustand';
import type {
  EvalDatasetSchemaType,
  EvalTargetSchemaType,
  EvalMetricSchemaType,
  evaluationType
} from '@fastgpt/global/core/evaluation/type';

export interface EvaluationState {
  // Data
  datasets: EvalDatasetSchemaType[];
  targets: EvalTargetSchemaType[];
  metrics: EvalMetricSchemaType[];
  tasks: evaluationType[];

  // UI State
  loading: {
    datasets: boolean;
    targets: boolean;
    metrics: boolean;
    tasks: boolean;
  };

  // Selected items for task creation
  selectedDatasetId: string;
  selectedTargetId: string;
  selectedMetricIds: string[];

  // Modal states
  showDatasetModal: boolean;
  showTargetModal: boolean;
  showMetricModal: boolean;
  showTaskModal: boolean;
  editingItem:
    | EvalDatasetSchemaType
    | EvalTargetSchemaType
    | EvalMetricSchemaType
    | evaluationType
    | null;
}

export interface EvaluationActions {
  // Dataset actions
  setDatasets: (datasets: EvalDatasetSchemaType[]) => void;
  addDataset: (dataset: EvalDatasetSchemaType) => void;
  updateDataset: (id: string, dataset: Partial<EvalDatasetSchemaType>) => void;
  removeDataset: (id: string) => void;

  // Target actions
  setTargets: (targets: EvalTargetSchemaType[]) => void;
  addTarget: (target: EvalTargetSchemaType) => void;
  updateTarget: (id: string, target: Partial<EvalTargetSchemaType>) => void;
  removeTarget: (id: string) => void;

  // Metric actions
  setMetrics: (metrics: EvalMetricSchemaType[]) => void;
  addMetric: (metric: EvalMetricSchemaType) => void;
  updateMetric: (id: string, metric: Partial<EvalMetricSchemaType>) => void;
  removeMetric: (id: string) => void;

  // Task actions
  setTasks: (tasks: evaluationType[]) => void;
  addTask: (task: evaluationType) => void;
  updateTask: (id: string, task: Partial<evaluationType>) => void;
  removeTask: (id: string) => void;

  // Selection actions
  setSelectedDatasetId: (id: string) => void;
  setSelectedTargetId: (id: string) => void;
  setSelectedMetricIds: (ids: string[]) => void;
  clearSelections: () => void;

  // Loading actions
  setLoading: (key: keyof EvaluationState['loading'], loading: boolean) => void;

  // Modal actions
  openDatasetModal: (item?: EvalDatasetSchemaType) => void;
  closeDatasetModal: () => void;
  openTargetModal: (item?: EvalTargetSchemaType) => void;
  closeTargetModal: () => void;
  openMetricModal: (item?: EvalMetricSchemaType) => void;
  closeMetricModal: () => void;
  openTaskModal: (item?: evaluationType) => void;
  closeTaskModal: () => void;
}

export const useEvaluationStore = create<EvaluationState & EvaluationActions>()(
  devtools(
    immer((set: (fn: (state: EvaluationState & EvaluationActions) => void) => void) => ({
      // Initial state
      datasets: [],
      targets: [],
      metrics: [],
      tasks: [],
      loading: {
        datasets: false,
        targets: false,
        metrics: false,
        tasks: false
      },
      selectedDatasetId: '',
      selectedTargetId: '',
      selectedMetricIds: [],
      showDatasetModal: false,
      showTargetModal: false,
      showMetricModal: false,
      showTaskModal: false,
      editingItem: null,

      // Dataset actions
      setDatasets: (datasets: EvalDatasetSchemaType[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.datasets = datasets;
        }),

      addDataset: (dataset: EvalDatasetSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.datasets.push(dataset);
        }),

      updateDataset: (id: string, dataset: Partial<EvalDatasetSchemaType>) =>
        set((state: EvaluationState & EvaluationActions) => {
          const index = state.datasets.findIndex((item: EvalDatasetSchemaType) => item._id === id);
          if (index !== -1) {
            state.datasets[index] = { ...state.datasets[index], ...dataset };
          }
        }),

      removeDataset: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.datasets = state.datasets.filter((item: EvalDatasetSchemaType) => item._id !== id);
        }),

      // Target actions
      setTargets: (targets: EvalTargetSchemaType[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.targets = targets;
        }),

      addTarget: (target: EvalTargetSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.targets.push(target);
        }),

      updateTarget: (id: string, target: Partial<EvalTargetSchemaType>) =>
        set((state: EvaluationState & EvaluationActions) => {
          const index = state.targets.findIndex((item: EvalTargetSchemaType) => item._id === id);
          if (index !== -1) {
            state.targets[index] = { ...state.targets[index], ...target };
          }
        }),

      removeTarget: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.targets = state.targets.filter((item: EvalTargetSchemaType) => item._id !== id);
        }),

      // Metric actions
      setMetrics: (metrics: EvalMetricSchemaType[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.metrics = metrics;
        }),

      addMetric: (metric: EvalMetricSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.metrics.push(metric);
        }),

      updateMetric: (id: string, metric: Partial<EvalMetricSchemaType>) =>
        set((state: EvaluationState & EvaluationActions) => {
          const index = state.metrics.findIndex((item: EvalMetricSchemaType) => item._id === id);
          if (index !== -1) {
            state.metrics[index] = { ...state.metrics[index], ...metric };
          }
        }),

      removeMetric: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.metrics = state.metrics.filter((item: EvalMetricSchemaType) => item._id !== id);
        }),

      // Task actions
      setTasks: (tasks: evaluationType[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.tasks = tasks;
        }),

      addTask: (task: evaluationType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.tasks.push(task);
        }),

      updateTask: (id: string, task: Partial<evaluationType>) =>
        set((state: EvaluationState & EvaluationActions) => {
          const index = state.tasks.findIndex((item: evaluationType) => item._id === id);
          if (index !== -1) {
            state.tasks[index] = { ...state.tasks[index], ...task };
          }
        }),

      removeTask: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.tasks = state.tasks.filter((item: evaluationType) => item._id !== id);
        }),

      // Selection actions
      setSelectedDatasetId: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.selectedDatasetId = id;
        }),

      setSelectedTargetId: (id: string) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.selectedTargetId = id;
        }),

      setSelectedMetricIds: (ids: string[]) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.selectedMetricIds = ids;
        }),

      clearSelections: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.selectedDatasetId = '';
          state.selectedTargetId = '';
          state.selectedMetricIds = [];
        }),

      // Loading actions
      setLoading: (key: keyof EvaluationState['loading'], loading: boolean) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.loading[key] = loading;
        }),

      // Modal actions
      openDatasetModal: (item?: EvalDatasetSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showDatasetModal = true;
          state.editingItem = item || null;
        }),

      closeDatasetModal: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showDatasetModal = false;
          state.editingItem = null;
        }),

      openTargetModal: (item?: EvalTargetSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showTargetModal = true;
          state.editingItem = item || null;
        }),

      closeTargetModal: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showTargetModal = false;
          state.editingItem = null;
        }),

      openMetricModal: (item?: EvalMetricSchemaType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showMetricModal = true;
          state.editingItem = item || null;
        }),

      closeMetricModal: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showMetricModal = false;
          state.editingItem = null;
        }),

      openTaskModal: (item?: evaluationType) =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showTaskModal = true;
          state.editingItem = item || null;
        }),

      closeTaskModal: () =>
        set((state: EvaluationState & EvaluationActions) => {
          state.showTaskModal = false;
          state.editingItem = null;
        })
    })),
    { name: 'evaluation-store' }
  )
);
