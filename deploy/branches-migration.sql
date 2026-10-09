/* ============================================================================
   Optix Medical Sync — multi-branch management: schema verification + backfill
   ============================================================================

   WHY THIS FILE EXISTS
   --------------------
   This codebase has NO migration system, and none is required for the
   multi-branch build:

     1. Storage is a document-style key/value store: ONE table `kv`
        (t TEXT, id TEXT, data JSONB, PRIMARY KEY (t, id)) plus a `meta`
        table. There is no per-entity DDL and no ALTER TABLE to run.
     2. Adding 'branches' to the TABLES whitelist in `cloud/db-pg.js` and
        `cloud/db-sqlite.js` is sufficient. Both adapters run
        `CREATE TABLE IF NOT EXISTS kv (...)` at boot, so the table always
        exists before any code touches it.
     3. Per-lab `maxBranches` / `features` are schemaless JSON fields on the
        `_saas_labs` registry row in the same `kv` table (t = '_saas_labs');
        no column changes are needed. The default is already handled at
        read time (`cloud/saas.js`: DEFAULT_MAX_BRANCHES = 5).

   So: NOTHING in this file is strictly required for the branch build to
   work. It exists for two safety purposes:

     A. VERIFICATION — the idempotent statements in section 2 confirm the
        `kv` table exists with the exact shape the adapters expect, so a
        human (or deploy script) can sanity-check any database before a
        deploy. Running them is a no-op on a healthy database.
     B. MANUAL BACKFILL — section 3 gives an idempotent way to materialize
        `maxBranches` = 5 on every `_saas_labs` row that lacks it, in case an
        operator wants the value visible in stored rows rather than applied
        at read time. It is expressed as a Node one-liner using the repo's
        own db layer, NOT as raw SQL: merging into a JSONB document from
        SQL (`jsonb_set`, `||`) is error-prone and bypasses the store's
        patch semantics; the Node one-liner reuses `store.patch()` and the
        app's own DEFAULT_MAX_BRANCHES constant instead.

   Run against PostgreSQL with:  psql "$DATABASE_URL" -f deploy/branches-migration.sql
   (Safe to run any number of times; does not write any data itself.)
   ========================================================================== */


-- ----------------------------------------------------------------------------
-- 2. VERIFY the kv table exists with the exact shape the adapters expect.
--    Copied verbatim from cloud/db-pg.js openStore(). Idempotent.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kv (
  t TEXT NOT NULL,
  id TEXT NOT NULL,
  data JSONB NOT NULL,
  PRIMARY KEY (t, id)
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

-- Confirm shape: these SELECTs verify the expected columns are present and
-- abort visibly (assertion failure) if a drifted table ever exists.
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kv' AND column_name = 't' AND data_type = 'text'
  ), 'kv.t missing or wrong type';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kv' AND column_name = 'id' AND data_type = 'text'
  ), 'kv.id missing or wrong type';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'kv' AND column_name = 'data' AND data_type = 'jsonb'
  ), 'kv.data missing or wrong type';
END $$;


-- ----------------------------------------------------------------------------
-- 3. BACKFILL: for every _saas_labs registry row lacking maxBranches, set 5.
--    Deliberately NOT written as raw SQL — JSONB merging via SQL is
--    error-prone; do it with the repo's own db layer instead.
--
--    Run this one-liner from the repo root (uses openStore from
--    cloud/db-pg.js; pass DATABASE_URL env var or let pg read
--    PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE like docker-compose sets up):
--
--      DATABASE_URL="postgres://user:pass@host:5432/db" node -e "
--        (async () => {
--          const { openStore } = require('./cloud/db-pg.js');
--          const { DEFAULT_MAX_BRANCHES } = require('./cloud/saas.js');
--          const store = await openStore(process.env.DATABASE_URL || '');
--          let fixed = 0;
--          for (const lab of await store.all('_saas_labs')) {
--            if (lab.maxBranches == null) {
--              await store.patch('_saas_labs', lab.id, { maxBranches: DEFAULT_MAX_BRANCHES });
--              fixed++;
--            }
--          }
--          console.log('backfilled ' + fixed + ' lab(s) with maxBranches=' + DEFAULT_MAX_BRANCHES);
--          await store.close();
--        })().catch(e => { console.error(e); process.exit(1); });
--        "
--
--    Notes:
--      * `store.patch()` reads the whole row, merges, and re-writes it with
--        put() + ON CONFLICT upsert — identical semantics to the app's own
--        writes (saveLab), so no other fields are touched.
--      * The value comes from `DEFAULT_MAX_BRANCHES` in cloud/saas.js (5 as
--        of this writing), not a hardcoded literal, so a future default
--        change is picked up automatically.
--      * Idempotent: rows that already have maxBranches are skipped.
--      * SQLite variant: swap require('./cloud/db-pg.js') for
--        require('./cloud/db-sqlite.js') and pass the sqlite file path to
--        openStore instead of DATABASE_URL.
-- ----------------------------------------------------------------------------


-- ----------------------------------------------------------------------------
-- 4. VERIFICATION QUERY: count of labs and their maxBranches.
-- ----------------------------------------------------------------------------
SELECT
  COUNT(*)                                            AS lab_count,
  COUNT(*) FILTER (WHERE (data->>'maxBranches') IS NULL) AS labs_missing_max_branches,
  COUNT(*) FILTER (WHERE (data->>'maxBranches') IS NOT NULL) AS labs_with_max_branches
FROM kv
WHERE t = '_saas_labs';

SELECT
  id          AS lab_id,
  data->>'slug'       AS slug,
  data->>'name'       AS name,
  (data->>'maxBranches')::int AS max_branches
FROM kv
WHERE t = '_saas_labs'
ORDER BY lab_id;
