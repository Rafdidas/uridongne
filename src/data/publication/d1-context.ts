import { getCloudflareContext } from "@opennextjs/cloudflare";

import type { D1Database } from "./d1-types";

export async function getD1Database(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) throw new Error("D1 binding DB is not configured");
  return env.DB;
}
