// 存储后端开关
// 约定：仅当显式设置 DATA_STORE=d1 且存在 D1SQL 绑定时才走 D1；
// 其余情况（未绑定 D1 / DATA_STORE=r2）自动回退 R2，作为维护窗口的一键回滚。
export function shouldUseD1(env: any): boolean {
  return !!env?.D1SQL && env?.DATA_STORE === 'd1';
}
