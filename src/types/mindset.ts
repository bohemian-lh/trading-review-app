// 心态管理和策略 — 数据类型

export interface MindsetRow {
  id: string;
  level: string;       // 等级，如 "等级1（轻微失控）"
  phenomenon: string;  // 现象
  strategy: string;    // 策略
  checked: boolean;    // 勾选状态（localStorage 缓存）
}

export const DEFAULT_MINDSET_ROWS: MindsetRow[] = [
  {
    id: 'm1',
    level: '等级1（轻微失控）',
    phenomenon: '',
    strategy: '',
    checked: false,
  },
  {
    id: 'm2',
    level: '等级2（失控）',
    phenomenon: '',
    strategy: '',
    checked: false,
  },
  {
    id: 'm3',
    level: '等级3（严重失控）',
    phenomenon: '',
    strategy: '',
    checked: false,
  },
];
