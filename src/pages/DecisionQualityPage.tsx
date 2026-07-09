import React, { useState, useEffect } from 'react';
import { useRecordsStore } from '@/stores';
import type { DecisionCheckItem } from '@/types';

const STORAGE_KEY = 'decision_check_states';

const DEFAULT_CHECKLIST: DecisionCheckItem[] = [
  { id: 'd1', label: '大盘情况', question: '大盘是否在关键点位', checked: false },
  { id: 'd2', label: '', question: '是否已经表现很差', checked: false },
  { id: 'd3', label: '', question: '是否有黑天鹅事件', checked: false },
  { id: 'd4', label: '决策参考', question: '全部尾盘', checked: false, colSpan: 2 },
  { id: 'd4b', label: '', question: '一半尾盘', checked: false },
  { id: 'd5', label: '标的', question: '是否齐飞水底', checked: false },
  { id: 'd6', label: '', question: '明显水底缩量且深坑', checked: false },
  { id: 'd7', label: '', question: '是否找不到不开仓的理由', checked: false },
  { id: 'd8', label: '最终决策', question: '深坑一半等午后 / 3/4等午后 / 等午后', checked: false },
  { id: 'd9', label: '标的', question: '是否一致', checked: false },
  { id: 'd10', label: '', question: '是否找不到不开仓的理由', checked: false },
  { id: 'd11', label: '', question: '午后：关键点位入一半', checked: false },
];

export const DecisionQualityPage: React.FC = () => {
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  const items: DecisionCheckItem[] = fieldConfig.decisionChecklist?.length
    ? fieldConfig.decisionChecklist
    : DEFAULT_CHECKLIST;

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
        <h1 className="text-2xl font-bold text-gray-900">对赌决策质量控制表</h1>
        <p className="text-sm text-gray-500 mt-1">
          对赌决策质量检查清单，勾选符合的条件（内容可在字段配置中编辑）
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border border-gray-200 rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b w-24">分类</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700 border-b" colSpan={2}>判断项</th>
              <th className="px-4 py-3 text-center text-sm font-semibold text-gray-700 border-b w-20">检查</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const checked = checkedMap[item.id] || false;
              return (
                <tr
                  key={item.id}
                  className={`border-b hover:bg-gray-50 transition-colors ${checked ? 'bg-red-50' : ''}`}
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-700 border-r bg-gray-50">
                    {item.label}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900" colSpan={item.colSpan || 2}>
                    {item.question}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleCheck(item.id)}
                      className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                        checked
                          ? 'bg-red-500 border-red-500 text-white'
                          : 'border-gray-300 hover:border-red-400'
                      }`}
                    >
                      {checked && (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DecisionQualityPage;
