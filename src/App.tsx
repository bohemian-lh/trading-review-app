import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Navigation } from '@/components/layout/Navigation';
import { DatasetSelector } from '@/components/common/DatasetSelector';
import { useUIStore } from '@/stores';
import { useInitializeStore } from '@/hooks/useInitializeStore';

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })));
const ExcelUploader = lazy(() => import('@/components/excel').then(m => ({ default: m.ExcelUploader })));
const DataEditor = lazy(() => import('@/components/editor').then(m => ({ default: m.DataEditor })));
const FieldConfigPage = lazy(() => import('@/components/config/FieldConfigPage').then(m => ({ default: m.FieldConfigPage })));
const SubsequentProfitPage = lazy(() => import('@/components/charts/SubsequentProfitPage').then(m => ({ default: m.SubsequentProfitPage })));
const TheoryVsActualPage = lazy(() => import('@/pages/TheoryVsActualPage').then(m => ({ default: m.default })));
const TradingJournalPage = lazy(() => import('@/pages/TradingJournalPage').then(m => ({ default: m.default })));
const MindsetManagementPage = lazy(() => import('@/pages/MindsetManagementPage').then(m => ({ default: m.default })));
const DecisionQualityPage = lazy(() => import('@/pages/DecisionQualityPage').then(m => ({ default: m.default })));

const PageLoader: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="text-center">
      <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
      <p className="mt-3 text-gray-500 text-sm">加载中...</p>
    </div>
  </div>
);

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
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/import" element={<ExcelUploader />} />
              <Route path="/editor" element={<DataEditor />} />
              <Route path="/subsequent-profit" element={<SubsequentProfitPage />} />
              <Route path="/theory-vs-actual" element={<TheoryVsActualPage />} />
              <Route path="/journal" element={<TradingJournalPage />} />
              <Route path="/mindset" element={<MindsetManagementPage />} />
              <Route path="/decision-quality" element={<DecisionQualityPage />} />
              <Route path="/config" element={<FieldConfigPage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </BrowserRouter>
  );
};

export default App;
