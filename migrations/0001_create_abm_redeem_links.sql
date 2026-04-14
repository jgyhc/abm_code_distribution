-- Apple ABM 兑换链接表
-- 设计目标：
-- 1) 存储兑换码与跳转链接；
-- 2) 支持按未使用状态进行分发；
-- 3) 支持记录链接何时被消耗，便于追踪发放节奏。
CREATE TABLE IF NOT EXISTS abm_redeem_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  redeem_code TEXT NOT NULL UNIQUE,
  redeem_url TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  used_at TEXT,
  created_at TEXT NOT NULL
);

-- 高频查询优化：按未使用状态 + 主键顺序领取。
CREATE INDEX IF NOT EXISTS idx_abm_redeem_links_used_id
ON abm_redeem_links (used, id);
