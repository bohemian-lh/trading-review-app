import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, X, RotateCcw } from 'lucide-react';
import { generateJournalPdfBlob } from '@/utils/exportJournalPdf';
import type { JournalRow } from '@/utils/JournalPdfDocument';

// A4 横向可用宽度（pt）：842 - 左右 padding 各 30
const USABLE_WIDTH = 782;
const STORAGE_KEY = 'journal_pdf_settings';

interface PdfSettings {
  colWidths: number[];  // 长度 = groupCount + 1
  rowSpacing: number;   // 策略卡片间距 pt
}

function loadSettings(groupCount: number): PdfSettings {
  const defaults: PdfSettings = {
    colWidths: Array(groupCount + 1).fill(Math.round(USABLE_WIDTH / (groupCount + 1))),
    rowSpacing: 2,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.colWidths) && parsed.colWidths.length === groupCount + 1) {
        return { ...defaults, ...parsed };
      }
    }
  } catch { /* ignore */ }
  return defaults;
}

interface Props {
  rows: JournalRow[];
  groupIds: string[];
  groupNames: string[];
  onClose: () => void;
}

const PdfPreviewModal: React.FC<Props> = ({ rows, groupIds, groupNames, onClose }) => {
  const groupCount = groupIds.length;
  const [settings, setSettings] = useState<PdfSettings>(() => loadSettings(groupCount));
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 生成/更新 PDF 预览
  useEffect(() => {
    setLoading(true);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const blob = await generateJournalPdfBlob(rows, groupIds, groupNames, settings.colWidths, settings.rowSpacing);
        setBlobUrl(prev => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(blob);
        });
      } catch (e: any) {
        setError(e?.message || '预览生成失败');
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rows, groupIds, groupNames, settings]);

  // 卸载时释放 blob
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // 持久化
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateColWidth = (idx: number, val: number) => {
    setSettings(prev => {
      const next = [...prev.colWidths];
      next[idx] = val;
      return { ...prev, colWidths: next };
    });
  };

  const resetSettings = () => {
    setSettings({
      colWidths: Array(groupCount + 1).fill(Math.round(USABLE_WIDTH / (groupCount + 1))),
      rowSpacing: 2,
    });
  };

  const handleDownload = async () => {
    try {
      const blob = await generateJournalPdfBlob(rows, groupIds, groupNames, settings.colWidths, settings.rowSpacing);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `当前交易_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || '下载失败');
    }
  };

  const colLabels = useMemo(() => ['股票名称', ...groupNames], [groupNames]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <div className="text-sm font-medium text-gray-800">PDF 预览</div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-blue-600 text-white hover:bg-blue-700"
            >
              <Download className="h-3.5 w-3.5" />
              下载 PDF
            </button>
            <button onClick={onClose} className="p-1 rounded text-gray-500 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* 左侧预览 */}
          <div className="flex-1 bg-gray-100 min-w-0">
            {loading && !blobUrl && (
              <div className="flex items-center justify-center h-full text-gray-500 text-sm">生成预览中...</div>
            )}
            {error && (
              <div className="flex items-center justify-center h-full text-red-600 text-sm">{error}</div>
            )}
            {blobUrl && (
              <iframe src={blobUrl} title="PDF 预览" className="w-full h-full border-0" />
            )}
          </div>

          {/* 右侧设置 */}
          <div className="w-72 shrink-0 border-l border-gray-200 overflow-y-auto p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-gray-700">列宽调节（pt）</div>
              <button onClick={resetSettings} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                <RotateCcw className="h-3 w-3" />
                恢复默认
              </button>
            </div>
            {colLabels.map((label, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="truncate max-w-[140px]">{label || `列${idx + 1}`}</span>
                  <span className="text-gray-700">{settings.colWidths[idx]}pt</span>
                </div>
                <input
                  type="range"
                  min={40}
                  max={300}
                  value={settings.colWidths[idx]}
                  onChange={(e) => updateColWidth(idx, Number(e.target.value))}
                  className="w-full"
                />
              </div>
            ))}

            <div className="border-t pt-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>策略卡片间距（pt）</span>
                <span className="text-gray-700">{settings.rowSpacing}pt</span>
              </div>
              <input
                type="range"
                min={0}
                max={12}
                value={settings.rowSpacing}
                onChange={(e) => setSettings(prev => ({ ...prev, rowSpacing: Number(e.target.value) }))}
                className="w-full"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PdfPreviewModal;
