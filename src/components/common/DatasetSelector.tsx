import React from 'react';
import { Folder, Plus, Trash2 } from 'lucide-react';
import { useRecordsStore, useDatasetStore } from '@/stores';
import { useImageDirectory } from '@/hooks/useImageDirectory';
import { switchDataset } from '@/hooks/useStoreSync';
import { exportTable1ToExcel } from '@/services/excelService';

export const DatasetSelector: React.FC = () => {
  const datasets = useDatasetStore(s => s.datasets);
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);
  const createDataset = useDatasetStore(s => s.createDataset);
  const deleteDataset = useDatasetStore(s => s.deleteDataset);
  const records = useRecordsStore(s => s.records);
  const imgDir = useImageDirectory();
  const [showDelete, setShowDelete] = React.useState<string | null>(null);

  const handleCreate = async () => {
    const name = prompt('请输入数据集名称：');
    if (!name?.trim()) return;
    const dataset = await createDataset(name.trim());
    if (dataset) {
      await switchDataset(dataset.id);
    }
  };

  const handleDelete = async (id: string) => {
    // 删除数据集中所有记录的本地图片
    for (const r of records) {
      if (r.imagePrefix) imgDir.deleteImages(r.imagePrefix).catch(() => {});
    }
    await deleteDataset(id);
    setShowDelete(null);
  };

  const handleDownloadBeforeDelete = (id: string) => {
    const name = datasets.find(d => d.id === id)?.name || id;
    exportTable1ToExcel(records, `dataset-${name}`);
    setShowDelete(id);
  };

  if (datasets.length === 0 && !currentDatasetId) {
    return (
      <button onClick={handleCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 text-sm">
        <Plus className="h-3.5 w-3.5" />
        创建数据集
      </button>
    );
  }

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
      {currentDatasetId && (
        <button
          onClick={() => handleDownloadBeforeDelete(currentDatasetId)}
          className="p-1.5 hover:bg-red-50 rounded text-gray-500 hover:text-red-600"
          title="删除当前数据集（自动下载）"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
      {showDelete && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm w-full shadow-xl">
            <h3 className="text-lg font-semibold mb-2">确认删除</h3>
            <p className="text-sm text-gray-600 mb-1">数据已自动下载到本地。</p>
            <p className="text-sm text-gray-600 mb-4">删除数据集「{datasets.find(d => d.id === showDelete)?.name}」及其所有记录？此操作不可恢复。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDelete(null)} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50">取消</button>
              <button onClick={() => handleDelete(showDelete)} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">确认删除</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
