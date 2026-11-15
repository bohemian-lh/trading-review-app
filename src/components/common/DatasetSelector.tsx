import React from 'react';
import { Folder, Plus } from 'lucide-react';
import { useDatasetStore } from '@/stores';
import { switchDataset } from '@/hooks/useStoreSync';

export const DatasetSelector: React.FC = () => {
  const datasets = useDatasetStore(s => s.datasets);
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);
  const createDataset = useDatasetStore(s => s.createDataset);

  const handleCreate = async () => {
    const name = prompt('请输入数据集名称：');
    if (!name?.trim()) return;
    const dataset = await createDataset(name.trim());
    if (dataset) {
      await switchDataset(dataset.id);
    }
  };

  if (datasets.length === 0 && !currentDatasetId) {
    return (
      <button onClick={handleCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 text-sm">
        <Plus className="h-3.5 w-3.5" />
        创建数据集
      </button>
    );
  }

  // 删除数据集属于高危操作，不提供前端入口：需在数据库里标记 deleted_at 后走管理端点清理
  return (
    <div className="flex items-center gap-2">
      <Folder className="h-4 w-4 text-gray-400" />
      <select
        value={currentDatasetId || ''}
        onChange={e => { if (e.target.value) switchDataset(e.target.value); }}
        className="text-sm border rounded-lg px-2 py-1.5 bg-white"
      >
        {datasets.map(d => (
          <option key={d.id} value={d.id}>{d.name}</option>
        ))}
      </select>
      <button onClick={handleCreate} className="p-1.5 hover:bg-gray-100 rounded text-gray-500" title="新建数据集">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
};
