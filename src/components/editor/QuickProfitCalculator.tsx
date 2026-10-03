import React, { useState, useRef, useLayoutEffect } from 'react';
import { X, GripHorizontal } from 'lucide-react';
import { Input } from '@/components/common';

interface QuickProfitCalculatorProps {
  isOpen: boolean;
  onClose: () => void;
}

interface GroupRate {
  buy: number;
  sell: number;
  rate: number;
}

// 支持 逗号/中文逗号/顿号/分号/空格/换行 分隔
const splitNumbers = (text: string): (number | null)[] =>
  text
    .split(/[\s,，、;；]+/)
    .filter(Boolean)
    .map(t => {
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    });

const fmtRate = (v: number): string => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

// 每组系数的默认值
const DEFAULT_COEF = '1/2';

// 支持小数（如 0.5）与分数字符串（如 1/2、3/4）；非法或分母为 0 返回 null
const parseCoef = (text: string): number | null => {
  const t = text.trim();
  if (!t) return null;
  if (t.includes('/')) {
    const parts = t.split('/');
    if (parts.length !== 2) return null;
    const n = Number(parts[0].trim());
    const d = Number(parts[1].trim());
    if (!Number.isFinite(n) || !Number.isFinite(d) || d === 0) return null;
    return n / d;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * 快捷计算盈亏率：输入买入价序列与卖出价序列，按下标一一配对，
 * 每组盈亏率 = (卖出 - 买入) / 买入 × 100，再乘该组自己的系数，
 * 参考值 = 各组（盈亏率 × 系数）相加。结果仅作参考，不写入任何记录字段。
 */
export const QuickProfitCalculator: React.FC<QuickProfitCalculatorProps> = ({ isOpen, onClose }) => {
  const [buyText, setBuyText] = useState('');
  const [sellText, setSellText] = useState('');
  const [coefText, setCoefText] = useState('');
  const [groups, setGroups] = useState<GroupRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, window.innerWidth - 392),
    y: 96,
  }));

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  // 组数 = 买入序列与卖出序列个数的较大者，随输入实时变化
  const groupCount = Math.max(splitNumbers(buyText).length, splitNumbers(sellText).length);

  // 组数变化时同步系数文本框（空格分隔）：保留已填值，新增组补默认 1/2，减少则截断末尾。
  // 仅在组数变化时触发，不覆盖用户正在输入的文本；用 layout effect 避免多一帧的错误提示闪烁。
  useLayoutEffect(() => {
    setCoefText(prev => {
      const tokens = prev.trim() ? prev.trim().split(/\s+/) : [];
      if (tokens.length === groupCount) return prev;
      if (tokens.length < groupCount) {
        return [...tokens, ...Array(groupCount - tokens.length).fill(DEFAULT_COEF)].join(' ');
      }
      return tokens.slice(0, groupCount).join(' ');
    });
  }, [groupCount]);

  const handleClose = () => {
    setBuyText('');
    setSellText('');
    setCoefText('');
    setGroups(null);
    setError(null);
    onClose();
  };

  // ---- 拖动（标题栏为把手，按指针位移量更新位置） ----
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    const w = panelRef.current?.offsetWidth ?? 376;
    const h = panelRef.current?.offsetHeight ?? 220;
    setPos({
      x: Math.min(Math.max(0, start.x + (e.clientX - start.px)), Math.max(0, window.innerWidth - w)),
      y: Math.min(Math.max(0, start.y + (e.clientY - start.py)), Math.max(0, window.innerHeight - h)),
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragStart.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  // ---- 计算 ----
  const handleConfirm = () => {
    const buys = splitNumbers(buyText);
    const sells = splitNumbers(sellText);

    if (buys.length === 0 || sells.length === 0) {
      setGroups(null);
      setError('请输入买入价和卖出价，用逗号、空格或换行分隔');
      return;
    }
    if (buys.some(v => v === null) || sells.some(v => v === null)) {
      setGroups(null);
      setError('存在无法识别的数字，请用逗号、空格或换行分隔');
      return;
    }
    if (buys.length !== sells.length) {
      setGroups(null);
      setError(`数量不一致：买入 ${buys.length} 项，卖出 ${sells.length} 项，无法计算`);
      return;
    }
    const buyNums = buys as number[];
    const sellNums = sells as number[];
    if (buyNums.some(v => v <= 0)) {
      setGroups(null);
      setError('买入价必须大于 0');
      return;
    }

    setError(null);
    setGroups(buyNums.map((buy, i) => ({ buy, sell: sellNums[i], rate: ((sellNums[i] - buy) / buy) * 100 })));
  };

  if (!isOpen) return null;

  // 解析系数文本框（空格分隔）：个数须与组数一致，逐组校验；非法时隐藏结果
  // （系数改动即重算，无需再点确定）
  const coefTokens = coefText.trim() ? coefText.trim().split(/\s+/) : [];
  const coefValues = coefTokens.map(parseCoef);
  let coefError: string | null = null;
  if (coefTokens.length !== groupCount) {
    coefError = `系数个数应为 ${groupCount} 个（当前 ${coefTokens.length} 个）`;
  } else {
    for (let i = 0; i < coefValues.length; i++) {
      const v = coefValues[i];
      if (v === null) {
        coefError = `系数${i + 1}无效：请输入数字或分数（如 1/2）`;
        break;
      }
      if (v <= 0) {
        coefError = `系数${i + 1}必须大于 0`;
        break;
      }
    }
  }

  const resultReady = !!groups && groups.length > 0 && groups.length === groupCount && !coefError;
  let totalRate = 0;
  if (resultReady && groups) {
    totalRate = groups.reduce((sum, g, i) => {
      const c = coefValues[i];
      return c === null ? sum : sum + g.rate * c;
    }, 0);
  }

  return (
    <div
      ref={panelRef}
      // margin: 0 —— 固定定位下祖容器的间距类（如 space-y-*）会给本元素加 margin-top，
      // 使 left/top 与视觉位置错位，这里显式清零
      style={{ left: pos.x, top: pos.y, margin: 0 }}
      className="fixed z-[60] w-[376px] bg-white rounded-lg shadow-2xl border border-gray-200"
    >
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="flex items-center justify-between px-3 py-2 border-b border-gray-200 cursor-move select-none touch-none"
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <GripHorizontal className="h-4 w-4 text-gray-400" />
          快捷计算盈亏率
        </span>
        <button onClick={handleClose} className="text-gray-400 hover:text-gray-600" title="关闭">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-3 py-3 space-y-2">
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-xs text-gray-500">买入序列</label>
          <Input value={buyText} onChange={e => setBuyText(e.target.value)} placeholder="例如: 10.00, 11.50" />
        </div>
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-xs text-gray-500">卖出序列</label>
          <Input value={sellText} onChange={e => setSellText(e.target.value)} placeholder="例如: 11.00, 11.20" />
        </div>
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-xs text-gray-500">系数</label>
          <Input
            value={coefText}
            onChange={e => setCoefText(e.target.value)}
            placeholder="按组数空格分隔，如 1/2 1/2"
          />
        </div>
        {groupCount > 0 && (
          <p className="text-xs text-gray-400">
            共 {groupCount} 组，需 {groupCount} 个系数（默认 1/2），用空格分隔
          </p>
        )}

        {coefError && <p className="text-xs text-red-600">{coefError}</p>}

        <button
          onClick={handleConfirm}
          className="w-full py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded"
        >
          确定
        </button>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {resultReady && groups && (
          <div className="border-t border-gray-200 pt-2 space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">参考盈亏率（各组 × 对应系数 后相加）</span>
              <span className={`font-semibold ${totalRate >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                {fmtRate(totalRate)}
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {groups.map((g, i) => {
                const c = coefValues[i];
                const scaled = c === null ? 0 : g.rate * c;
                return (
                  <div key={i} className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      第{i + 1}组 {g.buy} → {g.sell} × {coefTokens[i]}
                    </span>
                    <span className={scaled >= 0 ? 'text-red-600' : 'text-green-600'}>{fmtRate(scaled)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
