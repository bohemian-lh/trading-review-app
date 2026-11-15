// PDF 文本换行工具的单测
// 覆盖：中文长文本按字符换行不越界、颜色片段保留、硬换行、数字/金额 token 不被拆开。
import { describe, expect, it } from 'vitest';
import { wrapRuns, cardTextWidth, cellTextWidth, type PdfTextRun } from './pdfTextWrap';

// 估算宽度（字体不可用时 wrapRuns 内部也走同一套估算：CJK 1em、数字 0.55em、其它 0.6em）
function estimateWidth(runs: PdfTextRun[], fontSize: number): number {
  let em = 0;
  for (const run of runs) {
    for (const ch of Array.from(run.text)) {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0x2e80) em += 1;
      else if (ch === ' ') em += 0.3;
      else if (code >= 0x30 && code <= 0x39) em += 0.55;
      else em += 0.6;
    }
  }
  return em * fontSize;
}

describe('pdfTextWrap / 中文软换行', () => {
  it('长中文文本按字符换行，每行不超过可用宽度', () => {
    const text = '这是一条没有价位代码但很长很长的自定义策略文本用来对比换行行为是否一致';
    const maxWidth = 99;
    const lines = wrapRuns([{ text }], maxWidth, 7);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(estimateWidth(line, 7)).toBeLessThanOrEqual(maxWidth + 0.01);
    }
    expect(lines.map(line => line.map(r => r.text).join('')).join('')).toBe(text);
  });

  it('保留片段颜色（硬止损红色）', () => {
    const lines = wrapRuns(
      [
        { text: '硬止损订在' },
        { text: '13.7', color: '#dc2626' },
        { text: '，跌破就走' },
      ],
      46,
      7,
    );
    const red = lines.flat().filter(r => r.color === '#dc2626');
    expect(red.length).toBeGreaterThan(0);
    expect(red.map(r => r.text).join('')).toBe('13.7');
  });

  it('显式换行符强制分行', () => {
    const lines = wrapRuns([{ text: '第一行\n第二行' }], 200, 7);
    expect(lines.length).toBe(2);
    expect(lines[0].map(r => r.text).join('')).toBe('第一行');
    expect(lines[1].map(r => r.text).join('')).toBe('第二行');
  });

  it('数字/金额 token 尽量整体换行，不被拆开', () => {
    const lines = wrapRuns([{ text: '止损设在2.35，反弹就减' }], 46, 7);
    const flat = lines.map(line => line.map(r => r.text).join(''));
    // 2.35 不应被拆到两行
    expect(flat.some(line => line.includes('2.35'))).toBe(true);
    for (const line of flat) {
      expect(estimateWidth([{ text: line }], 7)).toBeLessThanOrEqual(46 + 7);
    }
  });

  it('超长区间值优先在 ~ 之后换行，不拦腰截断价格', () => {
    const lines = wrapRuns([{ text: '15.14(7.4%)~15.70(11.3%)' }], 60, 7);
    const flat = lines.map(line => line.map(r => r.text).join(''));
    expect(flat[0]).toBe('15.14(7.4%)~');
    expect(flat[1]).toBe('15.70(11.3%)');
  });

  it('列宽换算：卡片与普通单元格分别扣掉内边距与边框', () => {
    expect(cardTextWidth(113)).toBe(99);
    expect(cellTextWidth(122)).toBe(116);
    expect(cardTextWidth(20)).toBe(8);
  });
});
