// PDF 文本换行工具
//
// 背景（根因）：
//   @react-pdf 4.5.x 的换行只在「空格分出的 syllable」和 hyphenationCallback 给出的音节之间断行
//   （textkit: `string.split(/([ ]+)/g)` → syllables）。中文句子没有空格，
//   整段就是一个不可断的 box，于是文本会按 max-content 宽度直接画出列外；
//   容器的 maxWidth / flexShrink 只约束盒子，不会给文本制造断行点。
//   而用 hyphenationCallback 按字拆分会走「penalty + 连字符」分支，
//   换行处会被插入一个 '-'（就是 PDF 里策略尾部莫名多出来的横线）。
//
// 做法：用已注册字体的真实度量（fontkit）按字符软换行，渲染成多行 Text，
//   既不会溢出单元格，也不会产生连字符；同时保留分段颜色（硬止损/涨幅红色）。
import { Font } from '@react-pdf/renderer';

const FONT_FAMILY = 'Noto Sans SC';

export interface PdfTextRun {
  text: string;
  /** 片段颜色（如硬止损、涨幅百分比） */
  color?: string;
}

type FontWeight = 400 | 700;

// 字符宽度缓存：key = `${weight}|${char}`，value = em 宽度
const charWidthCache = new Map<string, number>();

/** 字体不可用时的估算：CJK/全角 1em，数字 0.55em，其它 0.6em */
function fallbackCharWidthEm(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x2e80) return 1;
  if (ch === ' ') return 0.3;
  if (code >= 0x30 && code <= 0x39) return 0.55;
  return 0.6;
}

/** 单个字符的宽度（pt） */
function measureChar(ch: string, fontSize: number, fontWeight: FontWeight): number {
  const key = `${fontWeight}|${ch}`;
  let em = charWidthCache.get(key);
  if (em === undefined) {
    em = fallbackCharWidthEm(ch);
    try {
      // FontStore 暴露的字体实例带 fontkit 度量，注册并 load 之后才可用
      const source: any = Font.getFont({ fontFamily: FONT_FAMILY, fontWeight });
      const font: any = source?.data;
      if (font?.layout && font?.unitsPerEm) {
        const run = font.layout(ch);
        const width = (run?.glyphs ?? []).reduce((acc: number, g: any) => acc + (g.advanceWidth ?? 0), 0);
        if (width > 0) em = width / font.unitsPerEm;
      }
    } catch { /* 字体未就绪时退回估算，CJK 仍是精确的 1em */ }
    charWidthCache.set(key, em);
  }
  return em * fontSize;
}

// 避头尾：行首不留收尾标点，行尾不留开头标点
const NO_LINE_START = new Set('，。、；：！？）》」』】,.!?:;)]}%');
const NO_LINE_END = new Set('（《「『【([{');

/** 单元格里可用于文字的宽度：减去单元格 padding(3+3) 与卡片 padding(3+3)/边框(1+1) */
export function cardTextWidth(colWidth: number): number {
  return Math.max(8, colWidth - 14);
}

/** 单元格里可用于文字的宽度（无卡片包裹时）：减去单元格 padding(3+3) */
export function cellTextWidth(colWidth: number): number {
  return Math.max(8, colWidth - 6);
}

interface WrapCell {
  ch: string;
  color?: string;
  width: number;
}

function toRuns(cells: WrapCell[]): PdfTextRun[] {
  const out: PdfTextRun[] = [];
  for (const cell of cells) {
    const last = out[out.length - 1];
    if (last && last.color === cell.color) last.text += cell.ch;
    else out.push({ text: cell.ch, color: cell.color });
  }
  return out;
}

/**
 * 按字符软换行（CJK 友好）。
 * @returns 每一行一组带颜色的片段；行内总宽度不超过 maxWidth
 */
export function wrapRuns(
  runs: PdfTextRun[],
  maxWidth: number,
  fontSize: number,
  fontWeight: FontWeight = 400,
): PdfTextRun[][] {
  const lines: PdfTextRun[][] = [];
  let line: WrapCell[] = [];
  let lineWidth = 0;

  const pushLine = (cells: WrapCell[]) => {
    lines.push(toRuns(cells));
  };

  for (const run of runs) {
    for (const ch of Array.from(run.text ?? '')) {
      if (ch === '\n') {
        pushLine(line);
        line = [];
        lineWidth = 0;
        continue;
      }
      const width = measureChar(ch, fontSize, fontWeight);
      if (line.length > 0 && lineWidth + width > maxWidth) {
        let breakAt = line.length;
        const lastCh = line[line.length - 1].ch;

        // 1) 正在拼接的数字/金额串：整段 token 一起换行（token 自己能放进一行时）
        if (isTokenChar(ch) && isTokenChar(lastCh)) {
          let tokenStart = line.length;
          while (tokenStart > 0 && isTokenChar(line[tokenStart - 1].ch)) tokenStart -= 1;
          const tailWidth =
            line.slice(tokenStart).reduce((acc, cell) => acc + cell.width, 0) + width;
          if (tokenStart > 0 && tailWidth <= maxWidth) {
            breakAt = tokenStart;
          } else {
            // token 比整行还长：退而求其次，在区间符 '~' 之后断开，别把价格拦腰截断
            for (let k = line.length - 1; k > 0; k -= 1) {
              if (line[k].ch === '~') {
                breakAt = k + 1;
                break;
              }
            }
          }
        }

        // 2) 避头尾：收尾标点不落行首、开头标点不留行尾（连带前面的 token 一起下移）
        if (breakAt === line.length && line.length > 2 && (NO_LINE_START.has(ch) || NO_LINE_END.has(lastCh))) {
          let start = line.length - 1;
          if (isTokenChar(lastCh)) {
            while (start > 0 && isTokenChar(line[start - 1].ch)) start -= 1;
          }
          if (start > 0) breakAt = start;
        }

        const carry = line.slice(breakAt);
        pushLine(line.slice(0, breakAt));
        line = carry;
        lineWidth = carry.reduce((acc, cell) => acc + cell.width, 0);
      }
      line.push({ ch, color: run.color, width });
      lineWidth += width;
    }
  }
  if (line.length > 0) pushLine(line);
  return lines.length > 0 ? lines : [[]];
}

/** 拉丁字母 / 数字 / 金额符号视为一个不可拆开的 token */
function isTokenChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= 0x2e80) return false; // CJK、全角标点按字符断行
  return /[0-9A-Za-z.%()_+\-/:~]/.test(ch);
}
