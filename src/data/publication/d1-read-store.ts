import type { D1Database } from "./d1-types";

export interface PublicRegistrySnapshot {
  snapshotId: string;
  generation: number;
  registryVersionId: string;
  effectiveDate: string;
}

export interface PublicDong {
  code: string;
  name: string;
  districtName: string;
  validFrom: string;
  validToExclusive: string | null;
}

export interface DongSearchResult {
  items: PublicDong[];
  hasMore: boolean;
}

interface SnapshotRow {
  snapshotId: string;
  generation: number;
  registryVersionId: string;
  effectiveDate: string;
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

export async function readPublicRegistrySnapshot(database: D1Database, channel: string): Promise<PublicRegistrySnapshot | null> {
  const snapshot = await database.prepare(`
    SELECT c.snapshot_id AS snapshotId, c.generation AS generation, m.registry_version_id AS registryVersionId,
      MIN(e.valid_from) AS effectiveDate
    FROM public_channels c
    JOIN snapshot_registry_members m ON m.snapshot_id = c.snapshot_id
    JOIN dong_registry_versions v ON v.id = m.registry_version_id AND v.state = 'ready'
    JOIN dong_registry_entries e ON e.registry_version_id = m.registry_version_id
    WHERE c.name = ?
    GROUP BY c.snapshot_id, c.generation, m.registry_version_id
  `).bind(channel).first<SnapshotRow>();
  if (!snapshot) return null;
  return snapshot;
}

export async function searchPublishedDongs(database: D1Database, snapshot: PublicRegistrySnapshot, query: string): Promise<DongSearchResult> {
  const pattern = `%${escapeLike(query)}%`;
  const rows = await database.prepare(`
    SELECT code, name, district_name AS districtName, valid_from AS validFrom, valid_to_exclusive AS validToExclusive
    FROM dong_registry_entries
    WHERE registry_version_id = ?
      AND (name LIKE ? ESCAPE '\\' OR district_name LIKE ? ESCAPE '\\')
    ORDER BY district_name ASC, name ASC, code ASC
    LIMIT 21
  `).bind(snapshot.registryVersionId, pattern, pattern).all<PublicDong>();
  return { items: rows.results.slice(0, 20), hasMore: rows.results.length > 20 };
}

export async function readPublishedDong(database: D1Database, snapshot: PublicRegistrySnapshot, dongCode: string): Promise<PublicDong | null> {
  return database.prepare(`
    SELECT code, name, district_name AS districtName, valid_from AS validFrom, valid_to_exclusive AS validToExclusive
    FROM dong_registry_entries
    WHERE registry_version_id = ? AND code = ?
    ORDER BY valid_from DESC
    LIMIT 1
  `).bind(snapshot.registryVersionId, dongCode).first<PublicDong>();
}
