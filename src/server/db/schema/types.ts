import { customType, timestamp, uuid } from "drizzle-orm/pg-core";

// Tipe Postgres yang tidak disediakan langsung oleh drizzle-orm.
export const citext = customType<{ data: string }>({
  dataType: () => "citext",
});

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const inet = customType<{ data: string }>({
  dataType: () => "inet",
});

// DRD §Database 1: PK uuid, waktu timestamptz (UTC).
export const id = () => uuid("id").primaryKey().defaultRandom();

export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const createdAt = () => timestamptz("created_at").notNull().defaultNow();

// Nilai updated_at dijaga trigger set_updated_at() (migrasi 0002).
export const updatedAt = () => timestamptz("updated_at").notNull().defaultNow();
