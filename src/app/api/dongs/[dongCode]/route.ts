import { getD1Database } from "@/data/publication/d1-context";
import { readPublicRegistrySnapshot, readPublishedDong } from "@/data/publication/d1-read-store";

export async function GET(_request: Request, context: { params: Promise<{ dongCode: string }> }): Promise<Response> {
  const { dongCode } = await context.params;
  if (!/^\d{8}$/.test(dongCode)) return Response.json({ error: "invalid_dong_code" }, { status: 400 });

  const database = await getD1Database();
  const snapshot = await readPublicRegistrySnapshot(database, "production");
  if (!snapshot) return Response.json({ error: "data_not_ready" }, { status: 503 });
  const dong = await readPublishedDong(database, snapshot, dongCode);
  if (!dong) return Response.json({ error: "dong_not_found" }, { status: 404 });
  return Response.json({
    apiVersion: 1,
    snapshotId: snapshot.snapshotId,
    effectiveDate: snapshot.effectiveDate,
    dong,
    population: { status: "unavailable", currentMean: null, comparisonMode: "unavailable", comparisonPeriod: null, previousMean: null, difference: null, percentChange: null, reasonCodes: ["population_not_available"] },
  });
}
