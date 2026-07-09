import React from 'react';
import { X } from 'lucide-react';
import type { JournalStrategyGroup } from '@/types';

interface Props {
  group: JournalStrategyGroup;
  selectedIds: string[];
  onToggleStrategy: (strategyId: string) => void;
}

export const StrategyCard: React.FC<Props> = ({ group, selectedIds, onToggleStrategy }) => {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{group.groupName}</h4>
      <div className="flex flex-wrap gap-2">
        {group.strategies.map(s => {
          const selected = selectedIds.includes(s.strategyId);
          return (
            <button
              key={s.strategyId}
              onClick={() => onToggleStrategy(s.strategyId)}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm transition-colors ${
                selected
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
              }`}
            >
              {selected && <X className="h-3 w-3" />}
              {s.text}
            </button>
          );
        })}
        {group.strategies.length === 0 && (
          <span className="text-xs text-gray-400 italic">暂无策略，请在字段配置中添加</span>
        )}
      </div>
    </div>
  );
};
