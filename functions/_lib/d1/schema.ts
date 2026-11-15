// D1 schema 定义
// 单一事实来源：functions/_lib/d1/schema.json
//   - 运行时由本文件读取（只在显式开启 D1_AUTO_MIGRATE=1 时建表）
//   - 部署期由 scripts/generate-schema-sql.mjs 生成 schema.sql
// DATASET_SCOPED_TABLES 也从同一份数据派生，新增表不会漏掉级联清理。
import schemaDefs from './schema.json';

interface SchemaDef {
  table: string;
  kind: 'table' | 'index';
  scoped: boolean;
  sql: string;
}

const definitions = schemaDefs as SchemaDef[];

/** 全部 DDL，按定义顺序执行 */
export const SCHEMA: string[] = definitions.map(def => def.sql);

/** 删除数据集时要级联清理的表（由 scoped=true 的表自动生成） */
export const DATASET_SCOPED_TABLES: string[] = definitions
  .filter(def => def.kind === 'table' && def.scoped)
  .map(def => def.table);

let schemaPromise: Promise<void> | null = null;

/** 建表（仅迁移/首次部署使用）；每个 isolate 只执行一次，失败不缓存 */
export function ensureSchemaOnce(db: any): Promise<void> {
  if (!schemaPromise) {
    schemaPromise = db
      .batch(SCHEMA.map(sql => db.prepare(sql)))
      .then(() => undefined)
      .catch((e: unknown) => {
        schemaPromise = null;
        throw e;
      });
  }
  return schemaPromise;
}

/**
 * 运行时入口：默认不建表。
 * 建表应由 `npm run db:schema` 在部署/迁移时执行一次，避免每次冷启动白跑十几条 DDL。
 * 本地调试可设 D1_AUTO_MIGRATE=1 临时恢复自动建表。
 */
export function ensureSchemaReady(env: any): Promise<void> {
  if (env?.D1_AUTO_MIGRATE !== '1') return Promise.resolve();
  return ensureSchemaOnce(env.D1SQL);
}
