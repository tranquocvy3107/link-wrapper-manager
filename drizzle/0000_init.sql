-- Link Wrapper Manager — schema khởi tạo
-- PostgreSQL 13+ (gen_random_uuid() có sẵn từ PG13, không cần extension pgcrypto)

CREATE TABLE IF NOT EXISTS links (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  alias           varchar(64)  NOT NULL UNIQUE,
  destination_url text         NOT NULL,
  title           varchar(200) NOT NULL,
  description     varchar(500),
  time_wait       integer      NOT NULL DEFAULT 3000,
  parameters      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  forward_params  boolean      NOT NULL DEFAULT false,
  status          varchar(16)  NOT NULL DEFAULT 'active',
  expires_at      timestamptz,
  created_by      varchar(64),
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS link_visits (
  id          bigserial    PRIMARY KEY,
  link_id     uuid         REFERENCES links(id) ON DELETE SET NULL,
  alias       varchar(64)  NOT NULL,
  visited_at  timestamptz  NOT NULL DEFAULT now(),
  ip_hash     char(64),
  user_agent  varchar(512),
  referer     varchar(512),
  query       jsonb,
  country     char(2),
  is_bot      boolean      NOT NULL DEFAULT false,
  redirected  boolean      NOT NULL DEFAULT false,
  visit_token char(32)
);

CREATE INDEX IF NOT EXISTS idx_visits_alias_time ON link_visits (alias, visited_at);
CREATE INDEX IF NOT EXISTS idx_visits_link_time  ON link_visits (link_id, visited_at);
CREATE INDEX IF NOT EXISTS idx_visits_token      ON link_visits (visit_token);
