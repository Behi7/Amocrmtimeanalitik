-- CreateTable
CREATE TABLE "accounts" (
    "id" SERIAL NOT NULL,
    "subdomain" TEXT NOT NULL,
    "external_account_id" TEXT,
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

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "account_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pipelines" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stages" (
    "id" SERIAL NOT NULL,
    "pipeline_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "stages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT,
    "pipeline_id" INTEGER,
    "current_stage_id" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'open',
    "price" DECIMAL(18,2),
    "crm_created_at" TIMESTAMPTZ NOT NULL,
    "crm_closed_at" TIMESTAMPTZ,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "last_seen_at" TIMESTAMPTZ,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stage_history" (
    "id" SERIAL NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "stage_id" INTEGER NOT NULL,
    "entered_at" TIMESTAMPTZ NOT NULL,
    "exited_at" TIMESTAMPTZ,
    "duration_seconds" INTEGER,
    "source_event_id" TEXT,

    CONSTRAINT "lead_stage_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_stage_skips" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "lead_id" INTEGER NOT NULL,
    "pipeline_id" INTEGER NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "transition_at" TIMESTAMPTZ NOT NULL,
    "from_stage_id" INTEGER NOT NULL,
    "to_stage_id" INTEGER NOT NULL,
    "skipped_stage_id" INTEGER NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'forward',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_stage_skips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_crm_events" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "lead_external_id" TEXT,
    "result" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_crm_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_tags" (
    "lead_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,

    CONSTRAINT "lead_tags_pkey" PRIMARY KEY ("lead_id","tag_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "account_id" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_account_id_key" ON "users"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "pipelines_account_id_external_id_key" ON "pipelines"("account_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "stages_pipeline_id_external_id_key" ON "stages"("pipeline_id", "external_id");

-- CreateIndex
CREATE INDEX "leads_account_id_status_idx" ON "leads"("account_id", "status");

-- CreateIndex
CREATE INDEX "leads_account_id_pipeline_id_status_idx" ON "leads"("account_id", "pipeline_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "leads_account_id_external_id_key" ON "leads"("account_id", "external_id");

-- CreateIndex
CREATE INDEX "lead_stage_history_lead_id_idx" ON "lead_stage_history"("lead_id");

-- CreateIndex
CREATE INDEX "lead_stage_history_stage_id_duration_seconds_idx" ON "lead_stage_history"("stage_id", "duration_seconds");

-- CreateIndex
CREATE INDEX "lead_stage_skips_lead_id_idx" ON "lead_stage_skips"("lead_id");

-- CreateIndex
CREATE INDEX "lead_stage_skips_skipped_stage_id_idx" ON "lead_stage_skips"("skipped_stage_id");

-- CreateIndex
CREATE INDEX "lead_stage_skips_account_id_pipeline_id_idx" ON "lead_stage_skips"("account_id", "pipeline_id");

-- CreateIndex
CREATE UNIQUE INDEX "lead_stage_skips_lead_id_source_event_id_skipped_stage_id_key" ON "lead_stage_skips"("lead_id", "source_event_id", "skipped_stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "processed_crm_events_account_id_external_event_id_key" ON "processed_crm_events"("account_id", "external_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_account_id_external_id_key" ON "tags"("account_id", "external_id");

-- CreateIndex
CREATE INDEX "lead_tags_tag_id_idx" ON "lead_tags"("tag_id");

-- CreateIndex
CREATE INDEX "notifications_account_id_is_read_idx" ON "notifications"("account_id", "is_read");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pipelines" ADD CONSTRAINT "pipelines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_current_stage_id_fkey" FOREIGN KEY ("current_stage_id") REFERENCES "stages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_history" ADD CONSTRAINT "lead_stage_history_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_skips" ADD CONSTRAINT "lead_stage_skips_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_stage_skips" ADD CONSTRAINT "lead_stage_skips_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_crm_events" ADD CONSTRAINT "processed_crm_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_tags" ADD CONSTRAINT "lead_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GIN-индексы для текстового поиска
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm ON leads USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tags_name_trgm ON tags USING gin (name gin_trgm_ops);

-- Частичные уникальные индексы
CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_history_one_open_per_lead
  ON lead_stage_history(lead_id) WHERE exited_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stage_history_lead_event
  ON lead_stage_history(lead_id, source_event_id) WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_token_expiring_unread
  ON notifications(account_id) WHERE type = 'token_expiring_soon' AND is_read = false;