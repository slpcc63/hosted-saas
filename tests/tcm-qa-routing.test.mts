import assert from "node:assert/strict";
import test from "node:test";

import { selectDatabaseUrl } from "../lib/database-url.ts";
import {
  getApplicationRewritePath,
  isApplicationHostname,
  isTimeCardManagerQaHostname
} from "../lib/product-host.ts";

const qaEnvironment = {
  APP_SUBDOMAIN: "app",
  NEXT_PUBLIC_ROOT_DOMAIN: "slpcc63.com",
  TCM_QA_HOST: "qa.tcm.slpcc63.com"
};

test("TCM QA is an application host with a product-specific landing page", () => {
  assert.equal(isTimeCardManagerQaHostname("qa.tcm.slpcc63.com", qaEnvironment), true);
  assert.equal(isApplicationHostname("qa.tcm.slpcc63.com", qaEnvironment), true);
  assert.equal(
    getApplicationRewritePath("/", "qa.tcm.slpcc63.com", qaEnvironment),
    "/app/time-card-manager"
  );
  assert.equal(
    getApplicationRewritePath("/sign-in", "qa.tcm.slpcc63.com", qaEnvironment),
    "/app/sign-in"
  );
});

test("Calendar and production host behavior is unchanged", () => {
  assert.equal(isApplicationHostname("app.slpcc63.com", qaEnvironment), true);
  assert.equal(getApplicationRewritePath("/", "app.slpcc63.com", qaEnvironment), "/app");
  assert.equal(isApplicationHostname("hosted-saas.vercel.app", qaEnvironment), false);
});

test("TCM QA database takes precedence only when its branch-scoped variable exists", () => {
  assert.equal(selectDatabaseUrl({
    DATABASE_URL: "postgresql://shared",
    TCM_QA_DATABASE_URL: "postgresql://tcm-qa"
  }), "postgresql://tcm-qa");
  assert.equal(selectDatabaseUrl({
    DATABASE_URL: "postgresql://shared"
  }), "postgresql://shared");
});
