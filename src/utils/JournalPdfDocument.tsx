import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { TradingJournal } from '@/types';
import { GAIN_PRICE_INDEXES, getClosePrice, computeGainSegments, resolvePriceCodeSegments } from '@/utils/journalHelpers';
import { wrapRuns, cardTextWidth, cellTextWidth, type PdfTextRun } from '@/utils/pdfTextWrap';

// 中文字体注册已移至 utils/pdfFonts.ts，由 generateJournalPdfBlob 调用
// ensurePdfFontsRegistered 统一注册并预加载。

// ─── 辅助类型 ──────────────────────────────────────────────────────
export interface StrategyItem {
  text: string;
  strategyId: string;
  isCustom?: boolean;
}

export interface JournalRow {
  journal: TradingJournal;
  grouped: Record<string, StrategyItem[]>;
}

interface Props {
  rows: JournalRow[];
  groupIds: string[];
  groupNames: string[];
  colWidths?: number[];  // 每股一列宽度（pt），索引 0 = 名称列，1..N = 策略组列
  rowSpacing?: number;   // 策略卡片间距（pt）
  priceLevelCodes?: Record<number, string>;  // 价位代码映射，用于策略文本 /代码 替换
  watchlist?: string[];  // 「后续可关注」列表，渲染在表格最后一行之后
}

// ─── 固定配置 ──────────────────────────────────────────────────────
const PRICE_LABELS = ['', '', '目标位：', '固定目标位：', '压力1：', '压力2：', '趋势最低点：'];
const ROW_COLORS = ['#f0fdf4', '#fefce8', '#eff6ff']; // green50/yellow50/blue50
const ROWS_PER_PAGE = 25;
// A4 横向可用宽度（pt）：842 - 左右 padding 各 30；与 PdfPreviewModal 保持一致
const PAGE_CONTENT_WIDTH = 782;

// ─── 样式 ──────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: '20pt 30pt',
    fontFamily: 'Noto Sans SC',
    fontSize: 8,
  },
  table: {
    width: '100%',
  },
  thead: {
    flexDirection: 'row',
    backgroundColor: '#f9fafb',
    borderBottom: '1 solid #d1d5db',
  },
  th: {
    flex: 1,
    padding: '4 3',
    borderRight: '1 solid #d1d5db',
  },
  thLast: {
    flex: 1,
    padding: '4 3',
  },
  thText: {
    fontSize: 7,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  row: {
    flexDirection: 'row',
    borderBottom: '1 solid #e5e7eb',
  },
  td: {
    flex: 1,
    padding: '3 3',
    borderRight: '1 solid #e5e7eb',
    justifyContent: 'flex-start',
  },
  tdLast: {
    flex: 1,
    padding: '3 3',
    justifyContent: 'flex-start',
  },
  stockName: {
    fontSize: 8,
    fontWeight: 'medium',
    color: '#111827',
    marginBottom: 2,
  },
  priceLine: {
    fontSize: 6,
    color: '#6b7280',
    marginBottom: 1,
  },
  priceLineVal: {
    fontSize: 6,
    color: '#1d4ed8',
    marginBottom: 1,
  },
  cardBase: {
    padding: '1 3',
    borderRadius: 2,
    marginBottom: 2,
    border: '1 solid #d1d5db',
    backgroundColor: '#f3f4f6',
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
  },
  strategyGroupCell: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  cardRedBg: {
    backgroundColor: '#fee2e2',
    borderColor: '#fecaca',
  },
  cardCustom: {
    borderStyle: 'dashed',
    borderColor: '#d8b4fe',
    backgroundColor: '#faf5ff',
  },
  watchlistWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: 8,
    padding: '4 6',
    border: '1 solid #e5e7eb',
    borderRadius: 4,
  },
  watchlistLabel: {
    fontSize: 8,
    color: '#6b7280',
    marginRight: 4,
  },
  watchlistChip: {
    padding: '1 4',
    borderRadius: 2,
    border: '1 solid #bfdbfe',
    backgroundColor: '#eff6ff',
    marginRight: 3,
    marginBottom: 3,
  },
  watchlistChipText: {
    fontSize: 7,
    color: '#1e40af',
  },
  pageNum: {
    position: 'absolute',
    bottom: 15,
    right: 30,
    fontSize: 7,
    color: '#9ca3af',
  },
});

// ─── 策略卡片 ──────────────────────────────────────────────────────
// 中文没有空格，react-pdf 的断行器不会在字符间断行，必须自己按字体度量分行（见 pdfTextWrap）
const StrategyCardPdf: React.FC<{
  item: StrategyItem;
  journal: TradingJournal;
  spacing?: number;
  priceLevelCodes?: Record<number, string>;
  maxTextWidth: number;
}> = ({ item, journal, spacing, priceLevelCodes, maxTextWidth }) => {
  const sid = item.strategyId;
  // 隐藏的策略不在 PDF 中渲染（网页端其余场景仍正常显示）
  if (journal.strategyHidden?.includes(sid)) return null;
  const isBold = journal.strategyBold.includes(sid);
  const isRed = journal.strategyRed.includes(sid);
  const isRedText = journal.strategyRedText.includes(sid);

  const cardStyle: any[] = [s.cardBase];
  if (isRed) cardStyle.push(s.cardRedBg);
  if (item.isCustom) cardStyle.push(s.cardCustom);
  if (spacing != null) cardStyle.push({ marginRight: spacing, marginBottom: spacing });

  let color = '#374151'; // gray-700
  if (isRed) color = '#991b1b'; // red-800
  else if (isRedText) color = '#dc2626'; // red-600
  else if (item.isCustom) color = '#7e22ce'; // purple-700

  const fontSize = 7;
  const textRuns: PdfTextRun[] = resolvePriceCodeSegments(item.text, journal.priceLevels, priceLevelCodes)
    .map(seg => ({ text: seg.text, color: seg.isHardStop ? '#dc2626' : undefined }));
  const lines = wrapRuns(textRuns, maxTextWidth, fontSize, isBold ? 700 : 400);

  return (
    <View style={cardStyle}>
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontSize,
            fontWeight: isBold ? 'bold' as const : 'normal' as const,
            color,
          }}
        >
          {line.map((seg, j) => (
            <Text key={j} style={seg.color ? { color: seg.color } : {}}>{seg.text}</Text>
          ))}
        </Text>
      ))}
    </View>
  );
};

// ─── 价格上涨 ──────────────────────────────────────────────────────
const PriceLevelsPdf: React.FC<{ journal: TradingJournal; maxTextWidth: number }> = ({ journal, maxTextWidth }) => {
  const levels = journal.priceLevels || [];
  const closePrice = getClosePrice(levels);
  return (
    <>
      {PRICE_LABELS.map((label, i) => {
        const val = levels[i] || '';
        const gainSegments = GAIN_PRICE_INDEXES.includes(i) ? computeGainSegments(val, closePrice) : null;
        const segments = gainSegments ?? (val ? [{ text: val, isGain: false }] : null);
        const effectiveLabel = i === 1 && val ? '硬止损：' : label;
        const isHardStop = i === 1 && !!val;
        const runs: PdfTextRun[] = [{ text: effectiveLabel }];
        for (const seg of segments ?? []) {
          runs.push({ text: seg.text, color: seg.isGain || isHardStop ? '#dc2626' : undefined });
        }
        // 价位值也可能很长（带涨幅百分比），同样按字符换行，避免越过列线
        const lines = wrapRuns(runs, maxTextWidth, 6);
        return (
          <View key={i}>
            {lines.map((line, li) => (
              <Text key={li} style={val ? s.priceLineVal : s.priceLine}>
                {line.map((seg, si) => (
                  <Text key={si} style={seg.color ? { color: seg.color } : {}}>{seg.text}</Text>
                ))}
              </Text>
            ))}
          </View>
        );
      })}
    </>
  );
};

// ─── 后续可关注 ────────────────────────────────────────────────────
const WatchlistPdf: React.FC<{ watchlist: string[] }> = ({ watchlist }) => {
  if (!watchlist || watchlist.length === 0) return null;
  return (
    <View style={s.watchlistWrap}>
      <Text style={s.watchlistLabel}>后续可关注：</Text>
      {watchlist.map((name, i) => (
        <View key={i} style={s.watchlistChip}>
          <Text style={s.watchlistChipText}>{name}</Text>
        </View>
      ))}
    </View>
  );
};
WatchlistPdf.displayName = 'WatchlistPdf';

// ─── 表头行 ────────────────────────────────────────────────────────
const TableHeader: React.FC<{ groupNames: string[]; colWidths?: number[]; date?: string }> = ({ groupNames, colWidths, date }) => (
  <View style={s.thead} fixed>
    <View style={headerCellStyle(0, groupNames.length, colWidths)}>
      <Text style={s.thText}>股票名称 {date}</Text>
    </View>
    {groupNames.map((name, i) => (
      <View key={i} style={headerCellStyle(i + 1, groupNames.length, colWidths)}>
        <Text style={s.thText}>{name}</Text>
      </View>
    ))}
  </View>
);
TableHeader.displayName = 'TableHeader';

// 列宽：提供 colWidths 时使用固定 pt 宽度，否则等分
function colWidthStyle(colIdx: number, colWidths?: number[]) {
  if (colWidths && colWidths[colIdx] != null) {
    return { flexGrow: 0, flexShrink: 0, flexBasis: colWidths[colIdx] };
  }
  return { flex: 1 };
}

function headerCellStyle(colIdx: number, groupCount: number, colWidths?: number[]) {
  return [colIdx === groupCount ? s.thLast : s.th, colWidthStyle(colIdx, colWidths)];
}

function bodyCellStyle(colIdx: number, groupCount: number, colWidths?: number[]) {
  return [colIdx === groupCount ? s.tdLast : s.td, colWidthStyle(colIdx, colWidths)];
}

// ─── 分页逻辑 ──────────────────────────────────────────────────────
// 复用表头组件避免嵌套 Page 的问题

// ─── 文档 ──────────────────────────────────────────────────────────
export const JournalPdfDocument: React.FC<Props> = ({
  rows,
  groupIds,
  groupNames,
  colWidths,
  rowSpacing,
  priceLevelCodes,
  watchlist,
}) => {
  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
  const today = new Date().toLocaleDateString('zh-CN');

  if (totalPages <= 1) {
    return (
      <Document title={`当前交易_${today}`}>
        <Page size="A4" orientation="landscape" style={s.page}>
          <View style={s.table}>
            <TableHeader groupNames={groupNames} colWidths={colWidths} date={today} />
            {rows.map((row, idx) => (
              <DataRow
                key={row.journal.id}
                row={row}
                groupIds={groupIds}
                rowIdx={idx}
                colWidths={colWidths}
                rowSpacing={rowSpacing}
                priceLevelCodes={priceLevelCodes}
              />
            ))}
            <WatchlistPdf watchlist={watchlist || []} />
          </View>
        </Page>
      </Document>
    );
  }

  // 多页
  return (
    <Document title={`当前交易_${today}`}>
      {Array.from({ length: totalPages }, (_, pageIdx) => {
        const start = pageIdx * ROWS_PER_PAGE;
        const pageRows = rows.slice(start, start + ROWS_PER_PAGE);
        return (
          <Page
            key={pageIdx}
            size="A4"
            orientation="landscape"
            style={s.page}
          >
            <View style={s.table}>
              <TableHeader groupNames={groupNames} colWidths={colWidths} date={today} />
              {pageRows.map((row, idx) => (
                <DataRow
                  key={row.journal.id}
                  row={row}
                  groupIds={groupIds}
                  rowIdx={start + idx}
                  colWidths={colWidths}
                  rowSpacing={rowSpacing}
                  priceLevelCodes={priceLevelCodes}
                />
              ))}
              {pageIdx === totalPages - 1 && <WatchlistPdf watchlist={watchlist || []} />}
            </View>
          </Page>
        );
      })}
    </Document>
  );
};

// ─── 数据行 ────────────────────────────────────────────────────────
const DataRow: React.FC<{
  row: JournalRow;
  groupIds: string[];
  rowIdx: number;
  colWidths?: number[];
  rowSpacing?: number;
  priceLevelCodes?: Record<number, string>;
}> = ({ row, groupIds, rowIdx, colWidths, rowSpacing, priceLevelCodes }) => {
  const { journal, grouped } = row;
  const bgColor = ROW_COLORS[rowIdx % ROW_COLORS.length];
  // 列宽：未指定时按页宽等分；文字可用宽度要扣掉单元格/卡片的内边距与边框
  const columnWidth = (idx: number) =>
    colWidths?.[idx] ?? Math.round(PAGE_CONTENT_WIDTH / (groupIds.length + 1));

  return (
    <View style={[s.row, { backgroundColor: bgColor }]} wrap={false}>
      {/* 名称列 */}
      <View style={bodyCellStyle(0, groupIds.length, colWidths)}>
        <Text style={s.stockName}>{journal.stockName || '-'}</Text>
        <PriceLevelsPdf journal={journal} maxTextWidth={cellTextWidth(columnWidth(0))} />
      </View>
      {/* 策略组列 */}
      {groupIds.map((gid, i) => {
        const items = grouped[gid] || [];
        return (
          <View key={gid} style={[...bodyCellStyle(i + 1, groupIds.length, colWidths), s.strategyGroupCell]}>
            {items.map(item => (
              <StrategyCardPdf
                key={item.strategyId}
                item={item}
                journal={journal}
                spacing={rowSpacing}
                priceLevelCodes={priceLevelCodes}
                maxTextWidth={cardTextWidth(columnWidth(i + 1))}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
};
DataRow.displayName = 'DataRow';
