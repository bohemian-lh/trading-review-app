import React, { useState, useEffect } from 'react';
import { useRecordsStore } from '@/stores';
import type { MindsetRow } from '@/types';
import { DEFAULT_MINDSET_ROWS } from '@/types';

const STORAGE_KEY = 'mindset_check_states';

export const MindsetManagementPage: React.FC = () => {
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  // 从 fieldConfig 获取表数据，如无则用默认值
  const rows: MindsetRow[] = fieldConfig.mindsetTable?.length
    ? fieldConfig.mindsetTable
    : DEFAULT_MINDSET_ROWS;

  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(checkedMap));
  }, [checkedMap]);

  const toggleCheck = (id: string) => {
    setCheckedMap(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">心态管理和策略</h1>
        <p className="text-sm text-gray-500 mt-1">
          评估当前心态状态，勾选符合的等级（内容可在字段配置中编辑）
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">等级</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">现象</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b">策略</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b w-24">勾选</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.id}
                className={`border-b hover:bg-gray-50 transition-colors ${
                  checkedMap[row.id] ? 'bg-red-50' : ''
                }`}
              >
                <td className="px-4 py-3 text-sm text-gray-900">{row.level}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.phenomenon}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.strategy}</td>
                <td className="px-4 py-3 text-center">
                  <button
                    onClick={() => toggleCheck(row.id)}
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                      checkedMap[row.id]
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'border-gray-300 hover:border-red-400'
                    }`}
                  >
                    {checkedMap[row.id] && (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MindsetManagementPage;
