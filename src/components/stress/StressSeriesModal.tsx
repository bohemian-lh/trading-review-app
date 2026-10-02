import React, { useState } from 'react';
import type { StressSeries } from '@/types';
import { generateId } from '@/utils';
import { SeriesFormModal } from '@/components/analysis/SeriesFormModal';

interface StressSeriesModalProps {
  editing: StressSeries | null;
  onClose: () => void;
  onSave: (series: StressSeries) => void;
}

export const StressSeriesModal: React.FC<StressSeriesModalProps> = ({ editing, onClose, onSave }) => {
  const [name, setName] = useState(editing?.name ?? '');

  return (
    <SeriesFormModal
      title={editing ? '编辑对比系列' : '新增对比系列'}
      nameLabel="系列名称"
      namePlaceholder="例如：齐飞水底-系统"
      name={name}
      onNameChange={setName}
      initialGroups={editing?.groups}
      onClose={onClose}
      onSave={(groups) => onSave({
        id: editing?.id ?? generateId(),
        name: name.trim() || '未命名系列',
        groups,
        createdAt: editing?.createdAt ?? Date.now(),
      })}
    />
  );
};
