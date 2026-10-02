import React, { useState } from 'react';
import type { AnalysisTab } from '@/types';
import { generateId } from '@/utils';
import { SeriesFormModal } from './SeriesFormModal';

interface CreateAnalysisTabModalProps {
  onClose: () => void;
  onSave: (tab: AnalysisTab) => void;
}

export const CreateAnalysisTabModal: React.FC<CreateAnalysisTabModalProps> = ({ onClose, onSave }) => {
  const [name, setName] = useState('');

  return (
    <SeriesFormModal
      title="新增分析页签"
      nameLabel="页签名称"
      namePlaceholder="例如：齐飞水底-系统"
      name={name}
      onNameChange={setName}
      onClose={onClose}
      onSave={(groups) => onSave({
        id: generateId(),
        name: name.trim() || '未命名页签',
        groups,
        createdAt: Date.now(),
      })}
    />
  );
};
