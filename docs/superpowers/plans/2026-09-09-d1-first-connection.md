# First D1 Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Worker to D1, publish a verified administrative-dong registry, and add search/detail UI without exposing unverified population figures.

**Architecture:** Keep `SnapshotRepository` as the synchronous local ingest harness. Add a small asynchronous request-time D1 read store that captures the public channel pointer once, then runs all registry reads by its fixed registry ID. A registry-only snapshot is explicit, so population remains unavailable.

**Tech Stack:** Next.js 16, TypeScript, OpenNext, Cloudflare D1, Wrangler, Vitest, better-sqlite3.

**Spec:** `docs/superpowers/specs/2026-09-09-d1-first-connection-design.md`

## Global Constraints

- Do not change the Worker name until its deployed Dashboard configuration is confirmed.
- Use `DB` only in request-time server code and do not expose a binding, D1 ID, raw archive, or token to clients or Git.
- Treat the MOIS 2026-07-01 registry as valid from that date only and do not apply it to earlier population periods.
- Unverified population fields remain null with reason `population_not_available`.
- Do not push without a separate user instruction.

---

### Task 1: Configure and prove the D1 binding

**Files:** Create `src/data/publication/d1-context.ts`, `src/data/publication/d1-context.test.ts`, `worker-configuration.d.ts`; modify `next.config.ts`, `wrangler.jsonc`, `package.json`, `README.md`.

**Interfaces:** `getD1Database(): Promise<D1Database>` returns the request-time `env.DB` binding.

- [ ] **Step 1: Write a failing test**

```ts
it("reads DB only through the async request context", async () => {
  await expect(getD1Database()).resolves.toBe(fakeDatabase);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- src/data/publication/d1-context.test.ts`

Expected: FAIL because `d1-context.ts` does not exist.

- [ ] **Step 3: Implement the accessor and local integration**

```ts
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getD1Database(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  if (!env.DB) throw new Error("D1 binding DB is not configured");
  return env.DB;
}
```

Initialize OpenNext local bindings in `next.config.ts`; add the D1 type and a local migration script. Add the returned database ID to `wrangler.jsonc` only after `wrangler d1 create` succeeds.

- [ ] **Step 4: Verify**

Run: `pnpm test -- src/data/publication/d1-context.test.ts && pnpm typecheck && pnpm exec wrangler d1 migrations apply uridongne-db --local`

Expected: test/typecheck pass; migrations 0001–0006 apply locally.

- [ ] **Step 5: Commit**

Run: `git add next.config.ts wrangler.jsonc package.json worker-configuration.d.ts src/data/publication/d1-context.ts src/data/publication/d1-context.test.ts README.md && git commit -m "feat: configure D1 binding"`

### Task 2: Add fixed-snapshot asynchronous registry reads

**Files:** Create `src/data/publication/d1-read-store.ts`, `src/data/publication/d1-read-store.test.ts`; modify `src/data/publication/population-overview-endpoint.ts` and its test.

**Interfaces:** `readPublicRegistrySnapshot(db, channel)`, `searchPublishedDongs(db, snapshot, query)`, and `readPublishedDong(db, snapshot, code)`. Snapshot shape is `{ snapshotId, generation, registryVersionId }`; dong shape is `{ code, name, districtName, validFrom, validToExclusive }`.

- [ ] **Step 1: Write failing tests**

```ts
it("uses the captured registry ID for all search rows", async () => {
  const snapshot = await readPublicRegistrySnapshot(db, "production");
  await searchPublishedDongs(db, snapshot!, "강남");
  expect(bindings[1]).toContain(snapshot!.registryVersionId);
});

it("escapes percent, underscore, and backslash in LIKE input", async () => {
  await searchPublishedDongs(db, snapshot, "%_\\");
  expect(bindings.at(-1)).toContain("\\%");
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- src/data/publication/d1-read-store.test.ts`

Expected: FAIL because `d1-read-store.ts` does not exist.

- [ ] **Step 3: Implement prepared D1 reads**

Read `public_channels` once, join it to `snapshot_registry_members` and a ready registry, then query rows only with captured `registryVersionId`. Escape `\\`, `%`, `_` for `LIKE ? ESCAPE '\\'`; fetch 21 ordered rows and return 20 plus `hasMore`. Do not read the latest registry directly.

- [ ] **Step 4: Add registry-only DTO behavior and verify**

Run: `pnpm test -- src/data/publication/d1-read-store.test.ts src/data/publication/population-overview-endpoint.test.ts`

Expected: registry-only known dongs return 200 with null numeric population fields; missing channel is 503; unknown codes are 404.

- [ ] **Step 5: Commit**

Run: `git add src/data/publication/d1-read-store.ts src/data/publication/d1-read-store.test.ts src/data/publication/population-overview-endpoint.ts src/data/publication/population-overview-endpoint.test.ts && git commit -m "feat: read published dongs from D1"`

### Task 3: Publish a verified registry-only snapshot

**Files:** Create `scripts/data/publish-mois-dong-registry.ts`, its test, and `migrations/0007_registry_snapshot_metadata.sql`; modify the snapshot repository, its tests, and `package.json`.

**Interfaces:** `publishRegistrySnapshot(input): { snapshotId: string; generation: number }` requires matching archive SHA-256, parser output, canonical sorted content hash, and public eligibility. Schema records the registry effective date and content hash.

- [ ] **Step 1: Write failing tests**

```ts
it("leaves the channel unchanged when the archive hash is wrong", async () => {
  await expect(publishRegistrySnapshot({ ...input, archiveSha256: "0".repeat(64) })).rejects.toThrow(/sha256/);
  expect(await channel("production")).toEqual({ snapshotId: null, generation: 0 });
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- scripts/data/publish-mois-dong-registry.test.ts`

Expected: FAIL because the publisher does not exist.

- [ ] **Step 3: Implement local publisher**

Read the ZIP only in the CLI, check the SHA-256 recorded in `docs/references/mois-administrative-dong-20260701.md`, ingest sorted parsed Seoul entries, create/validate a registry-only snapshot, and advance the public pointer with explicit operation ID and expected generation. Store `2026-07-01` as metadata; do not add raw data to Git.

- [ ] **Step 4: Verify lifecycle**

Run: `pnpm test -- scripts/data/publish-mois-dong-registry.test.ts src/data/publication/snapshot-repository.test.ts && pnpm exec wrangler d1 migrations apply uridongne-db --local`

Expected: valid registry publication succeeds; invalid archive leaves the channel unchanged; migration 0007 applies after 0001–0006.

- [ ] **Step 5: Commit**

Run: `git add migrations/0007_registry_snapshot_metadata.sql scripts/data/publish-mois-dong-registry.ts scripts/data/publish-mois-dong-registry.test.ts src/data/publication/snapshot-repository.ts src/data/publication/snapshot-repository.test.ts package.json && git commit -m "feat: publish verified dong registry snapshots"`

### Task 4: Add search and detail APIs

**Files:** Create `src/app/api/dongs/route.ts`, `src/app/api/dongs/[dongCode]/route.ts`, and their tests.

**Interfaces:** `GET /api/dongs?q=` returns `{ apiVersion: 1, snapshotId, effectiveDate, items, hasMore }`; `GET /api/dongs/<code>` returns `{ apiVersion: 1, snapshotId, effectiveDate, dong, population }`.

- [ ] **Step 1: Write failing route tests**

```ts
it("rejects empty and overlong queries", async () => {
  expect((await GET(new Request("https://local/api/dongs?q="))).status).toBe(400);
  expect((await GET(new Request(`https://local/api/dongs?q=${"가".repeat(51)}`))).status).toBe(400);
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- src/app/api/dongs/route.test.ts src/app/api/dongs/[dongCode]/route.test.ts`

Expected: FAIL because the route files do not exist.

- [ ] **Step 3: Implement request validation and DTOs**

Trim queries and reject empty or over-50-character input. Validate codes with `/^\\d{8}$/`. Return 503 for no public registry, 404 only for unknown public codes, and no SQL error details.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test -- src/app/api/dongs/route.test.ts src/app/api/dongs/[dongCode]/route.test.ts && pnpm lint && pnpm typecheck`

Expected: PASS.

Run: `git add src/app/api/dongs && git commit -m "feat: add public dong search API"`

### Task 5: Build search and unavailable-detail UI

**Files:** Create `src/app/components/dong-search.tsx`, its test, `src/app/dongs/[dongCode]/page.tsx`, and its test; modify `src/app/page.tsx`, its test, `src/app/globals.css`, `README.md`, and `handoff.md`.

**Interfaces:** Search consumes `/api/dongs?q=` and links to `/dongs/<code>`; detail renders name, district, effective date, and exact unavailable copy.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("links a result by dong code", async () => {
  render(<DongSearch />);
  await user.type(screen.getByLabelText("동네 검색"), "역삼");
  await user.click(screen.getByRole("button", { name: "검색" }));
  expect(await screen.findByRole("link", { name: /역삼/ })).toHaveAttribute("href", "/dongs/11680640");
});
```

- [ ] **Step 2: Verify failure**

Run: `pnpm test -- src/app/components/dong-search.test.tsx src/app/dongs/[dongCode]/page.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement UI states**

Use existing theme/surface tokens. Preserve input after errors, render loading/errors in an `aria-live` region, provide a distinct empty result state, and make Enter submit. Detail handles 400/404/503 and never renders zero as population.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm build`

Expected: PASS. Then browser-check search, empty result, unavailable detail, invalid code, and no-public-data state.

Run: `git add src/app README.md handoff.md && git commit -m "feat: add dong search and detail pages"`

### Task 6: Create, migrate, publish, and deploy external resources

**Files:** Modify after successful commands only: `wrangler.jsonc`, generated binding types, `README.md`, `handoff.md`.

- [ ] **Step 1: Inspect account and D1 resources**

Run: `pnpm exec wrangler whoami` and `pnpm exec wrangler d1 list`

Expected: authenticated account and an unambiguous database list. Stop if the deployed Worker differs from the configuration target.

- [ ] **Step 2: Create only when needed**

Run: `pnpm exec wrangler d1 create uridongne-db`

Expected: one returned ID, added as the `DB` binding.

- [ ] **Step 3: Migrate and publish**

Run: `pnpm exec wrangler d1 migrations apply uridongne-db --remote`, then run the verified registry publisher against that database.

Expected: ascending migrations, then a printed snapshot ID and generation.

- [ ] **Step 4: Deploy and verify**

Run: `pnpm run build:cf` then `pnpm exec opennextjs-cloudflare deploy`.

Expected: a public URL. Open it, query `/api/dongs`, open one detail page, and confirm unavailable numeric fields are null. Update README/handoff; commit documentation/configuration but do not push.

## Self-review

- Tasks 1–2 implement async D1 binding and fixed reads.
- Task 3 implements verified registry publication and effective-date evidence.
- Tasks 4–5 implement API/UI behavior, including unavailable safeguards.
- Task 6 creates/migrates/deploys only after local proof and records actual outcomes.
- Shared names are introduced before their consumers and the plan contains no deferred implementation placeholders.
