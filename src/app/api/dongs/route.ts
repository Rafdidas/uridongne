import { getD1Database } from "@/data/publication/d1-context";
import { readPublicRegistrySnapshot, searchPublishedDongs } from "@/data/publication/d1-read-store";

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query || query.length > 50) return Response.json({ error: "invalid_search_query" }, { status: 400 });

  const database = await getD1Database();
  const snapshot = await readPublicRegistrySnapshot(database, "production");
  if (!snapshot) return Response.json({ error: "data_not_ready" }, { status: 503 });
  const search = await searchPublishedDongs(database, snapshot, query);
  return Response.json({ apiVersion: 1, snapshotId: snapshot.snapshotId, effectiveDate: snapshot.effectiveDate, ...search });
}
