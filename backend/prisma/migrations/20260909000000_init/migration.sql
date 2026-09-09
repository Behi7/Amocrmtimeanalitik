-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "subdomain" TEXT NOT NULL,
    "external_account_id" BIGINT,
    "base_domain" TEXT NOT NULL DEFAULT 'amocrm.ru',
    "encrypted_token" TEXT,
    "token_expires_at" TIMESTAMPTZ,
    "token_status" TEXT NOT NULL DEFAULT 'active',
    "subscription_status" TEXT NOT NULL DEFAULT 'active',
    "status" TEXT NOT NULL DEFAULT 'connected',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "last_synced_at" TIMESTAMPTZ,
    "backfill_status" TEXT NOT NULL DEFAULT 'pending',
    "backfill_error" TEXT,
    "backfill_error_at" TIMESTAMPTZ,
    "backfill_cursor" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_accounts_token_status" CHECK ("token_status" IN ('active', 'expired')),
    CONSTRAINT "chk_accounts_subscription_status" CHECK ("subscription_status" IN ('active', 'suspended')),
    CONSTRAINT "chk_accounts_status" CHECK ("status" IN ('connected', 'disconnected')),
    CONSTRAINT "chk_accounts_backfill_status" CHECK ("backfill_status" IN ('pending', 'in_progress', 'done', 'failed')),
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "account_id" INT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_users_role" CHECK ("role" IN ('admin', 'viewer')),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "pipelines" (
    "id" SERIAL NOT NULL,
    "account_id" INT NOT NULL,
    "external_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "stages" (
    "id" SERIAL NOT NULL,
    "pipeline_id" INT NOT NULL,
    "external_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INT,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "account_id" INT NOT NULL,
    "external_id" BIGINT NOT NULL,
    "name" TEXT,
    "pipeline_id" INT,
    "current_stage_id" INT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "price" DECIMAL(18,2),
    "crm_created_at" TIMESTAMPTZ NOT NULL,
    "crm_closed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ,
    CONSTRAINT "chk_leads_status" CHECK ("status" IN ('open', 'won', 'lost', 'gone')),
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lead_stage_history" (
    "id" SERIAL NOT NULL,
    "lead_id" INT NOT NULL,
    "stage_id" INT NOT NULL,
    "entered_at" TIMESTAMPTZ NOT NULL,
    "exited_at" TIMESTAMPTZ,
    "duration_seconds" INT,
    "source_event_id" BIGINT,
    CONSTRAINT "chk_lead_stage_history_interval" CHECK (exited_at IS NULL OR exited_at >= entered_at),
    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lead_stage_skips" (
    "id" SERIAL NOT NULL,
    "account_id" INT NOT NULL,
    "lead_id" INT NOT NULL,
    "pipeline_id" INT NOT NULL,
    "source_event_id" BIGINT NOT NULL,
    "transition_at" TIMESTAMPTZ NOT NULL,
    "from_stage_id" INT NOT NULL,
    "to_stage_id" INT NOT NULL,
    "skipped_stage_id" INT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'forward',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_lead_stage_skips_direction" CHECK ("direction" IN ('forward', 'backward')),
    CONSTRAINT "lead_stage_skips_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "processed_crm_events" (
    "id" SERIAL NOT NULL,
    "account_id" INT NOT NULL,
    "external_event_id" BIGINT NOT NULL,
    "lead_external_id" BIGINT,
    "result" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "processed_crm_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "account_id" INT NOT NULL,
    "external_id" BIGINT NOT NULL,
    "name" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "lead_tags" (
    "lead_id" INT NOT NULL,
    "tag_id" INT NOT NULL,
    CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("lead_id","tag_id")
);
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "account_id" INT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chk_notifications_type" CHECK ("type" IN ('token_expired', 'subscription_suspended', 'token_expiring_soon')),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
-- FKs
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_stage_skips" ADD CONSTRAINT "lead_stage_skips_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_stage_skips" ADD CONSTRAINT "lead_stage_skips_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processed_crm_events" ADD CONSTRAINT "processed_crm_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique indexes
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE UNIQUE INDEX "users_account_id_key" ON "users"("account_id");
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE UNIQUE INDEX "pipelines_account_id_external_id_key" ON "pipelines"("account_id", "external_id");
CREATE UNIQUE INDEX "stages_pipeline_id_external_id_key" ON "stages"("pipeline_id", "external_id");
CREATE UNIQUE INDEX "leads_account_id_external_id_key" ON "leads"("account_id", "external_id");
CREATE UNIQUE INDEX "processed_crm_events_account_id_external_event_id_key" ON "processed_crm_events"("account_id", "external_event_id");
CREATE UNIQUE INDEX "tags_account_id_external_id_key" ON "tags"("account_id", "external_id");
CREATE UNIQUE INDEX "lead_tags_lead_id_tag_id_key" ON "lead_tags"("lead_id", "tag_id");
CREATE UNIQUE INDEX "lead_stage_skips_lead_id_source_event_id_skipped_stage_id_key" ON "lead_stage_skips"("lead_id", "source_event_id", "skipped_stage_id");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");
CREATE INDEX "leads_account_id_status_idx" ON "leads"("account_id", "status");
CREATE INDEX "leads_account_id_pipeline_id_status_idx" ON "leads"("account_id", "pipeline_id", "status");
CREATE INDEX "lead_stage_history_lead_id_idx" ON "lead_stage_history"("lead_id");
CREATE INDEX "lead_stage_history_stage_id_duration_seconds_idx" ON "lead_stage_history"("stage_id", "duration_seconds");
CREATE INDEX "lead_stage_skips_lead_id_idx" ON "lead_stage_skips"("lead_id");
CREATE INDEX "lead_stage_skips_skipped_stage_id_idx" ON "lead_stage_skips"("skipped_stage_id");
CREATE INDEX "lead_stage_skips_account_id_pipeline_id_idx" ON "lead_stage_skips"("account_id", "pipeline_id");
CREATE INDEX "lead_tags_tag_id_idx" ON "lead_tags"("tag_id");
CREATE INDEX "notifications_account_id_is_read_idx" ON "notifications"("account_id", "is_read");

-- RAW SQL: pg_trgm GIN + partial unique indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_leads_name_trgm ON leads USING gin (name gin_trgm_ops);
CREATE INDEX idx_tags_name_trgm ON tags USING gin (name gin_trgm_ops);
CREATE UNIQUE INDEX idx_stage_history_one_open_per_lead ON lead_stage_history(lead_id) WHERE exited_at IS NULL;
CREATE UNIQUE INDEX idx_stage_history_lead_event ON lead_stage_history(lead_id, source_event_id) WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_notifications_token_expiring_unread ON notifications(account_id) WHERE type = 'token_expiring_soon' AND is_read = false;
