import React, { useMemo, useState } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { useRecordsStore } from '@/stores';
import { calculateSubsequentProfitAnalysis } from '@/utils/calculations';

const COLORS = ['#0ea5e9', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#d946ef', '#e11d48', '#22d3ee', '#a78bfa', '#fb923c'];

export const SubsequentProfitPage: React.FC = () => {
  const records = useRecordsStore(s => s.records);
  const fieldConfig = useRecordsStore(s => s.fieldConfig);

  const analysis = useMemo(
    () => calculateSubsequentProfitAnalysis(records, fieldConfig.tradingTypes, fieldConfig),
    [records, fieldConfig]
  );

  const tradingTypes = useMemo(
    () => fieldConfig.tradingTypes.filter(t => t !== '未知'),
    [fieldConfig]
  );

  // 散点图 checkbox 选择
  const [selectedScatter, setSelectedScatter] = useState<Set<string>>(
    () => new Set(tradingTypes)
  );
  // 直方图 dropdown 选择
  const [selectedHistogram, setSelectedHistogram] = useState<string>(
    () => tradingTypes[0] || ''
  );

  // 散点图数据：用 jitter 避免重叠
  const scatterData = useMemo(() => {
    const typeSet = selectedScatter;
    return analysis.allPoints
      .filter(p => typeSet.has(p.tradingType))
      .map(p => {
        const jitter = (Math.random() - 0.5) * 0.5;
        const typeIdx = tradingTypes.indexOf(p.tradingType);
        const yBase = typeIdx >= 0 ? tradingTypes.length - 1 - typeIdx : 0;
        return { ...p, y: yBase + jitter, yLabel: p.tradingType };
      });
  }, [analysis.allPoints, selectedScatter, tradingTypes]);

  // 直方图数据
  const histogramStats = useMemo(
    () => analysis.stats.find(s => s.tradingType === selectedHistogram),
    [analysis.stats, selectedHistogram]
  );

  const histogramData = useMemo(() => {
    if (!histogramStats) return [];
    return histogramStats.histogram.map(b => ({
      label: b.label,
      count: b.count,
    }));
  }, [histogramStats]);

  // 散点图 Y 轴 ticks
  const yTicks = useMemo(
    () => tradingTypes.map((_, i) => tradingTypes.length - 1 - i),
    [tradingTypes]
  );
  const yTickFormatter = (v: number) => tradingTypes[tradingTypes.length - 1 - Math.round(v)] || '';

  const toggleScatter = (t: string) => {
    setSelectedScatter(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  if (records.length === 0) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center h-64">
        <p className="text-gray-500 text-lg">暂无交易数据，请先导入数据</p>
      </div>
    );
  }

  const hasData = analysis.allPoints.length > 0;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <TrendingUp className="h-6 w-6 text-blue-600" />
        <h2 className="text-xl font-bold text-gray-900">后续盈亏空间分析</h2>
      </div>

      {!hasData ? (
        <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
          <p className="text-gray-500">所有交易记录的后续盈亏空间均为 N/A，请先在数据编辑页面填写数据</p>
        </div>
      ) : (
        <>
          {/* 1. Scatter Plot */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">散点分布图（每点 = 一笔交易）</h3>
            <div className="flex flex-wrap gap-3 mb-4">
              {tradingTypes.map(t => (
                <label key={t} className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" checked={selectedScatter.has(t)} onChange={() => toggleScatter(t)} className="rounded" />
                  <span style={{ color: COLORS[tradingTypes.indexOf(t) % COLORS.length] }}>{t}</span>
                </label>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={Math.max(300, tradingTypes.length * 50 + 80)}>
              <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="value"
                  name="后续盈亏空间"
                  unit="%"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="交易类型"
                  ticks={yTicks}
                  tickFormatter={yTickFormatter}
                  tick={{ fontSize: 11 }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }}
                  formatter={(v: any, name: string) => {
                    if (name === 'value') return [`${v}%`, '后续盈亏空间'];
                    return [v, name];
                  }}
                  labelFormatter={(_label) => ''}
                />
                <Legend />
                {tradingTypes.filter(t => selectedScatter.has(t)).map((t, i) => {
                  const data = scatterData.filter(d => d.tradingType === t);
                  return (
                    <Scatter
                      key={t}
                      name={t}
                      data={data}
                      fill={COLORS[i % COLORS.length]}
                      opacity={0.6}
                    />
                  );
                })}
              </ScatterChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-500 mt-2">悬停查看具体数值 · 同类型点有随机偏移避免重叠</p>
          </div>

          {/* 2. Histogram */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">直方图（按档位分布）</h3>
            <div className="mb-4">
              <label className="text-sm font-medium mr-2">选择交易类型：</label>
              <select
                value={selectedHistogram}
                onChange={e => setSelectedHistogram(e.target.value)}
                className="border rounded px-3 py-1.5 text-sm"
              >
                {tradingTypes.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {histogramStats && histogramStats.count > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={histogramData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '0.5rem', fontSize: 12 }}
                    formatter={(v: any) => [v, '笔数']}
                  />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]}>
                    {histogramData.map((_, i) => (
                      <Cell key={i} fill={i < 5 ? '#ef4444' : i < 8 ? '#f59e0b' : '#10b981'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg">
                <p className="text-gray-500 text-sm">该类型无有效数据</p>
              </div>
            )}
          </div>

          {/* 3. Stats Table */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">统计汇总</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="px-4 py-2 text-left font-medium text-gray-600">交易类型</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">有效条数</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">平均值</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">最大值</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">最小值</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.stats.filter(s => s.count > 0).map((s, i) => (
                    <tr key={s.tradingType} className={`border-b ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="px-4 py-2 font-medium text-gray-900">{s.tradingType}</td>
                      <td className="px-4 py-2 text-right text-gray-600">{s.count}</td>
                      <td className={`px-4 py-2 text-right font-medium ${s.avg >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {s.avg}%
                      </td>
                      <td className="px-4 py-2 text-right text-green-600">{s.max}%</td>
                      <td className="px-4 py-2 text-right text-red-600">{s.min}%</td>
                    </tr>
                  ))}
                  {analysis.stats.filter(s => s.count > 0).length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-500">所有交易类型暂无有效数据</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
