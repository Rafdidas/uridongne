import { notFound } from "next/navigation";

import { StyleBorderRadius, StyleSpacing } from "@/styles/styleConstants";

export const metadata = { robots: { index: false, follow: false } };

export default function StylesPage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="mx-auto max-w-[1200px] p-md md:p-lg">
      <p className="text-label-md text-changeNeutral">동네로그 · 개발용</p>
      <h1 className="mt-xs text-display-lg">기본 스타일 확인</h1>
      <p className="mt-sm text-body-xl">디자인 검토용 예시이며 실제 동네 데이터가 아닙니다.</p>
      <section className="glass-panel mt-lg rounded-panel p-md md:p-lg">
        <label htmlFor="sample-search" className="text-label-md">동네 검색 입력</label>
        <input id="sample-search" type="search" placeholder="예: 망원1동" className="glass-inset mt-sm min-h-11 w-full rounded-pill border border-outline px-md text-body-xl" />
        <div className="mt-md grid gap-md sm:grid-cols-3">
          <article className="glass-inset rounded-card p-md"><p className="text-label-sm">카페</p><p className="mt-xs text-display-sm text-changeIncrease">+14</p></article>
          <article className="glass-inset rounded-card p-md"><p className="text-label-sm">미용업</p><p className="mt-xs text-display-sm text-changeDecrease">−3</p></article>
          <article className="glass-inset rounded-card p-md"><p className="text-label-sm">생활인구</p><p className="mt-xs text-display-sm">+4.2%</p></article>
        </div>
        <button type="button" className="mt-md min-h-11 rounded-pill bg-primary px-md py-sm text-label-md text-onPrimary">기본 버튼</button>
      </section>
      <section className="glass-panel mt-lg rounded-panel p-md">
        <h2 className="text-title-md">토큰 값</h2>
        <p className="mt-xs text-body-md">카드 {StyleBorderRadius.card} · 패널 {StyleBorderRadius.panel} · 기본 간격 {StyleSpacing.md}</p>
        <div data-breakpoint-probe className="mt-md rounded-card bg-primaryLow p-xxs sm:p-xs md:p-sm lg:p-md xl:p-lg 2xl:p-xl">반응형 간격 확인</div>
      </section>
    </main>
  );
}
