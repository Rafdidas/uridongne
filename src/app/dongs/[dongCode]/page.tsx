import Link from "next/link";
import { notFound } from "next/navigation";

import { getD1Database } from "@/data/publication/d1-context";
import { readPublicRegistrySnapshot, readPublishedDong } from "@/data/publication/d1-read-store";

export default async function DongPage({ params }: { params: Promise<{ dongCode: string }> }) {
  const { dongCode } = await params;
  if (!/^\d{8}$/.test(dongCode)) notFound();
  const database = await getD1Database();
  const snapshot = await readPublicRegistrySnapshot(database, "production");
  if (!snapshot) return <main className="mx-auto max-w-[48rem] px-6 py-16"><h1>동네 목록을 준비하고 있습니다.</h1><Link href="/">처음으로</Link></main>;
  const dong = await readPublishedDong(database, snapshot, dongCode);
  if (!dong) notFound();

  return <main className="mx-auto min-h-screen max-w-[48rem] px-6 py-16">
    <Link href="/" className="text-sm text-[var(--primary-highest)]">← 동네 검색</Link>
    <section className="glass-panel mt-5 rounded-[24px] p-8">
      <p className="text-sm text-[var(--surface-higher)]">{dong.districtName} · 행정동 목록 기준일 {snapshot.effectiveDate}</p>
      <h1 className="mt-2 text-3xl font-bold">{dong.name}</h1>
      <div className="glass-inset mt-8 rounded-2xl p-6"><h2 className="text-lg font-semibold">생활인구</h2><p className="mt-2 text-[var(--surface-higher)]">생활인구 데이터를 준비하고 있습니다.</p></div>
    </section>
  </main>;
}
