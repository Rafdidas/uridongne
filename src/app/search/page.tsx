import Link from "next/link";

import { getD1Database } from "@/data/publication/d1-context";
import { readPublicRegistrySnapshot, searchPublishedDongs } from "@/data/publication/d1-read-store";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = (await searchParams).q?.trim() ?? "";
  if (!query || query.length > 50) return <main className="mx-auto max-w-3xl px-6 py-16"><p>검색어를 1~50자로 입력해 주세요.</p><Link href="/">검색으로 돌아가기</Link></main>;

  const database = await getD1Database();
  const snapshot = await readPublicRegistrySnapshot(database, "production");
  if (!snapshot) return <main className="mx-auto max-w-3xl px-6 py-16"><h1>동네 목록을 준비하고 있습니다.</h1><Link href="/">처음으로</Link></main>;
  const { items, hasMore } = await searchPublishedDongs(database, snapshot, query);

  return <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
    <Link href="/" className="text-sm text-[var(--primary-highest)]">← 동네 검색</Link>
    <h1 className="mt-5 text-3xl font-bold">“{query}” 검색 결과</h1>
    <p className="mt-2 text-[var(--surface-higher)]">행정동 목록 기준일 {snapshot.effectiveDate}</p>
    {items.length === 0 ? <p className="glass-panel mt-8 rounded-2xl p-6">일치하는 행정동이 없습니다.</p> : <ul className="mt-8 space-y-3">{items.map(dong => <li key={dong.code}><Link href={`/dongs/${dong.code}`} className="glass-panel block rounded-2xl p-5"><strong>{dong.name}</strong><span className="ml-2 text-[var(--surface-higher)]">{dong.districtName}</span></Link></li>)}</ul>}
    {hasMore ? <p className="mt-5 text-sm text-[var(--surface-higher)]">결과가 더 있습니다. 검색어를 더 구체적으로 입력해 주세요.</p> : null}
  </main>;
}
