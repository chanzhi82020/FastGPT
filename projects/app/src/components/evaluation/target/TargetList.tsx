import React, { useEffect } from 'react';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Text,
  Badge,
  HStack
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
import { useEvaluationStore } from '@/web/core/evaluation/store/evaluation';
import { getTargetList, deleteTarget, testTarget } from '@/web/core/evaluation/target';
import type { EvalTargetSchemaType } from '@fastgpt/global/core/evaluation/type';
import { useToast } from '@fastgpt/web/hooks/useToast';

interface TargetListProps {
  searchKey: string;
  onSearchChange: (value: string) => void;
}

const getTargetTypeColor = (type: string) => {
  switch (type) {
    case 'workflow':
      return 'blue';
    case 'api':
      return 'green';
    case 'function':
      return 'purple';
    default:
      return 'gray';
  }
};

const getTargetTypeName = (type: string, t: any) => {
  switch (type) {
    case 'workflow':
      return t('dashboard_evaluation:workflow_target');
    case 'api':
      return t('dashboard_evaluation:api_target');
    case 'function':
      return t('dashboard_evaluation:function_target');
    default:
      return type;
  }
};

const TargetList: React.FC<TargetListProps> = ({ searchKey, onSearchChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { targets, setTargets, removeTarget, openTargetModal } = useEvaluationStore();

  const {
    data: targetList,
    Pagination,
    getData: fetchData,
    total,
    pageSize
  } = usePagination(
    (params) =>
      getTargetList({
        ...params,
        searchKey
      }),
    {
      defaultPageSize: 20,
      params: {},
      refreshDeps: [searchKey]
    }
  );

  useEffect(() => {
    if (targetList) {
      setTargets(targetList);
    }
  }, [targetList, setTargets]);

  const { runAsync: onDeleteTarget } = useRequest2(deleteTarget, {
    onSuccess: (_, [targetId]) => {
      removeTarget(targetId);
      fetchData();
      toast({
        title: t('dashboard_evaluation:target_deleted'),
        status: 'success'
      });
    }
  });

  const { runAsync: onTestTarget, loading: isTestingTarget } = useRequest2(testTarget, {
    onSuccess: () => {
      toast({
        title: t('common:test_success'),
        status: 'success'
      });
    }
  });

  const handleEdit = (target: EvalTargetSchemaType) => {
    openTargetModal(target);
  };

  const handleDelete = (targetId: string) => {
    onDeleteTarget(targetId);
  };

  const handleTest = (targetId: string) => {
    onTestTarget({ targetId, testInput: { question: 'test', expectedResponse: 'test' } });
  };

  return (
    <Box>
      {/* Header */}
      <Flex justifyContent="space-between" alignItems="center" mb={4}>
        <Text fontSize="lg" fontWeight="medium">
          {t('dashboard_evaluation:targets')}
        </Text>
        <Flex gap={2}>
          <SearchInput
            placeholder={t('common:search')}
            value={searchKey}
            onChange={(e) => onSearchChange(e.target.value)}
            maxW="300px"
          />
          <Button
            leftIcon={<MyIcon name="common/addLight" w={4} />}
            onClick={() => openTargetModal()}
          >
            {t('dashboard_evaluation:create_target')}
          </Button>
        </Flex>
      </Flex>

      {/* Table */}
      <TableContainer>
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>{t('dashboard_evaluation:target_name')}</Th>
              <Th>{t('dashboard_evaluation:target_type')}</Th>
              <Th>{t('common:description')}</Th>
              <Th>{t('common:createTime')}</Th>
              <Th>{t('dashboard_evaluation:Action')}</Th>
            </Tr>
          </Thead>
          <Tbody>
            {targets.map((target: EvalTargetSchemaType) => (
              <Tr key={target._id}>
                <Td fontWeight="medium">{target.name}</Td>
                <Td>
                  <Badge colorScheme={getTargetTypeColor(target.type)} variant="subtle">
                    {getTargetTypeName(target.type, t)}
                  </Badge>
                </Td>
                <Td color="gray.600" maxW="200px" noOfLines={2}>
                  {target.description || '-'}
                </Td>
                <Td color="gray.600" fontSize="sm">
                  {formatTime2YMDHM(target.createTime)}
                </Td>
                <Td>
                  <HStack spacing={2}>
                    <IconButton
                      aria-label="test"
                      size="sm"
                      variant="ghost"
                      colorScheme="blue"
                      icon={<MyIcon name="common/playFill" w={4} />}
                      onClick={() => handleTest(target._id)}
                      isLoading={isTestingTarget}
                    />
                    <IconButton
                      aria-label="edit"
                      size="sm"
                      variant="ghost"
                      icon={<MyIcon name="edit" w={4} />}
                      onClick={() => handleEdit(target)}
                    />
                    <PopoverConfirm
                      type="delete"
                      Trigger={
                        <IconButton
                          aria-label="delete"
                          size="sm"
                          variant="ghost"
                          colorScheme="red"
                          icon={<MyIcon name="delete" w={4} />}
                        />
                      }
                      content={t('dashboard_evaluation:confirm_delete_target')}
                      onConfirm={() => handleDelete(target._id)}
                    />
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {targets.length === 0 && <EmptyTip text={t('dashboard_evaluation:no_data')} />}

      {total > pageSize && (
        <Flex mt={4} justifyContent="center">
          <Pagination />
        </Flex>
      )}
    </Box>
  );
};

export default TargetList;
