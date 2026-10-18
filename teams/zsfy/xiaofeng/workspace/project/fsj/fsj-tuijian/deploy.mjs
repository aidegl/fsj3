#!/usr/bin/env node
/**
 * fsj-tuijian 一键部署到宝塔（web-deploy 服务）
 * 文档来源：HAP shangpin 表 rowid 3b380799-cd64-4ad0-8ad5-77153ef3254b
 *
 * 用法：
 *   node deploy.mjs                  # 默认 project=playground（先试传，目检后再上正式）
 *   node deploy.mjs tuijian          # 部署到正式项目（需服务器白名单已加 tuijian）
 *   DEPLOY_TOKEN=xxx node deploy.mjs # token 走环境变量
 *
 * token 二选一：环境变量 DEPLOY_TOKEN，或项目根 deploy.config.json {"token":"..."}
 * ⚠️ deploy.config.json 不要提交进 git（安全约定：token 不落提交记录）
 */
import { readFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative, extname, sep } from 'path';

const project = process.argv[2] || 'playground';
const ROOT = process.cwd();

// ---- token ----
let token = process.env.DEPLOY_TOKEN || '';
if (!token) {
  const cfgPath = join(ROOT, 'deploy.config.json');
  if (existsSync(cfgPath)) {
    try { token = JSON.parse(readFileSync(cfgPath, 'utf8')).token || ''; } catch (e) { /* ignore */ }
  }
}
if (!token) {
  console.error('缺少 token：设 DEPLOY_TOKEN 环境变量，或创建 deploy.config.json 内容 {"token":"..."}');
  process.exit(1);
}

// ---- 收集文件 ----
const EXCLUDE_DIRS = new Set(['node_modules', '.git']);
const EXCLUDE_FILES = [/^stage1-shot/, /^_/, /^deploy-package\.json$/]; // 截图/临时文档(_开头)/打包中间产物
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.svg', '.txt']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full).split(sep).join('/');
    const st = statSync(full);
    if (st.isDirectory()) {
      if (!EXCLUDE_DIRS.has(name)) walk(full, out);
    } else if (!EXCLUDE_FILES.some(re => re.test(rel))) {
      out.push({ full, rel });
    }
  }
  return out;
}

const files = walk(ROOT).map(({ full, rel }) => {
  const isText = TEXT_EXT.has(extname(full).toLowerCase());
  return {
    path: rel,
    content: isText ? readFileSync(full, 'utf8') : readFileSync(full).toString('base64'),
    ...(isText ? {} : { encoding: 'base64' })
  };
});

// ---- 部署（增量，不用 clean:true）----
console.log(`部署 ${files.length} 个文件 → project=${project} ...`);
const res = await fetch('https://100000whys.cn/deploy/deploy', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-deploy-token': token },
  body: JSON.stringify({ project, files })
});
const data = await res.json();
if (data.ok) {
  console.log(`✅ 部署成功 release=${data.release} 回滚点=${data.rollbackTo}`);
  if (data.pm2) console.log('pm2:', JSON.stringify(data.pm2));
  console.log(`回滚: node -e "fetch('https://100000whys.cn/deploy/rollback',{method:'POST',headers:{'Content-Type':'application/json','x-deploy-token':process.env.DEPLOY_TOKEN},body:'{\\"project\\":\\"${project}\\"}').then(r=>r.json()).then(console.log)"`);
} else {
  console.error('❌ 部署失败:', data.error || JSON.stringify(data));
  process.exit(1);
}