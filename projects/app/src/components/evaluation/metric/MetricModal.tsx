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
  Select,
  Textarea,
  VStack,
  HStack,
  Text,
  Divider,
  Code
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { createMetric, updateMetric } from '@/web/core/evaluation/metric';
import AIModelSelector from '@/components/Select/AIModelSelector';
import type {
  HttpConfig,
  FunctionConfig,
  AiModelConfig
} from '@fastgpt/global/core/evaluation/type';

interface MetricFormType {
  name: string;
  type: 'http' | 'function' | 'ai_model';
  description?: string;
  config: HttpConfig | FunctionConfig | AiModelConfig;
}

const MetricModal: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { llmModelList } = useSystemStore();

  const {
    showMetricModal,
    editingItem,
    closeMetricModal,
    addMetric,
    updateMetric: updateMetricInStore
  } = useEvaluationStore();

  const isEdit = !!editingItem;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<MetricFormType>({
    defaultValues: {
      name: '',
      type: 'ai_model',
      description: '',
      config: {}
    }
  });

  const metricType = watch('type');

  useEffect(() => {
    if (
      editingItem &&
      'type' in editingItem &&
      'config' in editingItem &&
      (editingItem.type === 'http' ||
        editingItem.type === 'function' ||
        editingItem.type === 'ai_model')
    ) {
      reset({
        name: editingItem.name,
        type: editingItem.type,
        description: editingItem.description || '',
        config: editingItem.config as HttpConfig | FunctionConfig | AiModelConfig
      });
    } else {
      reset({
        name: '',
        type: 'ai_model',
        description: '',
        config: {}
      });
    }
  }, [editingItem, reset]);

  const { runAsync: saveMetric, loading: isSaving } = useRequest2(
    async (data: MetricFormType) => {
      if (isEdit) {
        return await updateMetric(editingItem._id, data);
      } else {
        return await createMetric(data);
      }
    },
    {
      onSuccess: (result) => {
        if (isEdit) {
          updateMetricInStore(editingItem._id, result);
          toast({
            title: t('dashboard_evaluation:metric_updated'),
            status: 'success'
          });
        } else {
          addMetric(result);
          toast({
            title: t('dashboard_evaluation:metric_created'),
            status: 'success'
          });
        }
        handleClose();
      }
    }
  );

  const handleClose = () => {
    closeMetricModal();
    reset();
  };

  const onSubmit = async (data: MetricFormType) => {
    await saveMetric(data);
  };

  const renderConfigForm = () => {
    switch (metricType) {
      case 'ai_model':
        return (
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:ai_model')}</FormLabel>
              <AIModelSelector
                value={(watch('config') as AiModelConfig)?.model || ''}
                list={llmModelList.map((item) => ({
                  label: item.name,
                  value: item.model
                }))}
                onChange={(model) => {
                  setValue('config', {
                    ...(watch('config') as AiModelConfig),
                    model
                  });
                }}
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:evaluation_prompt')}</FormLabel>
              <Textarea
                {...register('config.prompt')}
                placeholder={`Please evaluate the quality of the following response:

Question: {{question}}
Expected Answer: {{expectedResponse}}
Actual Answer: {{response}}

Please provide a score from 0 to 1 based on accuracy and relevance.`}
                rows={8}
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('common:support_variables')}: <Code>{'{{question}}'}</Code>,{' '}
                <Code>{'{{expectedResponse}}'}</Code>, <Code>{'{{response}}'}</Code>
              </Text>
            </FormControl>
          </VStack>
        );

      case 'http':
        return (
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_url')}</FormLabel>
              <Input
                {...register('config.url', { required: metricType === 'http' })}
                placeholder="https://api.example.com/evaluate"
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_method')}</FormLabel>
              <Select {...register('config.method')}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_headers')}</FormLabel>
              <Textarea
                {...register('config.headers')}
                placeholder='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_TOKEN"}'
                rows={3}
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('common:json_format')}
              </Text>
            </FormControl>
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_body')}</FormLabel>
              <Textarea
                {...register('config.body' as any)}
                placeholder='{"input": "{{question}}", "output": "{{response}}", "expected": "{{expectedResponse}}"}'
                rows={4}
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('common:support_variables')}: <Code>{'{{question}}'}</Code>,{' '}
                <Code>{'{{expectedResponse}}'}</Code>, <Code>{'{{response}}'}</Code>
              </Text>
            </FormControl>
          </VStack>
        );

      case 'function':
        return (
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:function_code')}</FormLabel>
              <Textarea
                {...register('config.code', { required: metricType === 'function' })}
                placeholder={`function evaluateMetric(input, output) {
  // input contains: question, expectedResponse, globalVariables
  // output contains: response, usage, responseTime
  // Return: { score: number (0-1), reasoning?: string }
  
  const similarity = calculateSimilarity(output.response, input.expectedResponse);
  
  return {
    score: similarity,
    reasoning: "Response matches expected answer with " + (similarity * 100).toFixed(1) + "% similarity"
  };
}

function calculateSimilarity(actual, expected) {
  // Simple similarity calculation
  if (!actual || !expected) return 0;
  
  const actualLower = actual.toLowerCase().trim();
  const expectedLower = expected.toLowerCase().trim();
  
  if (actualLower === expectedLower) return 1;
  
  // Basic word overlap calculation
  const actualWords = actualLower.split(/\s+/);
  const expectedWords = expectedLower.split(/\s+/);
  
  const intersection = actualWords.filter(word => expectedWords.includes(word));
  const union = [...new Set([...actualWords, ...expectedWords])];
  
  return intersection.length / union.length;
}`}
                rows={20}
                fontFamily="mono"
                fontSize="sm"
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('common:javascript_function')}
              </Text>
            </FormControl>
          </VStack>
        );

      default:
        return null;
    }
  };

  return (
    <Modal isOpen={showMetricModal} onClose={handleClose} size="2xl">
      <ModalOverlay />
      <ModalContent maxH="90vh">
        <ModalHeader>
          {isEdit ? t('dashboard_evaluation:edit_metric') : t('dashboard_evaluation:create_metric')}
        </ModalHeader>
        <ModalBody pb={6} overflowY="auto">
          <VStack spacing={6} align="stretch">
            {/* Basic Info */}
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.name}>
                <FormLabel>{t('dashboard_evaluation:metric_name')}</FormLabel>
                <Input
                  {...register('name', { required: true })}
                  placeholder={t('common:name_placeholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t('dashboard_evaluation:metric_type')}</FormLabel>
                <Select {...register('type')}>
                  <option value="ai_model">{t('dashboard_evaluation:ai_model_metric')}</option>
                  <option value="http">{t('dashboard_evaluation:http_metric')}</option>
                  <option value="function">{t('dashboard_evaluation:function_metric')}</option>
                </Select>
              </FormControl>

              <FormControl>
                <FormLabel>{t('common:description')}</FormLabel>
                <Textarea
                  {...register('description')}
                  placeholder={t('common:description_placeholder')}
                  rows={3}
                />
              </FormControl>
            </VStack>

            <Divider />

            {/* Metric Configuration */}
            <Box>
              <Text fontSize="md" fontWeight="medium" mb={4}>
                {t('dashboard_evaluation:metric_config')}
              </Text>
              {renderConfigForm()}
            </Box>

            {/* Actions */}
            <HStack justify="flex-end" pt={4}>
              <Button variant="ghost" onClick={handleClose}>
                {t('common:cancel')}
              </Button>
              <Button onClick={handleSubmit(onSubmit)} isLoading={isSaving} isDisabled={!isValid}>
                {t('common:save')}
              </Button>
            </HStack>
          </VStack>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default MetricModal;
