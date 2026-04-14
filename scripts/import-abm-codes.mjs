#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import process from "node:process";

/**
 * 解析命令行参数。
 * 约定：
 * - --file/-f: CSV 文件路径（必填）
 * - --endpoint/-e: 导入接口地址（默认 http://127.0.0.1:8787/api/admin/abm-codes）
 * - --token/-t: 管理密钥（可选，对应 x-admin-token）
 * - --batch/-b: 单批提交数量（默认 50）
 */
function parseArgs(argv) {
  const args = {
    file: "",
    endpoint: "http://127.0.0.1:8787/api/admin/abm-codes",
    token: "",
    batch: 50
  };

  for (let i = 2; i < argv.length; i += 1) {
    const current = argv[i];
    const next = argv[i + 1];
    if ((current === "--file" || current === "-f") && next) {
      args.file = next;
      i += 1;
      continue;
    }
    if ((current === "--endpoint" || current === "-e") && next) {
      args.endpoint = next;
      i += 1;
      continue;
    }
    if ((current === "--token" || current === "-t") && next) {
      args.token = next;
      i += 1;
      continue;
    }
    if ((current === "--batch" || current === "-b") && next) {
      const parsedBatch = Number(next);
      if (!Number.isFinite(parsedBatch) || parsedBatch <= 0) {
        throw new Error(`非法 batch 参数: ${next}`);
      }
      args.batch = Math.floor(parsedBatch);
      i += 1;
      continue;
    }
  }

  return args;
}

/**
 * 解析单行 CSV，支持双引号包裹与转义双引号。
 * 例如：
 * "A,B","https://a.com?q=1,2","text ""quoted"""
 */
function parseCsvLine(line) {
  const fields = [];
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

/**
 * 去除 UTF-8 BOM，防止首列表头出现隐藏字符导致映射失败。
 */
function stripBom(text) {
  return text.replace(/^\uFEFF/, "");
}

/**
 * 识别列名并提取数据。
 * 兼容如下表头：
 * - redeemCode / redeemUrl
 * - 兑换码 / 跳转链接
 */
function parseCsvContent(csvContent) {
  const lines = stripBom(csvContent)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("CSV 文件至少要包含表头 + 1 行数据");
  }

  const headers = parseCsvLine(lines[0]);
  const normalized = headers.map((h) => h.replace(/\s+/g, "").toLowerCase());

  const redeemCodeIndex = normalized.findIndex(
    (h) => h === "redeemcode" || h === "兑换码"
  );
  const redeemUrlIndex = normalized.findIndex(
    (h) => h === "redeemurl" || h === "跳转链接" || h === "链接"
  );

  if (redeemCodeIndex < 0 || redeemUrlIndex < 0) {
    throw new Error(
      "表头不符合要求，必须包含 redeemCode/redeemUrl 或 兑换码/跳转链接"
    );
  }

  const items = [];
  const invalidRows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const row = parseCsvLine(lines[i]);
    const redeemCode = (row[redeemCodeIndex] || "").trim();
    const redeemUrl = (row[redeemUrlIndex] || "").trim();

    if (!redeemCode || !redeemUrl) {
      invalidRows.push(i + 1);
      continue;
    }

    items.push({ redeemCode, redeemUrl });
  }

  return { items, invalidRows };
}

/**
 * 将数组按固定尺寸切分，便于控制单次请求体大小。
 */
function chunkArray(input, size) {
  const result = [];
  for (let i = 0; i < input.length; i += size) {
    result.push(input.slice(i, i + size));
  }
  return result;
}

/**
 * 提交单批数据到服务端导入接口。
 */
async function postBatch({ endpoint, token, batchItems }) {
  const headers = {
    "content-type": "application/json"
  };

  if (token) {
    headers["x-admin-token"] = token;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ items: batchItems })
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`导入失败: HTTP ${response.status}, 响应: ${JSON.stringify(json)}`);
  }

  return json;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.file) {
    throw new Error("缺少 --file 参数，例如: --file ./data/abm-codes.csv");
  }

  const csv = await readFile(args.file, "utf-8");
  const { items, invalidRows } = parseCsvContent(csv);

  if (items.length === 0) {
    throw new Error("没有可导入的有效数据");
  }

  const batches = chunkArray(items, args.batch);
  let totalInserted = 0;
  let totalReceived = 0;

  console.log(`共解析 ${items.length} 条有效数据，分 ${batches.length} 批导入。`);
  if (invalidRows.length > 0) {
    console.log(`以下行因缺少字段被跳过: ${invalidRows.join(", ")}`);
  }

  for (let i = 0; i < batches.length; i += 1) {
    const batchItems = batches[i];
    const result = await postBatch({
      endpoint: args.endpoint,
      token: args.token,
      batchItems
    });

    totalInserted += Number(result.inserted || 0);
    totalReceived += Number(result.received || batchItems.length);
    console.log(
      `第 ${i + 1}/${batches.length} 批完成: received=${result.received ?? batchItems.length}, inserted=${result.inserted ?? 0}`
    );
  }

  console.log(`导入完成: received=${totalReceived}, inserted=${totalInserted}`);
}

main().catch((error) => {
  console.error(`导入脚本执行失败: ${error.message}`);
  process.exit(1);
});
