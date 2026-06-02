import React from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { FileSpreadsheet, BarChart3, LayoutDashboard, Loader2 } from 'lucide-react';
import { ExcelUploader } from '@/components/excel';
import { DataEditor } from '@/components/editor';
import { 
  MonthlyProfitRatioChart,
  SystemMistakeChart,
  CycleSystemChart,
  CycleTypeChart,
  MonthlyTotalProfitChart
} from '@/components/charts';
import { useDataStore, useAnalysisResult } from '@/stores';
import { useInitializeStore } from '@/hooks/useInitializeStore';
import { cn } from '@/utils';

const Dashboard: React.FC = () => {
  const records = useDataStore((state) => state.records);
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
        <h2 className="text-xl font-bold mb-4">动态数据分析</h2>
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
          <SystemMistakeChart />
        </div>
        <div className="bg-white shadow rounded-lg p-6">
          <CycleSystemChart />
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
    { path: '/import', label: '导入/导出', icon: FileSpreadsheet },
    { path: '/editor', label: '数据编辑', icon: BarChart3 },
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

const App: React.FC = () => {
  useInitializeStore();
  const isInitialized = useDataStore((state) => state.isInitialized);
  const error = useDataStore((state) => state.error);

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
            </div>
          </div>
        </header>

        <Navigation />

        <main className="max-w-7xl mx-auto px-4 py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/import" element={<ExcelUploader />} />
            <Route path="/editor" element={<DataEditor />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
