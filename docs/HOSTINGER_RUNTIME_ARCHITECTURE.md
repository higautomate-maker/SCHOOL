# Hostinger runtime architecture

The application repositories import `@db-runtime`, a build-time database contract alias.

- Hostinger: `@db-runtime` → `db/adapters/node-sqlite.ts`
- Cloudflare: `@db-runtime` → `db/adapters/cloudflare-d1.ts`

Both implement `db/adapters/database.ts`, whose prepared-statement API contains only the database operations the repositories use.

The Node build sets `HIG_RUNTIME=node` before Vite loads its configuration. This has two independent effects:

1. Vite aliases `@db-runtime` directly to the Node SQLite adapter.
2. The Cloudflare Vite plugin is not imported or registered.

Because selection occurs at build time, the Node server graph cannot statically reach the Cloudflare adapter. `scripts/check-hostinger-bundle.mjs` enforces that boundary against the emitted `dist` tree.

Node SQLite uses the pinned Node 22 built-in `node:sqlite` implementation. On first access it:

1. creates the directory containing `HIG_DEMO_DB_PATH`;
2. enables WAL, foreign keys, and a bounded busy timeout;
3. applies each checked-in SQLite migration exactly once;
4. records applied filenames in `hig_schema_migrations`.

The adapter supports prepared binding, reads, writes, and atomic batches. The separate `server/demo-store.ts` snapshot uses the same persistent SQLite path, allowing the linked Company, School, Teacher, Parent, Student, and Driver demo experiences to survive container restarts.
