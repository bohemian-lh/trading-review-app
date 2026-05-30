# 定时任务脚本使用说明

## 功能概述

此脚本用于自动更新交易复盘数据的统计报表。

### 主要功能

1. 检查表1（交易复盘数据）是否有新增数据
2. 如果有新增数据，自动计算并更新表2（动态数据分析）和表3（月度统计）
3. 三个表分别保存为三个独立的 Excel 文件
4. 支持定时任务模式，每天0:00自动执行

## 目录结构

```
scripts/
├── updateStats.js    # 主脚本
├── package.json      # Node.js 依赖配置
├── README.md         # 本文档
├── data/             # 输入数据目录
│   ├── 表1-交易复盘数据.xlsx
│   └── state.json    # 状态文件（自动生成）
└── output/           # 输出目录（自动生成）
    ├── 表1-交易复盘数据.xlsx
    ├── 表2-动态数据分析.xlsx
    └── 表3-月度统计.xlsx
```

## 快速开始

### 1. 安装依赖

```bash
cd scripts
npm install
```

### 2. 准备数据

将表1的 Excel 文件放置在 `data` 目录下：
- 文件名：`表1-交易复盘数据.xlsx`
- 工作表名：`表1-交易复盘数据`

### 3. 运行脚本（单次执行）

```bash
npm run update
```

或者：

```bash
node updateStats.js
```

### 4. 启动定时任务

```bash
npm start
```

或者手动指定 cron 模式：

```bash
node updateStats.js --cron
```

## 定时任务设置

### macOS/Linux (使用 crontab)

1. 打开终端
2. 编辑 crontab：`crontab -e`
3. 添加以下行（每天0:00执行）：

```bash
0 0 * * * cd /Users/dp/Documents/复盘/trading-review-app/scripts && /usr/local/bin/node updateStats.js >> /Users/dp/Documents/复盘/trading-review-app/scripts/logs/update.log 2>&1
```

4. 保存并退出

### Windows (使用任务计划程序)

1. 打开"任务计划程序"
2. 创建基本任务
3. 设置触发器：每天 0:00
4. 设置操作：启动程序
   - 程序/脚本：`node.exe` 的完整路径
   - 参数：`updateStats.js`
   - 起始位置：`scripts` 目录的完整路径

## 数据检查逻辑

脚本会检查以下内容来判断是否有新数据：

1. **记录总数变化**：如果当前记录数超过上次保存的记录数
2. **开单时间集合变化**：比较所有记录的"开单时间"集合是否发生变化

只有检测到变化时，才会重新计算统计数据并更新文件。

## 状态管理

脚本会在 `data/state.json` 中保存状态：

```json
{
  "lastRecordCount": 100,
  "lastOpenDates": ["20250101", "20250102", ...],
  "lastUpdateTime": "2025-01-15T00:00:00.000Z"
}
```

状态文件用于判断是否有新增数据，请勿手动修改。

## 输出文件说明

### 表1：交易复盘数据
- 文件名：`表1-交易复盘数据.xlsx`
- 包含所有原始交易记录

### 表2：动态数据分析
- 文件名：`表2-动态数据分析.xlsx`
- 包含以下指标：
  - 系统盈利胜率
  - 系统无失误盈利胜率
  - 系统有失误盈利胜率
  - 非系统盈利胜率
  - 系统盈利平均持仓天数
  - 系统亏损平均持仓天数
  - 非系统盈利平均持仓天数
  - 非系统亏损平均持仓天数

### 表3：月度统计
- 文件名：`表3-月度统计.xlsx`
- 按月份统计所有指标

## 命令行参数

- `node updateStats.js`：单次执行
- `node updateStats.js --cron` 或 `node updateStats.js -c`：启动定时任务模式（每天0:00执行）

## 注意事项

1. 确保 `data` 目录存在且包含有效的 Excel 文件
2. 确保脚本有 `output` 目录的写入权限
3. 建议定期备份 `data/state.json` 文件
4. 如果需要修改定时执行时间，修改 `updateStats.js` 中的 cron 表达式：
   ```javascript
   cron.schedule('0 0 * * *', () => { ... });
   ```
   格式：分 时 日 月 周

## 日志输出

脚本会在控制台输出详细日志，包括：
- 执行时间
- 数据检查结果
- 更新状态
- 错误信息（如果有）

建议将日志重定向到文件以便排查问题。
