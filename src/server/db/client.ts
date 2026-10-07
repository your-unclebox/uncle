import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { getServerEnv } from "@/config/env";

import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DatabaseExecutor = Database | DatabaseTransaction;

export interface DatabaseHandle {
  readonly db: Database;
  readonly close: () => Promise<void>;
}

// prepare: false wajib untuk Supavisor mode transaction (DRD Tech Stack §1).
export function createDatabase(url: string, options: { max?: number } = {}): DatabaseHandle {
  const client = postgres(url, { prepare: false, max: options.max ?? 10, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

let handle: DatabaseHandle | undefined;

export function getDb(): Database {
  handle ??= createDatabase(getServerEnv().DATABASE_URL);
  return handle.db;
}
