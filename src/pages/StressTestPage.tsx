import React, { useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Play, Loader2 } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { useRecordsStore, useStressTestStore, useDatasetStore } from '@/stores';
import { saveStressSeriesToR2 } from '@/hooks/useStoreSync';
import { useOnDemandCompute } from '@/hooks/useOnDemandCompute';
import type { StressSeries } from '@/types';
import {
  mergeGroupRecords, computeCumulativeProfitFromItems, computeGrowthProfitRatiosFromItems,
  type MergedSeriesItem,
} from '@/services/analysisTabService';
import {
  computeSkewness, computeKurtosis, computeJarqueBera,
  type MonteCarloResult, type MonteCarloConfig,
} from '@/services/stressStatisticsService';
import { SeriesLineChart } from '@/components/analysis/SeriesLineChart';
import { StressSeriesModal } from '@/components/stress/StressSeriesModal';

const SERIES_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#ef4444'];

const fmtSigned = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

interface ComputedSeries {
  key: string;
  label: string;
  color: string;
  count: number;
  merged: MergedSeriesItem[];
  cumulative: (number | null)[];
  growth: (number | null)[];
  skewness: number;
  kurtosis: number;
  jb: { jb: number; pValue: number };
}

const KV: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between text-sm py-0.5">
    <span className="text-gray-500">{label}</span>
    <span className="font-medium text-gray-900">{value}</span>
  </div>
);

const Histogram: React.FC<{ data: { label: string; count: number }[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={160}>
    <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={4} />
      <YAxis tick={{ fontSize: 10 }} />
      <Tooltip />
      <Bar dataKey="count" name="次数" fill="#0ea5e9" />
    </BarChart>
  </ResponsiveContainer>
);

const McResultCard: React.FC<{
  title: string;
  result: MonteCarloResult | null;
  running: boolean;
  onRun: () => void;
}> = ({ title, result, running, onRun }) => (
  <div className="border border-gray-200 rounded-lg p-4">
    <div className="flex items-center justify-between mb-3">
      <h4 className="font-medium text-gray-900">{title}</h4>
      <button
        onClick={onRun}
        disabled={running}
        className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
        {running ? '模拟中...' : '运行模拟'}
      </button>
    </div>

    {!result ? (
      <p className="text-sm text-gray-400 py-4 text-center">点击「运行模拟」生成结果（后台 Web Worker 计算）</p>
    ) : (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-gray-600">
          <span>破产率：<b className="text-red-600">{result.bankruptcyRate}%</b></span>
          <span>种子：<b>{result.seed}</b></span>
          <span>模拟次数：<b>{result.numSimulations}</b></span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded p-3">
            <p className="text-xs font-medium text-gray-700 mb-1">收益类</p>
            <KV label="平均收益" value={`${fmtSigned(result.returns.avg.amount)}（${fmtSigned(result.returns.avg.ratio)}%）`} />
            <KV label="中位数收益" value={`${fmtSigned(result.returns.median.amount)}（${fmtSigned(result.returns.median.ratio)}%）`} />
            <KV label="最佳收益" value={`${fmtSigned(result.returns.best.amount)}（${fmtSigned(result.returns.best.ratio)}%）`} />
            <KV label="最差收益" value={`${fmtSigned(result.returns.worst.amount)}（${fmtSigned(result.returns.worst.ratio)}%）`} />
          </div>
          <div className="bg-gray-50 rounded p-3">
            <p className="text-xs font-medium text-gray-700 mb-1">回撤类</p>
            <KV label="平均最大回撤" value={`${result.drawdowns.avg.amount.toFixed(2)}（${result.drawdowns.avg.ratio.toFixed(2)}%）`} />
            <KV label="最差最大回撤" value={`${result.drawdowns.worst.amount.toFixed(2)}（${result.drawdowns.worst.ratio.toFixed(2)}%）`} />
            <KV label="最小最大回撤" value={`${result.drawdowns.best.amount.toFixed(2)}（${result.drawdowns.best.ratio.toFixed(2)}%）`} />
          </div>
          <div className="bg-gray-50 rounded p-3">
            <p className="text-xs font-medium text-gray-700 mb-1">连败统计</p>
            <KV label="平均最长连败" value={`${result.streaks.avg} 次`} />
            <KV label="最大最长连败" value={`${result.streaks.max} 次`} />
            <KV label="最小最长连败" value={`${result.streaks.min} 次`} />
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-gray-700 mb-1">期末资金分布</p>
          <Histogram data={result.histogram} />
        </div>
      </div>
    )}
  </div>
);

const StressTestPage: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const series = useStressTestStore(s => s.series);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<StressSeries | null>(null);
  const [overlay, setOverlay] = useState(true);

  // 蒙特卡洛参数
  const [initialCapital, setInitialCapital] = useState(10000);
  const [bankruptcyRatio, setBankruptcyRatio] = useState(50);
  const [numSimulations, setNumSimulations] = useState(10000);
  const [seedInput, setSeedInput] = useState('');
  const [mcResults, setMcResults] = useState<Record<string, { with: MonteCarloResult | null; without: MonteCarloResult | null }>>({});
  const [mcRunning, setMcRunning] = useState<string | null>(null);
  const [mcError, setMcError] = useState<string | null>(null);

  const currentDatasetId = useDatasetStore(s => s.currentDatasetId);
  const stressKey = series.length > 0 ? `${currentDatasetId}:stress` : null;
  const { result: stressResult, refresh: refreshStress, isStale: stressStale } = useOnDemandCompute(
    stressKey,
    [records, series],
    () => {
      const latestSeries = useStressTestStore.getState().series;
      const latestRecords = useRecordsStore.getState().records;
      return latestSeries.map((s, i): ComputedSeries => {
        const merged = mergeGroupRecords(latestRecords, s.groups);
        const vals = merged.map(it => it.value);
        return {
          key: s.id,
          label: s.name,
          color: SERIES_COLORS[i % SERIES_COLORS.length],
          count: merged.length,
          merged,
          cumulative: computeCumulativeProfitFromItems(merged).map(p => p.value),
          growth: computeGrowthProfitRatiosFromItems(merged).map(p => p.value),
          skewness: computeSkewness(vals),
          kurtosis: computeKurtosis(vals),
          jb: computeJarqueBera(vals),
        };
      });
    },
  );

  const computedSeries = stressResult ?? [];

  const cumulativeSeries = useMemo(() => computedSeries.map(x => ({
    key: x.key, label: x.label, color: x.color, values: x.cumulative,
  })), [computedSeries]);

  const growthSeries = useMemo(() => computedSeries.map(x => ({
    key: x.key, label: x.label, color: x.color, values: x.growth,
  })), [computedSeries]);

  const cumulativeX = useMemo(() => Array.from({ length: Math.max(...cumulativeSeries.map(s => s.values.length), 0) }, (_, i) => String(i + 1)), [cumulativeSeries]);
  const growthX = useMemo(() => Array.from({ length: Math.max(...growthSeries.map(s => s.values.length), 0) }, (_, i) => String(i + 1)), [growthSeries]);

  const skewKurt = useMemo(() => computedSeries.map(x => ({
    key: x.key, name: x.label, color: x.color, count: x.count,
    skewness: x.skewness, kurtosis: x.kurtosis, jb: x.jb,
  })), [computedSeries]);

  const handleSaveSeries = async (s: StressSeries) => {
    const store = useStressTestStore.getState();
    if (editing) store.updateSeries(s);
    else store.addSeries(s);
    setShowModal(false);
    setEditing(null);
    await saveStressSeriesToR2(useStressTestStore.getState().series);
  };

  const handleDeleteSeries = async (id: string) => {
    if (!window.confirm('确认删除该对比系列？')) return;
    useStressTestStore.getState().deleteSeries(id);
    setMcResults(prev => { const n = { ...prev }; delete n[id]; return n; });
    await saveStressSeriesToR2(useStressTestStore.getState().series);
  };

  const runMonteCarlo = (seriesId: string, mode: 'with' | 'without') => {
    const input = computedSeries.find(x => x.key === seriesId);
    if (!input || input.merged.length === 0) return;
    const returns = input.merged.map(it => it.value);
    const positions = input.merged.map(it => (typeof it.record.positionSize === 'number' ? Math.min(100, Math.max(0, it.record.positionSize)) : 33));
    const seed = seedInput.trim() !== '' ? parseInt(seedInput, 10) : Math.floor(Math.random() * 0x7fffffff);
    const config: MonteCarloConfig = {
      initialCapital,
      bankruptcyRatio: Math.min(100, Math.max(0, bankruptcyRatio)),
      numSimulations: Math.min(1000000, Math.max(10000, numSimulations)),
      replacement: mode === 'with',
      seed,
    };
    const runKey = `${seriesId}:${mode}`;
    setMcRunning(runKey);
    setMcError(null);

    const worker = new Worker(new URL('../workers/stressMonteCarlo.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      worker.terminate();
      setMcRunning(null);
      const data = e.data as { success: boolean; result?: MonteCarloResult; error?: string };
      if (data?.success && data.result) {
        setMcResults(prev => ({
          ...prev,
          [seriesId]: {
            with: prev[seriesId]?.with ?? null,
            without: prev[seriesId]?.without ?? null,
            [mode]: data.result!,
          },
        }));
      } else {
        setMcError(data?.error || '蒙特卡洛模拟失败');
      }
    };
    worker.onerror = () => {
      worker.terminate();
      setMcRunning(null);
      setMcError('蒙特卡洛模拟失败（Worker 错误）');
    };
    worker.postMessage({ returns, positions, config });
  };

  const numInputCls = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-6">
      {/* 系列管理 */}
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">压测对比</h2>
            <p className="text-sm text-gray-500 mt-1">用多条独立筛选的对比系列，对盈亏曲线、盈亏比成长、偏度/峰度与蒙特卡洛模拟进行并排比较。</p>
          </div>
          <div className="flex items-center gap-3">
            {stressStale && <span className="text-xs text-amber-600">数据已更新</span>}
            <button
              onClick={refreshStress}
              className="px-2 py-1 text-xs text-blue-600 border border-blue-300 rounded hover:bg-blue-50"
            >
              更新
            </button>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={overlay} onChange={e => setOverlay(e.target.checked)} className="rounded" />
              曲线叠加显示
            </label>
            <button
              onClick={() => { setEditing(null); setShowModal(true); }}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
            >
              <Plus className="h-4 w-4" /> 新增系列
            </button>
          </div>
        </div>

        {series.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            尚未添加对比系列，点击「新增系列」开始
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {series.map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm" style={{ backgroundColor: `${SERIES_COLORS[i % SERIES_COLORS.length]}1a`, color: SERIES_COLORS[i % SERIES_COLORS.length] }}>
                <span className="font-medium">{s.name}</span>
                <button onClick={() => { setEditing(s); setShowModal(true); }} className="text-gray-500 hover:text-gray-700" title="编辑"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDeleteSeries(s.id)} className="text-gray-400 hover:text-red-500" title="删除"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {series.length > 0 && (
        <>
          {/* 盈亏曲线 */}
          <div className="bg-white shadow rounded-lg p-6">
            {overlay ? (
              <SeriesLineChart
                title="盈亏曲线"
                series={cumulativeSeries}
                xLabels={cumulativeX}
                yLabel="盈亏"
                ruleText={<p className="text-sm text-blue-800">累计盈亏 = 按开单时间排序后逐笔累加所选信源字段的值</p>}
                noDataText="暂无数据"
              />
            ) : (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900">盈亏曲线（分开显示）</h3>
                {cumulativeSeries.map(s => (
                  <SeriesLineChart key={s.key} title={`盈亏曲线 · ${s.label}`} series={[s]} xLabels={cumulativeX} yLabel="盈亏" ruleText={<p className="text-sm text-blue-800">累计盈亏 = 按开单时间排序后逐笔累加所选信源字段的值</p>} noDataText="暂无数据" />
                ))}
              </div>
            )}
          </div>

          {/* 盈亏比成长曲线 */}
          <div className="bg-white shadow rounded-lg p-6">
            {overlay ? (
              <SeriesLineChart
                title="盈亏比成长曲线"
                series={growthSeries}
                xLabels={growthX}
                yLabel="盈亏比"
                ruleText={<p className="text-sm text-blue-800">第 N 笔的盈亏比 = 前 N 笔按现有盈亏比公式计算，随交易数量增长而变化</p>}
                noDataText="暂无数据"
              />
            ) : (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900">盈亏比成长曲线（分开显示）</h3>
                {growthSeries.map(s => (
                  <SeriesLineChart key={s.key} title={`盈亏比成长曲线 · ${s.label}`} series={[s]} xLabels={growthX} yLabel="盈亏比" ruleText={<p className="text-sm text-blue-800">第 N 笔的盈亏比 = 前 N 笔按现有盈亏比公式计算</p>} noDataText="暂无数据" />
                ))}
              </div>
            )}
          </div>

          {/* 偏度/峰度测试 */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">偏度 / 峰度测试</h3>
            <p className="text-sm text-gray-500 mb-4">对各系列信源收益分布计算样本偏度、超额峰度（正态为 0）及 Jarque-Bera 正态性检验。</p>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={skewKurt.map(s => ({ name: s.name, 偏度: Math.round(s.skewness * 10000) / 10000, 峰度: Math.round(s.kurtosis * 10000) / 10000 }))} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <ReferenceLine y={0} stroke="#000" />
                <Bar dataKey="偏度" fill="#0ea5e9" />
                <Bar dataKey="峰度" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>

            <table className="min-w-full mt-4 divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">系列</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">样本数</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">偏度</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">峰度</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">JB 统计量</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">p 值</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">正态性(5%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {skewKurt.map(s => (
                  <tr key={s.key}>
                    <td className="px-3 py-2"><span className="inline-block w-2.5 h-2.5 rounded-full mr-2" style={{ backgroundColor: s.color }} />{s.name}</td>
                    <td className="px-3 py-2 text-gray-900">{s.count}</td>
                    <td className="px-3 py-2 text-gray-900">{s.skewness.toFixed(4)}</td>
                    <td className="px-3 py-2 text-gray-900">{s.kurtosis.toFixed(4)}</td>
                    <td className="px-3 py-2 text-gray-900">{s.jb.jb.toFixed(4)}</td>
                    <td className="px-3 py-2 text-gray-900">{s.jb.pValue.toFixed(4)}</td>
                    <td className="px-3 py-2">{s.jb.pValue < 0.05 ? <span className="text-red-600">拒绝正态</span> : <span className="text-green-600">不拒绝正态</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 蒙特卡洛模拟 */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">蒙特卡洛模拟</h3>
            <p className="text-sm text-gray-500 mb-4">资金模型：capital ×= (1 + 收益率% × 仓位%)；跌破破产线即终止并计入破产。有放回=Bootstrap，无放回=Permutation（打乱顺序）。</p>

            {/* 参数配置 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">初始资金</label>
                <input type="number" min="1" value={initialCapital} onChange={e => setInitialCapital(parseFloat(e.target.value) || 0)} className={numInputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">破产线（初始资金的 %）</label>
                <input type="number" min="0" max="100" value={bankruptcyRatio} onChange={e => setBankruptcyRatio(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))} className={numInputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">模拟次数（10000-1000000）</label>
                <input type="number" min="10000" max="1000000" step="10000" value={numSimulations} onChange={e => setNumSimulations(parseInt(e.target.value, 10) || 10000)} className={numInputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">种子（留空=随机）</label>
                <input type="text" value={seedInput} onChange={e => setSeedInput(e.target.value.replace(/\D/g, ''))} placeholder="可复现种子" className={numInputCls} />
              </div>
            </div>

            {mcError && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded">{mcError}</div>}

            {computedSeries.map(x => {
              const res = mcResults[x.key] ?? { with: null, without: null };
              return (
                <div key={x.key} className="mb-6">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: x.color }} />
                    <span className="font-medium text-gray-900">{x.label}</span>
                    <span className="text-xs text-gray-500">（{x.merged.length} 笔）</span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <McResultCard title="有放回（Bootstrap）" result={res.with} running={mcRunning === `${x.key}:with`} onRun={() => runMonteCarlo(x.key, 'with')} />
                    <McResultCard title="无放回（Permutation）" result={res.without} running={mcRunning === `${x.key}:without`} onRun={() => runMonteCarlo(x.key, 'without')} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {showModal && (
        <StressSeriesModal editing={editing} onClose={() => { setShowModal(false); setEditing(null); }} onSave={handleSaveSeries} />
      )}
    </div>
  );
};

export default StressTestPage;
