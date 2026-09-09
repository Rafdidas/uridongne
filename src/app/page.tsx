export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[48rem] items-center px-6 py-16">
      <section className="glass-panel w-full rounded-[24px] p-8 shadow-sm sm:p-12">
        <p className="text-sm font-semibold text-[var(--primary-highest)]">동네로그</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">숫자로 보는 우리 동네의 변화</h1>
        <p className="mt-4 max-w-[36rem] leading-7 text-[var(--surface-higher)]">동네 변화 데이터를 준비하고 있습니다. 서울 행정동을 찾아 확인하세요. 생활인구 지표는 검증을 마치는 대로 공개합니다.</p>
        <form action="/search" className="mt-8 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="dong-search">동네 검색</label>
          <input id="dong-search" name="q" type="search" required minLength={1} maxLength={50} placeholder="예: 역삼, 성수, 연희" className="glass-inset min-w-0 flex-1 rounded-xl border border-[var(--outline)] px-4 py-3 text-base" />
          <button type="submit" className="rounded-xl bg-[var(--primary)] px-5 py-3 font-semibold text-white">동네 검색</button>
        </form>
      </section>
    </main>
  );
}
