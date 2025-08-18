import React, { useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  Textarea,
  VStack,
  HStack,
  Text,
  Divider,
  Checkbox,
  CheckboxGroup,
  SimpleGrid
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { createEvaluation, startEvaluation } from '@/web/core/evaluation/task';
import type { CreateEvaluationParams as TaskFormType } from '@fastgpt/global/core/evaluation/type';

const TaskCreateModal: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    datasets,
    targets,
    metrics,
    showTaskModal,
    closeTaskModal,
    addTask,
    selectedDatasetId,
    selectedTargetId,
    selectedMetricIds,
    setSelectedDatasetId,
    setSelectedTargetId,
    setSelectedMetricIds
  } = useEvaluationStore();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<TaskFormType>({
    defaultValues: {
      name: '',
      description: '',
      datasetId: selectedDatasetId,
      targetId: selectedTargetId,
      metricIds: selectedMetricIds
    }
  });

  const datasetId = watch('datasetId');
  const targetId = watch('targetId');
  const metricIds = watch('metricIds') || [];

  useEffect(() => {
    setValue('datasetId', selectedDatasetId);
    setValue('targetId', selectedTargetId);
    setValue('metricIds', selectedMetricIds);
  }, [selectedDatasetId, selectedTargetId, selectedMetricIds, setValue]);

  const { runAsync: createEvaluationTask, loading: isCreating } = useRequest2(
    async (data: TaskFormType) => {
      const params = {
        name: data.name,
        description: data.description,
        datasetId: data.datasetId,
        targetId: data.targetId,
        metricIds: data.metricIds
      };

      // 创建评估任务
      const evaluation = await createEvaluation(params);

      // 立即启动评估任务
      await startEvaluation(evaluation._id);

      return evaluation;
    },
    {
      onSuccess: (result) => {
        addTask(result as any);
        toast({
          title: t('dashboard_evaluation:evaluation_created_and_started'),
          status: 'success'
        });
        handleClose();
      },
      onError: (error) => {
        toast({
          title: t('dashboard_evaluation:evaluation_creation_failed'),
          description: error.message,
          status: 'error'
        });
      }
    }
  );

  const handleClose = () => {
    closeTaskModal();
    reset();
  };

  const onSubmit = async (data: TaskFormType) => {
    // Update store selections
    setSelectedDatasetId(data.datasetId);
    setSelectedTargetId(data.targetId);
    setSelectedMetricIds(data.metricIds);

    await createEvaluationTask(data);
  };

  const selectedDataset = datasets.find((d) => d._id === datasetId);
  const selectedTarget = targets.find((t) => t._id === targetId);
  const selectedMetrics = metrics.filter((m) => metricIds.includes(m._id));

  return (
    <Modal isOpen={showTaskModal} onClose={handleClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{t('dashboard_evaluation:create_evaluation')}</ModalHeader>
        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Basic Info */}
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.name}>
                <FormLabel>{t('dashboard_evaluation:evaluation_name')}</FormLabel>
                <Input
                  {...register('name', { required: true })}
                  placeholder={t('dashboard_evaluation:Task_name_placeholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t('dashboard_evaluation:evaluation_description')}</FormLabel>
                <Textarea
                  {...register('description')}
                  placeholder={t('common:description_placeholder')}
                  rows={3}
                />
              </FormControl>
            </VStack>

            <Divider />

            {/* Dataset Selection */}
            <FormControl isInvalid={!!errors.datasetId}>
              <FormLabel>{t('dashboard_evaluation:select_dataset')}</FormLabel>
              <SimpleGrid columns={1} spacing={2}>
                {datasets.map((dataset) => (
                  <Box
                    key={dataset._id}
                    p={3}
                    border="2px"
                    borderColor={datasetId === dataset._id ? 'primary.500' : 'gray.200'}
                    borderRadius="md"
                    cursor="pointer"
                    bg={datasetId === dataset._id ? 'primary.50' : 'white'}
                    onClick={() => setValue('datasetId', dataset._id)}
                    _hover={{ borderColor: 'primary.300' }}
                  >
                    <Text fontWeight="medium">{dataset.name}</Text>
                    <Text fontSize="sm" color="gray.600" noOfLines={1}>
                      {dataset.description}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                      {dataset.columns?.length || 0} columns, {dataset.dataItems?.length || 0} items
                    </Text>
                  </Box>
                ))}
              </SimpleGrid>
              {datasets.length === 0 && (
                <Text color="gray.500" textAlign="center" py={4}>
                  {t('dashboard_evaluation:no_data')}
                </Text>
              )}
            </FormControl>

            <Divider />

            {/* Target Selection */}
            <FormControl isInvalid={!!errors.targetId}>
              <FormLabel>{t('dashboard_evaluation:select_target')}</FormLabel>
              <SimpleGrid columns={1} spacing={2}>
                {targets.map((target) => (
                  <Box
                    key={target._id}
                    p={3}
                    border="2px"
                    borderColor={targetId === target._id ? 'primary.500' : 'gray.200'}
                    borderRadius="md"
                    cursor="pointer"
                    bg={targetId === target._id ? 'primary.50' : 'white'}
                    onClick={() => setValue('targetId', target._id)}
                    _hover={{ borderColor: 'primary.300' }}
                  >
                    <HStack justify="space-between">
                      <Box>
                        <Text fontWeight="medium">{target.name}</Text>
                        <Text fontSize="sm" color="gray.600" noOfLines={1}>
                          {target.description}
                        </Text>
                      </Box>
                      <Text
                        fontSize="sm"
                        px={2}
                        py={1}
                        bg="gray.100"
                        rounded="md"
                        fontWeight="medium"
                      >
                        {target.type}
                      </Text>
                    </HStack>
                  </Box>
                ))}
              </SimpleGrid>
              {targets.length === 0 && (
                <Text color="gray.500" textAlign="center" py={4}>
                  {t('dashboard_evaluation:no_data')}
                </Text>
              )}
            </FormControl>

            <Divider />

            {/* Metrics Selection */}
            <FormControl isInvalid={!!errors.metricIds}>
              <FormLabel>{t('dashboard_evaluation:select_metrics')}</FormLabel>
              <CheckboxGroup
                value={metricIds}
                onChange={(values) => setValue('metricIds', values as string[])}
              >
                <SimpleGrid columns={1} spacing={2}>
                  {metrics.map((metric) => (
                    <Checkbox
                      key={metric._id}
                      value={metric._id}
                      p={3}
                      border="1px"
                      borderColor="gray.200"
                      borderRadius="md"
                      _checked={{
                        borderColor: 'primary.500',
                        bg: 'primary.50'
                      }}
                    >
                      <Box>
                        <Text fontWeight="medium">{metric.name}</Text>
                        <Text fontSize="sm" color="gray.600" noOfLines={1}>
                          {metric.description}
                        </Text>
                        <Text fontSize="sm" color="gray.500" fontWeight="medium">
                          {metric.type}
                        </Text>
                      </Box>
                    </Checkbox>
                  ))}
                </SimpleGrid>
              </CheckboxGroup>
              {metrics.length === 0 && (
                <Text color="gray.500" textAlign="center" py={4}>
                  {t('dashboard_evaluation:no_data')}
                </Text>
              )}
            </FormControl>

            {/* Summary */}
            {selectedDataset && selectedTarget && selectedMetrics.length > 0 && (
              <>
                <Divider />
                <Box p={4} bg="gray.50" borderRadius="md">
                  <Text fontWeight="medium" mb={3}>
                    {t('common:summary')}
                  </Text>
                  <VStack align="stretch" spacing={2} fontSize="sm">
                    <HStack>
                      <Text minW="100px" color="gray.600">
                        {t('dashboard_evaluation:datasets')}:
                      </Text>
                      <Text>{selectedDataset.name}</Text>
                    </HStack>
                    <HStack>
                      <Text minW="100px" color="gray.600">
                        {t('dashboard_evaluation:targets')}:
                      </Text>
                      <Text>{selectedTarget.name}</Text>
                    </HStack>
                    <HStack>
                      <Text minW="100px" color="gray.600">
                        {t('dashboard_evaluation:metrics')}:
                      </Text>
                      <Text>{selectedMetrics.map((m) => m.name).join(', ')}</Text>
                    </HStack>
                  </VStack>
                </Box>
              </>
            )}

            {/* Actions */}
            <HStack justify="flex-end" pt={4}>
              <Button variant="ghost" onClick={handleClose}>
                {t('common:cancel')}
              </Button>
              <Button
                onClick={handleSubmit(onSubmit)}
                isLoading={isCreating}
                isDisabled={!isValid || !datasetId || !targetId || metricIds.length === 0}
              >
                {t('dashboard_evaluation:create_and_start_evaluation')}
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default TaskCreateModal;
