ALTER TABLE "events" ALTER COLUMN "slug" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "starts_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "ends_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "ck_events_non_draft_complete" CHECK ("events"."status" = 'DRAFT' OR ("events"."slug" IS NOT NULL AND "events"."starts_at" IS NOT NULL AND "events"."ends_at" IS NOT NULL));