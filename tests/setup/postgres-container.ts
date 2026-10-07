import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
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

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer("postgres:17-alpine").start();
  const url = container.getConnectionUri();
  await runMigrations(url);
  project.provide("databaseUrl", url);
}

export async function teardown(): Promise<void> {
  await container?.stop();
}
