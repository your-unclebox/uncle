CREATE TYPE "public"."asset_status" AS ENUM('PENDING', 'READY', 'DELETED');--> statement-breakpoint
CREATE TYPE "public"."cash_reservation_mode" AS ENUM('UNTIL_EVENT_END', 'UNTIL_EVENT_START', 'AFTER_START_MINUTES');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('PENDING', 'SENDING', 'SENT', 'FAILED', 'BOUNCED');--> statement-breakpoint
CREATE TYPE "public"."email_type" AS ENUM('TICKET_ISSUED', 'CASH_RESERVATION', 'RESERVATION_EXPIRED', 'ORDER_CANCELLED', 'ADMIN_INVITE');--> statement-breakpoint
CREATE TYPE "public"."event_media_kind" AS ENUM('PHOTO', 'VIDEO', 'VIDEO_EMBED');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('DRAFT', 'ACTIVE', 'FINISHED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING_PAYMENT', 'RESERVED', 'PAID', 'EXPIRED', 'CANCELLED', 'REFUNDED');--> statement-breakpoint
CREATE TYPE "public"."paid_via" AS ENUM('GATEWAY_WEBHOOK', 'GATEWAY_RECONCILE', 'CASH_MANUAL');--> statement-breakpoint
CREATE TYPE "public"."payment_config_status" AS ENUM('NOT_SET', 'CONNECTED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('QRIS', 'CASH');--> statement-breakpoint
CREATE TYPE "public"."payment_mode" AS ENUM('SANDBOX', 'PRODUCTION');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('TRIPAY');--> statement-breakpoint
CREATE TYPE "public"."payment_transaction_status" AS ENUM('UNPAID', 'PAID', 'EXPIRED', 'FAILED', 'REFUND');--> statement-breakpoint
CREATE TYPE "public"."role_scope" AS ENUM('PLATFORM', 'EVENT');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('ISSUED', 'CHECKED_IN', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."webhook_result" AS ENUM('APPLIED', 'DUPLICATE', 'IGNORED', 'NEEDS_REVIEW', 'REJECTED');--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"role_id" smallint NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "uq_invitations_event_id_id" UNIQUE("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_id" smallint NOT NULL,
	"event_id" uuid,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_memberships_user_role_event" UNIQUE NULLS NOT DISTINCT("user_id","role_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" smallint PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"scope" "role_scope" NOT NULL,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone,
	"ip" "inet",
	"user_agent" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"name" text NOT NULL,
	"password_hash" text,
	"totp_secret_enc" "bytea",
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"checksum_sha256" "bytea",
	"uploaded_by" uuid,
	"status" "asset_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_email" text,
	"contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"asset_id" uuid,
	"kind" "event_media_kind" NOT NULL,
	"embed_url" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_event_media_event_id_id" UNIQUE("event_id","id"),
	CONSTRAINT "ck_event_media_embed_url" CHECK (("event_media"."kind" = 'VIDEO_EMBED') = ("event_media"."embed_url" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"slug" "citext" NOT NULL,
	"status" "event_status" DEFAULT 'DRAFT' NOT NULL,
	"sales_open" boolean DEFAULT true NOT NULL,
	"name" text NOT NULL,
	"description_html" text,
	"category" text,
	"event_type" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
	"venue_name" text,
	"venue_address" text,
	"maps_url" text,
	"venue_lat" numeric(9, 6),
	"venue_lng" numeric(9, 6),
	"logo_asset_id" uuid,
	"cover_asset_id" uuid,
	"primary_color" char(7),
	"secondary_color" char(7),
	"contact_info" text,
	"terms_html" text,
	"refund_policy_html" text,
	"max_tickets_per_order" smallint DEFAULT 10 NOT NULL,
	"qris_expiry_minutes" smallint DEFAULT 15 NOT NULL,
	"cash_enabled" boolean DEFAULT true NOT NULL,
	"cash_reservation_mode" "cash_reservation_mode" DEFAULT 'UNTIL_EVENT_END' NOT NULL,
	"cash_reservation_offset_minutes" smallint,
	"published_at" timestamp with time zone,
	"created_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug"),
	CONSTRAINT "ck_events_ends_after_starts" CHECK ("events"."ends_at" > "events"."starts_at"),
	CONSTRAINT "ck_events_slug_format" CHECK ("events"."slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'),
	CONSTRAINT "ck_events_primary_color" CHECK ("events"."primary_color" IS NULL OR "events"."primary_color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "ck_events_secondary_color" CHECK ("events"."secondary_color" IS NULL OR "events"."secondary_color" ~ '^#[0-9A-Fa-f]{6}$'),
	CONSTRAINT "ck_events_cash_offset_required" CHECK ("events"."cash_reservation_mode" <> 'AFTER_START_MINUTES' OR "events"."cash_reservation_offset_minutes" IS NOT NULL),
	CONSTRAINT "ck_events_cash_offset_positive" CHECK ("events"."cash_reservation_offset_minutes" IS NULL OR "events"."cash_reservation_offset_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "reserved_slugs" (
	"slug" "citext" PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price" bigint NOT NULL,
	"quota" integer NOT NULL,
	"allocated_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_ticket_types_event_id_id" UNIQUE("event_id","id"),
	CONSTRAINT "uq_ticket_types_event_id_name" UNIQUE("event_id","name"),
	CONSTRAINT "ck_ticket_types_price_positive" CHECK ("ticket_types"."price" > 0),
	CONSTRAINT "ck_ticket_types_quota_positive" CHECK ("ticket_types"."quota" > 0),
	CONSTRAINT "ck_ticket_types_allocated_within_quota" CHECK ("ticket_types"."allocated_count" >= 0 AND "ticket_types"."allocated_count" <= "ticket_types"."quota")
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"ticket_type_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_order_items_event_id_id" UNIQUE("event_id","id"),
	CONSTRAINT "uq_order_items_order_id_ticket_type_id" UNIQUE("order_id","ticket_type_id"),
	CONSTRAINT "ck_order_items_quantity_positive" CHECK ("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"order_code" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"customer_email" "citext" NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"status" "order_status" NOT NULL,
	"total_amount" bigint NOT NULL,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"paid_via" "paid_via",
	"cash_confirmed_by" uuid,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"refund_marked_at" timestamp with time zone,
	"refund_marked_by" uuid,
	"refund_note" text,
	"needs_review" boolean DEFAULT false NOT NULL,
	"reissued_from_order_id" uuid,
	"access_token_hash" "bytea",
	"idempotency_key" text,
	"created_ip" "inet",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_order_code_unique" UNIQUE("order_code"),
	CONSTRAINT "uq_orders_event_id_id" UNIQUE("event_id","id"),
	CONSTRAINT "uq_orders_event_id_idempotency_key" UNIQUE("event_id","idempotency_key"),
	CONSTRAINT "ck_orders_customer_name_length" CHECK (char_length("orders"."customer_name") BETWEEN 2 AND 100),
	CONSTRAINT "ck_orders_total_amount_positive" CHECK ("orders"."total_amount" > 0),
	CONSTRAINT "ck_orders_status_matches_method" CHECK (("orders"."payment_method" = 'QRIS' AND "orders"."status" <> 'RESERVED') OR ("orders"."payment_method" = 'CASH' AND "orders"."status" <> 'PENDING_PAYMENT')),
	CONSTRAINT "ck_orders_active_hold_has_expiry" CHECK ("orders"."status" NOT IN ('PENDING_PAYMENT', 'RESERVED') OR "orders"."expires_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"qr_version" smallint DEFAULT 1 NOT NULL,
	"qr_fingerprint" "bytea" NOT NULL,
	"status" "ticket_status" DEFAULT 'ISSUED' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_in_at" timestamp with time zone,
	"checked_in_by" uuid,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "tickets_qr_fingerprint_unique" UNIQUE("qr_fingerprint"),
	CONSTRAINT "uq_tickets_event_id_id" UNIQUE("event_id","id"),
	CONSTRAINT "ck_tickets_checked_in_consistent" CHECK (("tickets"."status" = 'CHECKED_IN') = ("tickets"."checked_in_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "payment_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"provider" "payment_provider" DEFAULT 'TRIPAY' NOT NULL,
	"mode" "payment_mode" NOT NULL,
	"merchant_code" text NOT NULL,
	"api_key_enc" "bytea",
	"private_key_enc" "bytea",
	"enc_key_id" text,
	"api_key_last4" char(4),
	"webhook_key" text NOT NULL,
	"status" "payment_config_status" DEFAULT 'NOT_SET' NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_error" text,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_configs_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "payment_configs_webhook_key_unique" UNIQUE("webhook_key"),
	CONSTRAINT "uq_payment_configs_event_id_id" UNIQUE("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "payment_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_config_id" uuid NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"merchant_ref" text NOT NULL,
	"provider_reference" text,
	"channel" text,
	"amount" bigint NOT NULL,
	"fee_amount" bigint,
	"status" "payment_transaction_status" DEFAULT 'UNPAID' NOT NULL,
	"qr_string" text,
	"qr_image_url" text,
	"expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"raw_create_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_transactions_merchant_ref_unique" UNIQUE("merchant_ref"),
	CONSTRAINT "uq_payment_transactions_event_id_id" UNIQUE("event_id","id"),
	CONSTRAINT "uq_payment_transactions_provider_reference" UNIQUE("provider","provider_reference")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "payment_provider" NOT NULL,
	"payment_config_id" uuid,
	"event_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"signature_valid" boolean NOT NULL,
	"headers" jsonb,
	"raw_body" text NOT NULL,
	"provider_reference" text,
	"reported_status" text,
	"dedupe_key" text,
	"processed_at" timestamp with time zone,
	"result" "webhook_result",
	"error" text,
	CONSTRAINT "webhook_events_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"order_id" uuid,
	"type" "email_type" NOT NULL,
	"to_email" "citext" NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "email_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"provider_message_id" text,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_email_outbox_event_id_id" UNIQUE("event_id","id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" "inet",
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_media" ADD CONSTRAINT "event_media_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_logo_asset_id_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_cover_asset_id_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_order_same_event" FOREIGN KEY ("event_id","order_id") REFERENCES "public"."orders"("event_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "fk_order_items_ticket_type_same_event" FOREIGN KEY ("event_id","ticket_type_id") REFERENCES "public"."ticket_types"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cash_confirmed_by_users_id_fk" FOREIGN KEY ("cash_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_refund_marked_by_users_id_fk" FOREIGN KEY ("refund_marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "fk_orders_reissued_from_same_event" FOREIGN KEY ("event_id","reissued_from_order_id") REFERENCES "public"."orders"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_checked_in_by_users_id_fk" FOREIGN KEY ("checked_in_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "fk_tickets_order_same_event" FOREIGN KEY ("event_id","order_id") REFERENCES "public"."orders"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_configs" ADD CONSTRAINT "payment_configs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_configs" ADD CONSTRAINT "payment_configs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_payment_config_id_payment_configs_id_fk" FOREIGN KEY ("payment_config_id") REFERENCES "public"."payment_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_transactions" ADD CONSTRAINT "fk_payment_transactions_order_same_event" FOREIGN KEY ("event_id","order_id") REFERENCES "public"."orders"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_payment_config_id_payment_configs_id_fk" FOREIGN KEY ("payment_config_id") REFERENCES "public"."payment_configs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_events" ADD CONSTRAINT "webhook_events_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "fk_email_outbox_order_same_event" FOREIGN KEY ("event_id","order_id") REFERENCES "public"."orders"("event_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_invitations_active_event_email" ON "invitations" USING btree ("event_id","email") WHERE "invitations"."accepted_at" IS NULL AND "invitations"."revoked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_orders_event_id_reissued_from" ON "orders" USING btree ("event_id","reissued_from_order_id") WHERE "orders"."reissued_from_order_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_orders_event_id_status" ON "orders" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "ix_orders_event_id_created_at" ON "orders" USING btree ("event_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ix_orders_event_id_customer_phone" ON "orders" USING btree ("event_id","customer_phone");--> statement-breakpoint
CREATE INDEX "ix_orders_customer_name_trgm" ON "orders" USING gin ("customer_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "ix_orders_active_hold_expires_at" ON "orders" USING btree ("expires_at") WHERE "orders"."status" IN ('PENDING_PAYMENT', 'RESERVED');--> statement-breakpoint
CREATE UNIQUE INDEX "uq_payment_transactions_one_unpaid_per_order" ON "payment_transactions" USING btree ("order_id") WHERE "payment_transactions"."status" = 'UNPAID';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_email_outbox_ticket_email_per_order" ON "email_outbox" USING btree ("order_id","type") WHERE "email_outbox"."type" IN ('TICKET_ISSUED', 'CASH_RESERVATION');