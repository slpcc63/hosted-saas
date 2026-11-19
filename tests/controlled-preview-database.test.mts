import assert from "node:assert/strict";
import test from "node:test";
import { selectDatabaseUrl } from "../lib/database-url.ts";

const preview = {
  VERCEL_ENV: "preview",
  SLPCC63_CONTROLLED_PREVIEW: "1",
  AUTH_PREVIEW_DATABASE_HOST: "ep-synthetic.aws.neon.tech",
  TCM_PREVIEW_DATABASE_URL: "postgresql://synthetic:fake@ep-synthetic.aws.neon.tech/neondb",
  DATABASE_URL: "postgresql://must-not-use/shared",
  TCM_QA_DATABASE_URL: "postgresql://must-not-use/qa"
};

test("controlled preview uses only the verified existing preview connection", () => {
  assert.equal(selectDatabaseUrl(preview), preview.TCM_PREVIEW_DATABASE_URL);
  const pooled = preview.TCM_PREVIEW_DATABASE_URL.replace("ep-synthetic.", "ep-synthetic-pooler.");
  assert.equal(selectDatabaseUrl({ ...preview, TCM_PREVIEW_DATABASE_URL: pooled }), pooled);
});
test("controlled preview cannot fall back to inherited databases", () => {
  for (const override of [
    { TCM_PREVIEW_DATABASE_URL: undefined },
    { TCM_PREVIEW_DATABASE_URL: "not-a-url" },
    { TCM_PREVIEW_DATABASE_URL: "postgresql://different-host/neondb" },
    { TCM_PREVIEW_DATABASE_URL: "postgresql://ep-synthetic.aws.neon.tech/production" },
    { AUTH_PREVIEW_DATABASE_HOST: undefined },
    { VERCEL_ENV: "production" },
    { SLPCC63_PRODUCT_RUNTIME: "calendar-sync" }
  ]) assert.throws(() => selectDatabaseUrl({ ...preview, ...override }));
});
test("ordinary production database selection is unchanged", () => {
  assert.equal(selectDatabaseUrl({ VERCEL_ENV: "production", DATABASE_URL: "postgresql://original/prod" }), "postgresql://original/prod");
});
