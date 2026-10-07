import { randomBytes } from "node:crypto";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

import { runMigrations } from "../../src/server/db/run-migrations";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

// Postgres asli (bukan mock) untuk test integrasi — AI-CODING-RULES Testing §1.
// Versi 17 = versi mayor project baru Supabase.
let container: StartedPostgreSqlContainer | undefined;
let dropDatabase: (() => Promise<void>) | undefined;

/**
 * Tanpa Docker (mis. sandbox CI/agent): TEST_DATABASE_URL menunjuk server
 * Postgres yang sudah jalan (superuser). Database baru dibuat per run lalu
 * dihapus, sehingga state antar run tidak bocor.
 */
async function createExternalDatabase(adminUrl: string): Promise<string> {
  const name = `uncle_test_${randomBytes(4).toString("hex")}`;
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  await admin.end();
  dropDatabase = async () => {
    const sql = postgres(adminUrl, { max: 1, onnotice: () => {} });
    await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await sql.end();
  };
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

export async function setup(project: TestProject): Promise<void> {
  const external = process.env.TEST_DATABASE_URL;
  let url: string;
  if (external) {
    url = await createExternalDatabase(external);
  } else {
    container = await new PostgreSqlContainer("postgres:17-alpine").start();
    url = container.getConnectionUri();
  }
  await runMigrations(url);
  project.provide("databaseUrl", url);
}

export async function teardown(): Promise<void> {
  await container?.stop();
  await dropDatabase?.();
}
