-- 多应用改造迁移
-- 目标：
-- 1) 增加 abm_apps 应用表；
-- 2) 将兑换码表升级为 app_id 维度；
-- 3) 为按应用领取与统计提供索引。

PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS abm_apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS abm_redeem_links_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  redeem_code TEXT NOT NULL,
  redeem_url TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (app_id) REFERENCES abm_apps(id) ON DELETE CASCADE
);

-- 兼容已有单应用数据：迁移到默认应用 legacy-default。
INSERT OR IGNORE INTO abm_apps (id, app_name, display_name, created_at, updated_at)
VALUES (
  1,
  'legacy-default',
  'legacy-default',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT INTO abm_redeem_links_new (id, app_id, redeem_code, redeem_url, used, used_at, created_at)
SELECT
  id,
  1 AS app_id,
  redeem_code,
  redeem_url,
  used,
  used_at,
  created_at
FROM abm_redeem_links;

DROP TABLE abm_redeem_links;
ALTER TABLE abm_redeem_links_new RENAME TO abm_redeem_links;

CREATE UNIQUE INDEX IF NOT EXISTS idx_abm_redeem_links_app_code
ON abm_redeem_links (app_id, redeem_code);

CREATE INDEX IF NOT EXISTS idx_abm_redeem_links_app_used_id
ON abm_redeem_links (app_id, used, id);

PRAGMA foreign_keys = ON;
