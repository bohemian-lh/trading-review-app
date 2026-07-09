// 对赌决策质量控制表 — 数据类型

export interface DecisionCheckItem {
  id: string;
  label: string;        // 分类标签（大盘情况/决策参考/标的/最终决策），空字符串表示合并单元格
  question: string;     // 判断项文本
  checked: boolean;     // 勾选状态（localStorage 缓存）
  /** 合并单元格 span（用于渲染） */
  colSpan?: number;
}
