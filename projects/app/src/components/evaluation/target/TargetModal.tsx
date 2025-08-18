import React, { useEffect, useState } from 'react';
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
  Code,
  Flex
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { createTarget, updateTarget } from '@/web/core/evaluation/target';
import AppSelect from '@/components/Select/AppSelect';
import type {
  EvalTargetSchemaType,
  WorkflowConfig,
  ApiConfig,
  FunctionConfig
} from '@fastgpt/global/core/evaluation/type';

interface TargetFormType {
  name: string;
  type: 'workflow' | 'api' | 'function';
  description?: string;
  config: WorkflowConfig | ApiConfig | FunctionConfig;
}

const TargetModal: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const {
    showTargetModal,
    editingItem,
    closeTargetModal,
    addTarget,
    updateTarget: updateTargetInStore
  } = useEvaluationStore();

  const isEdit = !!editingItem;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValid }
  } = useForm<TargetFormType>({
    defaultValues: {
      name: '',
      type: 'workflow',
      description: '',
      config: {}
    }
  });

  const targetType = watch('type');

  useEffect(() => {
    if (
      editingItem &&
      'type' in editingItem &&
      'config' in editingItem &&
      (editingItem.type === 'workflow' ||
        editingItem.type === 'api' ||
        editingItem.type === 'function')
    ) {
      reset({
        name: editingItem.name,
        type: editingItem.type,
        description: editingItem.description || '',
        config: editingItem.config as WorkflowConfig | ApiConfig | FunctionConfig
      });
    } else {
      reset({
        name: '',
        type: 'workflow',
        description: '',
        config: {}
      });
    }
  }, [editingItem, reset]);

  const { runAsync: saveTarget, loading: isSaving } = useRequest2(
    async (data: TargetFormType) => {
      if (isEdit && editingItem && 'type' in editingItem && 'config' in editingItem) {
        return await updateTarget(editingItem._id, data);
      } else {
        return await createTarget(data);
      }
    },
    {
      onSuccess: (result, params) => {
        if (isEdit && editingItem && 'type' in editingItem && 'config' in editingItem) {
          updateTargetInStore(editingItem._id, result);
          toast({
            title: t('dashboard_evaluation:target_updated'),
            status: 'success'
          });
        } else {
          addTarget(result);
          toast({
            title: t('dashboard_evaluation:target_created'),
            status: 'success'
          });
        }
        handleClose();
      }
    }
  );

  const handleClose = () => {
    closeTargetModal();
    reset();
  };

  const onSubmit = async (data: TargetFormType) => {
    await saveTarget(data);
  };

  const renderConfigForm = () => {
    switch (targetType) {
      case 'workflow':
        return (
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:workflow_id')}</FormLabel>
              <AppSelect
                value={(watch('config') as WorkflowConfig)?.appId || ''}
                onSelect={(appId) => {
                  setValue('config', { appId });
                }}
              />
            </FormControl>
          </VStack>
        );

      case 'api':
        return (
          <VStack spacing={4} align="stretch">
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_url')}</FormLabel>
              <Input
                {...register('config.url', { required: targetType === 'api' })}
                placeholder="https://api.example.com/chat"
              />
            </FormControl>
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_method')}</FormLabel>
              <Select {...register('config.method')}>
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
              </Select>
            </FormControl>
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_headers')}</FormLabel>
              <Textarea
                {...register('config.headers')}
                placeholder='{"Content-Type": "application/json"}'
                rows={3}
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('common:json_format')}
              </Text>
            </FormControl>
            <FormControl>
              <FormLabel>{t('dashboard_evaluation:api_body')}</FormLabel>
              <Textarea
                {...register('config.body')}
                placeholder='{"message": "{{question}}"}'
                rows={4}
              />
              <Text fontSize="sm" color="gray.500" mt={1}>
                {t('common:support_variables')}: <Code>{'{{question}}'}</Code>,{' '}
                <Code>{'{{expectedResponse}}'}</Code>
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
                {...register('config.code', { required: targetType === 'function' })}
                placeholder={`function evaluateTarget(input) {
  // input contains: question, expectedResponse, globalVariables
  // Return: { response: string, usage?: any, responseTime?: number }
  
  return {
    response: "Your response here",
    responseTime: Date.now()
  };
}`}
                rows={12}
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
    <Modal isOpen={showTargetModal} onClose={handleClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {isEdit ? t('dashboard_evaluation:edit_target') : t('dashboard_evaluation:create_target')}
        </ModalHeader>
        <ModalBody pb={6}>
          <VStack spacing={6} align="stretch">
            {/* Basic Info */}
            <VStack spacing={4} align="stretch">
              <FormControl isInvalid={!!errors.name}>
                <FormLabel>{t('dashboard_evaluation:target_name')}</FormLabel>
                <Input
                  {...register('name', { required: true })}
                  placeholder={t('common:name_placeholder')}
                />
              </FormControl>

              <FormControl>
                <FormLabel>{t('dashboard_evaluation:target_type')}</FormLabel>
                <Select {...register('type')}>
                  <option value="workflow">{t('dashboard_evaluation:workflow_target')}</option>
                  <option value="api">{t('dashboard_evaluation:api_target')}</option>
                  <option value="function">{t('dashboard_evaluation:function_target')}</option>
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

            {/* Target Configuration */}
            <Box>
              <Text fontSize="md" fontWeight="medium" mb={4}>
                {t('dashboard_evaluation:target_config')}
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

export default TargetModal;
