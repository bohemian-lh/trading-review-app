import React from 'react';
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer';
import type { TradingJournal } from '@/types';

// ─── 注册中文字体（本地文件，不依赖 CDN）─────────────────────────
// Helvetica 不支持中文，注册 Noto Sans SC（public/fonts/ 目录）
Font.register({
  family: 'Noto Sans SC',
  fonts: [
    {
      src: '/fonts/noto-sans-sc-regular.ttf',
      fontWeight: 400,
    },
    {
      src: '/fonts/noto-sans-sc-bold.ttf',
      fontWeight: 700,
    },
  ],
});

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
}

// ─── 固定配置 ──────────────────────────────────────────────────────
const PRICE_LABELS = ['', '', '目标位：', '压力1：', '压力2：'];
const ROW_COLORS = ['#f0fdf4', '#fefce8', '#eff6ff']; // green50/yellow50/blue50
const ROWS_PER_PAGE = 25;

// ─── 样式 ──────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page: {
    padding: '20pt 30pt',
    fontFamily: 'Noto Sans SC',
    fontSize: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#111827',
  },
  subtitle: {
    fontSize: 8,
    color: '#6b7280',
    marginBottom: 12,
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
  pageNum: {
    position: 'absolute',
    bottom: 15,
    right: 30,
    fontSize: 7,
    color: '#9ca3af',
  },
});

// ─── 策略卡片 ──────────────────────────────────────────────────────
const StrategyCardPdf: React.FC<{
  item: StrategyItem;
  journal: TradingJournal;
}> = ({ item, journal }) => {
  const sid = item.strategyId;
  const isBold = journal.strategyBold.includes(sid);
  const isRed = journal.strategyRed.includes(sid);
  const isRedText = journal.strategyRedText.includes(sid);

  const cardStyle: any[] = [s.cardBase];
  if (isRed) cardStyle.push(s.cardRedBg);
  if (item.isCustom) cardStyle.push(s.cardCustom);

  let color = '#374151'; // gray-700
  if (isRed) color = '#991b1b'; // red-800
  else if (isRedText) color = '#dc2626'; // red-600
  else if (item.isCustom) color = '#7e22ce'; // purple-700

  return (
    <View style={cardStyle}>
      <Text style={{
        fontSize: 7,
        fontWeight: isBold ? 'bold' as const : 'normal' as const,
        color,
      }}>
        {item.text}
      </Text>
    </View>
  );
};

// ─── 价格上涨 ──────────────────────────────────────────────────────
const PriceLevelsPdf: React.FC<{ journal: TradingJournal }> = ({ journal }) => {
  const levels = journal.priceLevels || [];
  return (
    <>
      {PRICE_LABELS.map((label, i) => {
        const val = levels[i] || '';
        return (
          <Text key={i} style={val ? s.priceLineVal : s.priceLine}>
            {label}{val || (label ? label : '')}
          </Text>
        );
      })}
    </>
  );
};

// ─── 表头行 ────────────────────────────────────────────────────────
const TableHeader: React.FC<{ groupNames: string[] }> = ({ groupNames }) => (
  <View style={s.thead} fixed>
    <View style={s.th}>
      <Text style={s.thText}>股票名称</Text>
    </View>
    {groupNames.map((name, i) => (
      <View key={i} style={i === groupNames.length - 1 ? s.thLast : s.th}>
        <Text style={s.thText}>{name}</Text>
      </View>
    ))}
  </View>
);
TableHeader.displayName = 'TableHeader';

// ─── 分页逻辑 ──────────────────────────────────────────────────────
// 复用表头组件避免嵌套 Page 的问题

// ─── 文档 ──────────────────────────────────────────────────────────
export const JournalPdfDocument: React.FC<Props> = ({
  rows,
  groupIds,
  groupNames,
}) => {
  const totalRows = rows.length;
  const totalPages = Math.ceil(totalRows / ROWS_PER_PAGE);
  const today = new Date().toLocaleDateString('zh-CN');

  if (totalPages <= 1) {
    return (
      <Document title={`当前交易_${today}`}>
        <Page size="A4" orientation="landscape" style={s.page}>
          <Text style={s.title}>当前交易导出</Text>
          <Text style={s.subtitle}>{today}  共{totalRows}条  第1/1页</Text>
          <View style={s.table}>
            <TableHeader groupNames={groupNames} />
            {rows.map((row, idx) => (
              <DataRow
                key={row.journal.id}
                row={row}
                groupIds={groupIds}
                rowIdx={idx}
              />
            ))}
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
            <Text style={s.title}>当前交易导出</Text>
            <Text style={s.subtitle}>
              {today}  共{totalRows}条  第{pageIdx + 1}/{totalPages}页
            </Text>
            <View style={s.table}>
              <TableHeader groupNames={groupNames} />
              {pageRows.map((row, idx) => (
                <DataRow
                  key={row.journal.id}
                  row={row}
                  groupIds={groupIds}
                  rowIdx={start + idx}
                />
              ))}
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
}> = ({ row, groupIds, rowIdx }) => {
  const { journal, grouped } = row;
  const bgColor = ROW_COLORS[rowIdx % ROW_COLORS.length];

  return (
    <View style={[s.row, { backgroundColor: bgColor }]} wrap={false}>
      {/* 名称列 */}
      <View style={s.td}>
        <Text style={s.stockName}>{journal.stockName || '-'}</Text>
        <PriceLevelsPdf journal={journal} />
      </View>
      {/* 策略组列 */}
      {groupIds.map((gid, i) => {
        const items = grouped[gid] || [];
        return (
          <View key={gid} style={i === groupIds.length - 1 ? s.tdLast : s.td}>
            {items.map(item => (
              <StrategyCardPdf
                key={item.strategyId}
                item={item}
                journal={journal}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
};
DataRow.displayName = 'DataRow';
