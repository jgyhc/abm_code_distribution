# abm_code_distribution

基于 Cloudflare Workers + D1 的 Apple ABM 多应用兑换码分发服务。

## 功能概览

- 管理员可在 `/admin` 上传 ABM 导出 CSV/XLS（锐明格式）并导入。
- 导入时依据文件中的 `产品` 字段自动创建应用；若应用已存在则执行**全量覆盖**。
- 用户通过 `/app/:appId` 访问对应应用领取页，每次访问原子领取一条未兑换记录并标记已兑换。
- CSV 中第三列为 `redeemed` 的记录会按已兑换状态入库。
- 管理后台可查看应用列表和兑换统计：已兑换 / 未兑换 / 总数。

## 快速开始

```bash
npm install
```

## D1 初始化与迁移

1. 创建数据库并复制 `database_id`：

```bash
wrangler d1 create abm_redeem_db
```

2. 将 `wrangler.toml` 中的 `database_id` 改为真实值。

3. 首次初始化执行：

```bash
wrangler d1 execute abm_redeem_db --file ./migrations/0001_create_abm_redeem_links.sql
wrangler d1 execute abm_redeem_db --file ./migrations/0002_multi_app_schema.sql
```

## 本地开发

```bash
npm run dev
```

## 管理后台使用

访问：

- `GET /admin`

如果配置了 `ADMIN_API_KEY`，可通过以下任一方式鉴权：

- 请求头：`x-admin-token: <你的密钥>`
- URL 参数：`/admin?token=<你的密钥>`
- 上传表单中的 `token` 字段

## CSV/XLS 导入格式（锐明 ABM 导出）

示例结构（节选，CSV 与 XLS 内容结构一致）：

```csv
产品,,"锐明智慧出租, v1.4.0"
...
代码,,Code Redemption Link
LRLYLWKXYYL4,,redeemed
JWAFHP6RRN4F,,https://apps.apple.com/redeem?code=JWAFHP6RRN4F&ctx=apps
```

解析规则：

- 从 `产品` 行读取应用名称（用于创建/匹配应用）。
- 从 `代码,,Code Redemption Link` 之后开始读取兑换明细。
- 第 1 列为兑换码，第 3 列为状态/链接：
  - `redeemed` => 该兑换码已兑换（`used=1`）
  - `https://...` => 该兑换码未兑换（`used=0`）

说明：

- 管理后台上传入口已支持 `.csv` / `.xls` / `.xlsx`。
- 若文件名后缀为 `.xls` 或 `.xlsx`，系统会按 Excel 第一张工作表解析。

## 主要路由

- `GET /admin`：管理后台（应用列表、统计、CSV 上传）
- `POST /api/admin/apps/import`：后台表单上传导入（全量覆盖）
- `GET /app/:appId`：用户领取页（按应用分发）
- `POST /api/admin/abm-codes`：旧 JSON 导入接口（兼容，写入 `legacy-default` 应用）
- `GET /health`：健康检查



