-- =============================================================================
-- Trigger, Row-Level Security, hak akses role aplikasi, dan data referensi.
-- Sumber: DRD §Database 3–5, DRD Security §3.
-- =============================================================================

-- --- updated_at otomatis (DRD §Database 1) -----------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'memberships', 'invitations', 'clients', 'events', 'assets', 'event_media',
    'ticket_types', 'orders', 'tickets', 'payment_configs', 'payment_transactions', 'email_outbox'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_set_updated_at BEFORE UPDATE ON %1$I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- --- memberships: OWNER tanpa event_id, EVENT_ADMIN wajib event_id ------------
CREATE OR REPLACE FUNCTION check_membership_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  role_scope_value role_scope;
BEGIN
  SELECT scope INTO role_scope_value FROM roles WHERE id = NEW.role_id;
  IF role_scope_value = 'PLATFORM' AND NEW.event_id IS NOT NULL THEN
    RAISE EXCEPTION 'Role platform tidak boleh terikat ke event'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_memberships_scope';
  END IF;
  IF role_scope_value = 'EVENT' AND NEW.event_id IS NULL THEN
    RAISE EXCEPTION 'Role event wajib terikat ke event'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_memberships_scope';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_memberships_check_scope
  BEFORE INSERT OR UPDATE OF role_id, event_id ON memberships
  FOR EACH ROW EXECUTE FUNCTION check_membership_scope();
--> statement-breakpoint

-- --- events.slug bukan subdomain cadangan (DRD Architecture §2) --------------
CREATE OR REPLACE FUNCTION check_event_slug_not_reserved() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM reserved_slugs WHERE slug = NEW.slug) THEN
    RAISE EXCEPTION 'Slug "%" adalah subdomain cadangan', NEW.slug
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_events_slug_not_reserved';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_events_slug_not_reserved
  BEFORE INSERT OR UPDATE OF slug ON events
  FOR EACH ROW EXECUTE FUNCTION check_event_slug_not_reserved();
--> statement-breakpoint

-- --- events.slug terkunci setelah ada transaksi (BR-EVT-06) ------------------
CREATE OR REPLACE FUNCTION check_event_slug_locked() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug
     AND EXISTS (SELECT 1 FROM orders WHERE event_id = OLD.id) THEN
    RAISE EXCEPTION 'Slug tidak bisa diubah karena event sudah punya transaksi'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'ck_events_slug_locked';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_events_slug_locked
  BEFORE UPDATE OF slug ON events
  FOR EACH ROW EXECUTE FUNCTION check_event_slug_locked();
--> statement-breakpoint

-- --- Row-Level Security per tenant (DRD Security §3) --------------------------
-- Tenant aktif dibaca dari `app.event_id` yang di-set per transaksi
-- (SET LOCAL lewat set_config(..., true)). Tidak di-set → NULL → 0 baris.
CREATE OR REPLACE FUNCTION app_current_event_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.event_id', true), '')::uuid
$$;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders', 'order_items', 'tickets', 'payment_transactions', 'payment_configs',
    'email_outbox', 'audit_logs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO uncle_app '
      'USING (event_id = app_current_event_id()) '
      'WITH CHECK (event_id = app_current_event_id())',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint

-- --- Hak akses role aplikasi -------------------------------------------------
GRANT USAGE ON SCHEMA public TO uncle_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uncle_app;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_event_id() TO uncle_app;
--> statement-breakpoint
-- audit_logs append-only untuk role aplikasi.
REVOKE UPDATE, DELETE ON audit_logs FROM uncle_app;
--> statement-breakpoint
-- Data referensi hanya diubah lewat migrasi.
REVOKE INSERT, UPDATE, DELETE ON roles, reserved_slugs FROM uncle_app;
--> statement-breakpoint

-- --- Data referensi ------------------------------------------------------------
INSERT INTO roles (id, code, scope) VALUES
  (1, 'OWNER', 'PLATFORM'),
  (2, 'EVENT_ADMIN', 'EVENT')
ON CONFLICT (id) DO NOTHING;
--> statement-breakpoint
INSERT INTO reserved_slugs (slug) VALUES
  ('app'), ('api'), ('www'), ('admin'), ('owner'), ('mail'), ('email'), ('staging'),
  ('dev'), ('status'), ('cdn'), ('assets'), ('static'), ('help'), ('docs'), ('blog')
ON CONFLICT (slug) DO NOTHING;
