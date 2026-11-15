// 由 functions/_lib/d1/schema.json 生成 schema.sql
// 用法：node scripts/generate-schema-sql.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const source = new URL('../functions/_lib/d1/schema.json', import.meta.url);
const target = new URL('../schema.sql', import.meta.url);

const definitions = JSON.parse(readFileSync(source, 'utf8'));
const statements = definitions.map(def => `${def.sql.trim().replace(/;\s*$/, '')};`);
const content = `-- 由 scripts/generate-schema-sql.mjs 生成，请勿手改\n-- 源文件：functions/_lib/d1/schema.json\n\n${statements.join('\n\n')}\n`;

writeFileSync(target, content);
console.log(`schema.sql 已生成：${statements.length} 条语句`);
