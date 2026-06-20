import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { FileSpreadsheet, BarChart3, LayoutDashboard, Settings, Loader2, TrendingUp, Folder, Plus, Trash2 } from 'lucide-react';
import { ExcelUploader } from '@/components/excel';
import { DataEditor } from '@/components/editor';
import { FieldConfigPage } from '@/components/config/FieldConfigPage';
import { SubsequentProfitPage } from '@/components/charts/SubsequentProfitPage';
import { exportTable1ToExcel } from '@/services/excelService';
import { 
  MonthlyProfitRatioChart,
  CycleSystemChart,
  CycleTypeChart,
  MonthlyTotalProfitChart,
  TradingTypeProfitBarChart,
  CycleProfitChart
} from '@/components/charts';
import { useRecordsStore, useDatasetStore, useUIStore, useAnalysisResult } from '@/stores';
import { useInitializeStore } from '@/hooks/useInitializeStore';
import { switchDataset } from '@/hooks/useStoreSync';
import { cn } from '@/utils';

const Dashboard: React.FC = () => {
  const records = useRecordsStore((state) => state.records);
  const analysis = useAnalysisResult();

  const analysisItems = [
    { label: '符合系统盈亏比', value: analysis.systemProfitRatio, color: 'text-blue-600' },
    { label: '符合系统无失误盈亏比', value: analysis.systemNoMistakeProfitRatio, color: 'text-green-600' },
    { label: '符合系统有失误盈亏比', value: analysis.systemWithMistakeProfitRatio, color: 'text-yellow-600' },
    { label: '不符合系统盈亏比', value: analysis.nonSystemProfitRatio, color: 'text-red-600' },
    { label: '符合系统盈利平均持仓', value: analysis.systemProfitAvgHoldDays, color: 'text-gray-600' },
    { label: '符合系统亏损平均持仓', value: analysis.systemLossAvgHoldDays, color: 'text-gray-600' },
    { label: '不符合系统盈利平均持仓', value: analysis.nonSystemProfitAvgHoldDays, color: 'text-gray-600' },
    { label: '不符合系统亏损平均持仓', value: analysis.nonSystemLossAvgHoldDays, color: 'text-gray-600' },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">数据分析概览</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-600 font-medium">总交易记录</p>
            <p className="text-2xl font-bold text-blue-900">{records.length}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-600 font-medium">盈利交易</p>
            <p className="text-2xl font-bold text-green-900">
              {records.filter(r => r.profitPercent > 0).length}
            </p>
          </div>
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm text-red-600 font-medium">亏损交易</p>
            <p className="text-2xl font-bold text-red-900">
              {records.filter(r => r.profitPercent < 0).length}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 font-medium">持平交易</p>
            <p className="text-2xl font-bold text-gray-900">
              {records.filter(r => r.profitPercent === 0).length}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-xl font-bold mb-4">总数据统计</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {analysisItems.map((item, index) => (
            <div key={index} className="border rounded-lg p-4">
              <p className="text-sm text-gray-500 font-medium">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>
                {typeof item.value === 'number' ? item.value.toFixed(2) : item.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* 新增的月度总盈亏图表 */}
        <div className="bg-white shadow rounded-lg p-6">
          <MonthlyTotalProfitChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <MonthlyProfitRatioChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <CycleProfitChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <CycleSystemChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <TradingTypeProfitBarChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <CycleTypeChart />
        </div>
      </div>
    </div>
  );
};

const Navigation: React.FC = () => {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '首页', icon: LayoutDashboard },
    { path: '/subsequent-profit', label: '后续盈亏', icon: TrendingUp },
    { path: '/import', label: '导入/导出', icon: FileSpreadsheet },
    { path: '/editor', label: '数据编辑', icon: BarChart3 },
    { path: '/config', label: '字段配置', icon: Settings },
  ];

  return (
    <nav className="bg-gray-50 border-b">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex space-x-8">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center space-x-2 px-3 py-4 text-sm font-medium border-b-2 transition-colors',
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

const DatasetSelector: React.FC = () => {
  const datasets = useDatasetStore(s => s.datasets);
  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);
  const createDataset = useDatasetStore(s => s.createDataset);
  const deleteDataset = useDatasetStore(s => s.deleteDataset);
  const records = useRecordsStore(s => s.records);
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

const App: React.FC = () => {
  useInitializeStore();
  const isInitialized = useUIStore((state) => state.isInitialized);
  const error = useUIStore((state) => state.error);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
          <p className="mt-4 text-gray-600">加载中...</p>
          {error && <p className="mt-2 text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-100">
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-2xl font-bold text-gray-900">交易复盘管理系统</h1>
              <DatasetSelector />
            </div>
          </div>
        </header>

        <Navigation />

        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/import" element={<ExcelUploader />} />
            <Route path="/editor" element={<DataEditor />} />
            <Route path="/subsequent-profit" element={<SubsequentProfitPage />} />
            <Route path="/config" element={<FieldConfigPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
