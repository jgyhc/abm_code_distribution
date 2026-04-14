import * as XLSX from "xlsx";

interface Env {
  DB: D1Database;
  ADMIN_API_KEY?: string;
}

interface AppSummary {
  id: number;
  app_name: string;
  updated_at: string;
  total_count: number;
  used_count: number;
  unused_count: number;
}

interface RedeemRecord {
  id: number;
  redeem_code: string;
  redeem_url: string;
}

interface ParsedCsvRecord {
  redeemCode: string;
  redeemUrl: string;
  used: 0 | 1;
}

interface ParsedCsvResult {
  appName: string;
  records: ParsedCsvRecord[];
  invalidRows: number[];
}

interface TextReadableFile {
  text: () => Promise<string>;
}

interface BinaryReadableFile {
  arrayBuffer: () => Promise<ArrayBuffer>;
  name?: string;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function createQrImageUrl(text: string, size = 260): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
}

function isIosUserAgent(userAgent: string): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent);
}

/**
 * 统一管理端鉴权读取逻辑：
 * 支持 header、query、form 三种来源，便于页面与接口复用。
 */
function extractAdminToken(request: Request, url: URL, formToken?: string): string {
  return formToken ?? request.headers.get("x-admin-token") ?? url.searchParams.get("token") ?? "";
}

function isAdminAuthorized(token: string, env: Env): boolean {
  if (!env.ADMIN_API_KEY) {
    return true;
  }
  return token === env.ADMIN_API_KEY;
}

/**
 * CSV 单行解析，支持逗号与引号转义。
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      fields.push(field.trim());
      field = "";
      continue;
    }

    field += char;
  }

  fields.push(field.trim());
  return fields;
}

function stripBom(text: string): string {
  return text.replace(/^\uFEFF/, "");
}

/**
 * 复用的锐明 ABM 行数据解析器。
 * 关键规则：
 * 1) 从 “产品” 行提取应用名；
 * 2) 从 “代码,,Code Redemption Link” 起读取明细；
 * 3) 第 3 列值为 redeemed 时记为已兑换。
 */
function parseRuiMingRows(rows: string[][]): ParsedCsvResult {
  let appName = "";
  let dataStartRow = -1;
  const invalidRows: number[] = [];
  const records: ParsedCsvRecord[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const firstCol = (row[0] ?? "").trim();
    const thirdCol = (row[2] ?? "").trim();

    if (!appName && firstCol === "产品") {
      const candidate = row.find((cell, index) => index > 0 && cell.trim().length > 0);
      if (candidate) {
        appName = candidate.trim();
      }
    }

    if (firstCol === "代码" && /Code Redemption Link/i.test(thirdCol)) {
      dataStartRow = i + 1;
      break;
    }
  }

  if (!appName) {
    throw new Error("CSV 中未找到“产品”字段，无法识别应用名称");
  }
  if (dataStartRow < 0) {
    throw new Error("CSV 中未找到“代码, , Code Redemption Link”数据区起始行");
  }

  for (let i = dataStartRow; i < rows.length; i += 1) {
    const row = rows[i];
    const redeemCode = (row[0] ?? "").trim();
    const statusOrUrl = (row[2] ?? "").trim();
    if (!redeemCode && !statusOrUrl) {
      continue;
    }
    if (!redeemCode || !statusOrUrl) {
      invalidRows.push(i + 1);
      continue;
    }

    if (/^redeemed$/i.test(statusOrUrl)) {
      records.push({
        redeemCode,
        redeemUrl: "",
        used: 1
      });
      continue;
    }

    if (/^https?:\/\//i.test(statusOrUrl)) {
      records.push({
        redeemCode,
        redeemUrl: statusOrUrl,
        used: 0
      });
      continue;
    }

    invalidRows.push(i + 1);
  }

  if (records.length === 0) {
    throw new Error("CSV 未解析到任何有效兑换码记录");
  }

  return {
    appName,
    records,
    invalidRows
  };
}

/**
 * 解析「锐明智慧出租.csv」风格的 ABM CSV 文件。
 */
function parseRuiMingCsv(csvText: string): ParsedCsvResult {
  const rawLines = stripBom(csvText).split(/\r?\n/);
  const rows = rawLines.map((line) => parseCsvLine(line));
  return parseRuiMingRows(rows);
}

/**
 * 解析 ABM 的 xls/xlsx 文件，并转为与 CSV 一致的行结构。
 */
function parseRuiMingXls(buffer: ArrayBuffer): ParsedCsvResult {
  const workbook = XLSX.read(new Uint8Array(buffer), {
    type: "array",
    cellText: true
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("Excel 中没有可读取的工作表");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    raw: false,
    defval: ""
  });
  const normalizedRows = rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
  return parseRuiMingRows(normalizedRows);
}

async function getOrCreateApp(db: D1Database, appName: string): Promise<number> {
  const now = new Date().toISOString();
  const existed = await db
    .prepare(`SELECT id FROM abm_apps WHERE app_name = ? LIMIT 1`)
    .bind(appName)
    .first<{ id: number }>();

  if (existed?.id) {
    await db
      .prepare(`UPDATE abm_apps SET updated_at = ? WHERE id = ?`)
      .bind(now, existed.id)
      .run();
    return existed.id;
  }

  const created = await db
    .prepare(
      `INSERT INTO abm_apps (app_name, display_name, created_at, updated_at)
       VALUES (?, ?, ?, ?)
       RETURNING id`
    )
    .bind(appName, appName, now, now)
    .first<{ id: number }>();

  if (!created?.id) {
    throw new Error("创建应用失败");
  }
  return created.id;
}

/**
 * 按应用执行全量覆盖：
 * 先删除旧兑换码，再插入新数据，保证导入结果与 CSV 完全一致。
 */
async function replaceAppRedeemRecords(
  db: D1Database,
  appId: number,
  records: ParsedCsvRecord[]
): Promise<void> {
  await db.prepare(`DELETE FROM abm_redeem_links WHERE app_id = ?`).bind(appId).run();

  const now = new Date().toISOString();
  const statements = records.map((record) =>
    db
      .prepare(
        `INSERT INTO abm_redeem_links (app_id, redeem_code, redeem_url, used, used_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(
        appId,
        record.redeemCode,
        record.redeemUrl,
        record.used,
        record.used === 1 ? now : null,
        now
      )
  );

  const chunkSize = 200;
  for (let i = 0; i < statements.length; i += chunkSize) {
    await db.batch(statements.slice(i, i + chunkSize));
  }
}

async function listAppSummaries(db: D1Database): Promise<AppSummary[]> {
  const rows = await db
    .prepare(
      `SELECT
         a.id,
         a.app_name,
         a.updated_at,
         COUNT(r.id) AS total_count,
         SUM(CASE WHEN r.used = 1 THEN 1 ELSE 0 END) AS used_count,
         SUM(CASE WHEN r.used = 0 THEN 1 ELSE 0 END) AS unused_count
       FROM abm_apps a
       LEFT JOIN abm_redeem_links r ON r.app_id = a.id
       GROUP BY a.id, a.app_name, a.updated_at
       ORDER BY a.updated_at DESC, a.id DESC`
    )
    .all<AppSummary>();

  return (rows.results ?? []).map((item) => ({
    ...item,
    total_count: Number(item.total_count ?? 0),
    used_count: Number(item.used_count ?? 0),
    unused_count: Number(item.unused_count ?? 0)
  }));
}

async function claimOneUnusedRecordByApp(db: D1Database, appId: number): Promise<RedeemRecord | null> {
  const now = new Date().toISOString();
  const record = await db
    .prepare(
      `UPDATE abm_redeem_links
       SET used = 1, used_at = ?
       WHERE id = (
         SELECT id
         FROM abm_redeem_links
         WHERE app_id = ? AND used = 0 AND LENGTH(TRIM(redeem_url)) > 0
         ORDER BY id ASC
         LIMIT 1
       )
       RETURNING id, redeem_code, redeem_url`
    )
    .bind(now, appId)
    .first<RedeemRecord>();

  return record ?? null;
}

async function findAppById(db: D1Database, appId: number): Promise<{ id: number; app_name: string } | null> {
  const row = await db
    .prepare(`SELECT id, app_name FROM abm_apps WHERE id = ? LIMIT 1`)
    .bind(appId)
    .first<{ id: number; app_name: string }>();
  return row ?? null;
}

function createUserRedeemPageHtml(
  appName: string,
  record: RedeemRecord | null,
  isIos: boolean
): string {
  if (!record) {
    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(appName)} Redemption</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
      .card { width: 340px; background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 10px 28px rgba(35,46,80,.12); text-align: center; }
      .title { margin: 0 0 8px; font-size: 20px; color: #222; }
      .desc { margin: 0; font-size: 14px; color: #5b6470; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1 class="title">${escapeHtml(appName)}</h1>
      <p class="desc">No available redemption codes for this app. Please contact the administrator and try again later.</p>
    </main>
  </body>
</html>`;
  }

  const qrUrl = createQrImageUrl(record.redeem_url);
  const safeAppName = escapeHtml(appName);
  const safeCode = escapeHtml(record.redeem_code);
  const safeUrl = escapeHtml(record.redeem_url);
  const iosButtonHtml = isIos
    ? `<a class="action-btn" href="${safeUrl}" target="_self" rel="noopener noreferrer">iOS 一键前往 App Store</a>`
    : `<p class="hint">Use an iOS device to access this page for direct App Store redirect.</p>`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${safeAppName} Redemption</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
      .card { width: 360px; background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 10px 28px rgba(35,46,80,.12); text-align: center; }
      .title { margin: 0 0 8px; font-size: 20px; color: #222; }
      .desc { margin: 0 0 16px; font-size: 14px; color: #5b6470; line-height: 1.6; }
      .qr-wrapper { width: 260px; height: 260px; margin: 0 auto 12px; border: 1px solid #e7eaf3; border-radius: 10px; display: grid; place-items: center; background: #fafbfd; }
      .qr-image { width: 240px; height: 240px; }
      .code { margin: 10px 0 14px; font-size: 13px; color: #404a58; word-break: break-all; }
      .action-btn { display: block; text-decoration: none; width: 100%; border: none; border-radius: 10px; padding: 12px 14px; box-sizing: border-box; font-size: 14px; font-weight: 600; color: #fff; background: #2f6df6; }
      .action-btn:hover { background: #295fda; }
      .hint { margin: 0; font-size: 12px; color: #7c8593; line-height: 1.6; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1 class="title">${safeAppName}</h1>
      <p class="desc">Scan the QR code, or open this page on iOS for direct App Store redirect.</p>
      <div class="qr-wrapper">
        <img class="qr-image" src="${qrUrl}" alt="兑换链接二维码" />
      </div>
      <p class="code">Redemption Code: ${safeCode}</p>
      ${iosButtonHtml}
    </main>
  </body>
</html>`;
}

function createAdminPageHtml(params: {
  appSummaries: AppSummary[];
  token: string;
  importResult?: string;
  baseUrl: string;
}): string {
  const tableRows = params.appSummaries
    .map((item) => {
      const appName = escapeHtml(item.app_name);
      const openUrl = `${params.baseUrl}/app/${item.id}`;
      return `<tr>
        <td>${item.id}</td>
        <td>${appName}</td>
        <td>${item.used_count}</td>
        <td>${item.unused_count}</td>
        <td>${item.total_count}</td>
        <td>${escapeHtml(item.updated_at)}</td>
        <td><a href="${escapeHtml(openUrl)}" target="_blank" rel="noopener noreferrer">打开用户页</a></td>
      </tr>`;
    })
    .join("");

  const importResultHtml = params.importResult
    ? `<p class="result">${escapeHtml(params.importResult)}</p>`
    : "";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ABM 管理后台</title>
    <style>
      body { margin: 0; padding: 24px; background: #f6f8fc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #1f2937; }
      .container { max-width: 1100px; margin: 0 auto; }
      .card { background: #fff; border-radius: 12px; box-shadow: 0 10px 24px rgba(20,35,90,.08); padding: 20px; margin-bottom: 18px; }
      h1 { margin: 0 0 14px; font-size: 24px; }
      .desc { margin: 0 0 12px; color: #5b6470; font-size: 14px; }
      .result { margin: 0 0 12px; padding: 10px; border-radius: 8px; background: #e8f4ff; color: #1849a9; font-size: 13px; }
      .form-row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
      input[type="file"], input[type="text"] { border: 1px solid #d7dce7; border-radius: 8px; padding: 10px; background: #fff; }
      button { border: none; border-radius: 8px; padding: 10px 14px; background: #2f6df6; color: #fff; font-weight: 600; cursor: pointer; }
      button:hover { background: #295fda; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; background: #fff; }
      th, td { padding: 12px 10px; border-bottom: 1px solid #eef1f7; text-align: left; }
      th { background: #f8faff; font-weight: 600; color: #3d4b63; }
      a { color: #2f6df6; text-decoration: none; }
      a:hover { text-decoration: underline; }
    </style>
  </head>
  <body>
    <div class="container">
      <section class="card">
        <h1>ABM 管理后台</h1>
        <p class="desc">上传 ABM 导出的 CSV/XLS 文件（锐明格式），按“产品”字段自动创建/覆盖应用数据。</p>
        ${importResultHtml}
        <form method="post" action="/api/admin/apps/import" enctype="multipart/form-data">
          <div class="form-row">
            <input type="file" name="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required />
            <input type="text" name="token" placeholder="管理员令牌（可选）" value="${escapeHtml(params.token)}" />
            <button type="submit">上传并覆盖导入</button>
          </div>
        </form>
      </section>
      <section class="card">
        <h2>应用列表</h2>
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>应用名称</th>
              <th>已兑换</th>
              <th>未兑换</th>
              <th>总数</th>
              <th>最近导入时间</th>
              <th>用户页</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows || '<tr><td colspan="7">暂无应用数据</td></tr>'}
          </tbody>
        </table>
      </section>
    </div>
  </body>
</html>`;
}

async function handleAdminImport(request: Request, env: Env, url: URL): Promise<Response> {
  const formData = await request.formData();
  const token = extractAdminToken(request, url, String(formData.get("token") ?? ""));
  if (!isAdminAuthorized(token, env)) {
    return jsonResponse({ ok: false, message: "未授权访问导入接口" }, 401);
  }

  const file = formData.get("file") as unknown;
  if (
    !file ||
    typeof file !== "object" ||
    !("text" in file) ||
    typeof (file as { text?: unknown }).text !== "function" ||
    !("arrayBuffer" in file) ||
    typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
  ) {
    return jsonResponse({ ok: false, message: "请上传 CSV/XLS 文件" }, 400);
  }

  const uploadFile = file as TextReadableFile & BinaryReadableFile;
  const lowerFileName = String(uploadFile.name ?? "").toLowerCase();
  let parsed: ParsedCsvResult;
  try {
    if (lowerFileName.endsWith(".xls") || lowerFileName.endsWith(".xlsx")) {
      const binary = await uploadFile.arrayBuffer();
      parsed = parseRuiMingXls(binary);
    } else {
      const text = await uploadFile.text();
      parsed = parseRuiMingCsv(text);
    }
  } catch (error) {
    return jsonResponse(
      { ok: false, message: `文件解析失败: ${(error as Error).message}` },
      400
    );
  }

  const appId = await getOrCreateApp(env.DB, parsed.appName);
  await replaceAppRedeemRecords(env.DB, appId, parsed.records);
  await env.DB
    .prepare(`UPDATE abm_apps SET updated_at = ? WHERE id = ?`)
    .bind(new Date().toISOString(), appId)
    .run();

  const qs = new URLSearchParams();
  if (token) {
    qs.set("token", token);
  }
  qs.set(
    "importResult",
    `导入完成：应用「${parsed.appName}」(ID=${appId})，有效记录 ${parsed.records.length} 条，跳过无效行 ${parsed.invalidRows.length} 条。`
  );
  return Response.redirect(`${url.origin}/admin?${qs.toString()}`, 302);
}

/**
 * 兼容旧接口：
 * 允许使用 JSON 批量写入，默认写入 legacy-default 应用。
 */
async function handleLegacyBatchImport(request: Request, env: Env, url: URL): Promise<Response> {
  const token = extractAdminToken(request, url);
  if (!isAdminAuthorized(token, env)) {
    return jsonResponse({ ok: false, message: "未授权访问导入接口" }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, message: "请求体不是合法 JSON" }, 400);
  }

  const items = (payload as { items?: Array<{ redeemCode?: string; redeemUrl?: string }> }).items;
  if (!Array.isArray(items) || items.length === 0) {
    return jsonResponse({ ok: false, message: "items 不能为空" }, 400);
  }

  const appId = await getOrCreateApp(env.DB, "legacy-default");
  let inserted = 0;
  const now = new Date().toISOString();
  for (const item of items) {
    const redeemCode = item.redeemCode?.trim();
    const redeemUrl = item.redeemUrl?.trim();
    if (!redeemCode || !redeemUrl) {
      continue;
    }
    const result = await env.DB
      .prepare(
        `INSERT OR IGNORE INTO abm_redeem_links (app_id, redeem_code, redeem_url, used, used_at, created_at)
         VALUES (?, ?, ?, 0, NULL, ?)`
      )
      .bind(appId, redeemCode, redeemUrl, now)
      .run();
    inserted += result.meta.changes ?? 0;
  }

  await env.DB
    .prepare(`UPDATE abm_apps SET updated_at = ? WHERE id = ?`)
    .bind(now, appId)
    .run();

  return jsonResponse({
    ok: true,
    appId,
    inserted,
    received: items.length
  });
}

async function handleAdminPage(request: Request, env: Env, url: URL): Promise<Response> {
  const token = extractAdminToken(request, url);
  if (!isAdminAuthorized(token, env)) {
    return htmlResponse("<h1>401 未授权</h1><p>请携带正确的管理员令牌访问。</p>", 401);
  }

  const appSummaries = await listAppSummaries(env.DB);
  const html = createAdminPageHtml({
    appSummaries,
    token,
    importResult: url.searchParams.get("importResult") ?? undefined,
    baseUrl: url.origin
  });
  return htmlResponse(html);
}

async function handleAppPage(request: Request, env: Env, appId: number): Promise<Response> {
  const app = await findAppById(env.DB, appId);
  if (!app) {
    return htmlResponse("<h1>404</h1><p>应用不存在。</p>", 404);
  }

  const record = await claimOneUnusedRecordByApp(env.DB, appId);
  const userAgent = request.headers.get("user-agent") ?? "";
  const html = createUserRedeemPageHtml(app.app_name, record, isIosUserAgent(userAgent));
  return htmlResponse(html);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname === "/") {
      return Response.redirect(`${url.origin}/admin`, 302);
    }

    if (url.pathname === "/admin" && request.method === "GET") {
      return handleAdminPage(request, env, url);
    }

    if (url.pathname === "/api/admin/apps/import" && request.method === "POST") {
      return handleAdminImport(request, env, url);
    }

    if (url.pathname === "/api/admin/abm-codes" && request.method === "POST") {
      return handleLegacyBatchImport(request, env, url);
    }

    const appMatch = /^\/app\/(\d+)$/.exec(url.pathname);
    if (appMatch && request.method === "GET") {
      return handleAppPage(request, env, Number(appMatch[1]));
    }

    return jsonResponse({ ok: false, message: "Not Found" }, 404);
  }
};
