import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

type SyntheticSession = {
  user: {
    id: string;
    email: string;
    name: string | null;
  };
} | null;

type SyntheticRow = Record<string, unknown>;

const projectRoot = process.env.WRAPPER_TEST_PROJECT_ROOT ?? process.cwd();
const moduleUrl = (relativePath: string) =>
  pathToFileURL(path.join(projectRoot, relativePath)).href;
const dataModuleUrl = (source: string) =>
  `data:text/javascript,${encodeURIComponent(source)}`;
const authModuleUrl = dataModuleUrl(
  "export const auth = { api: { getSession: async () => globalThis.__wrapperTestGetSession() } };"
);
const databaseModuleUrl = dataModuleUrl(
  "export const db = { query: (...args) => globalThis.__wrapperTestDatabaseQuery(...args) };"
);
const headersModuleUrl = dataModuleUrl(
  "export const headers = async () => new Headers();"
);
const navigationModuleUrl = dataModuleUrl(
  "export const redirect = (destination) => globalThis.__wrapperTestRedirect(destination);"
);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        shortCircuit: true,
        url: "data:text/javascript,export%20{}"
      };
    }

    if (specifier === "@/lib/auth") {
      return { shortCircuit: true, url: authModuleUrl };
    }

    if (specifier === "@/lib/db") {
      return { shortCircuit: true, url: databaseModuleUrl };
    }

    if (specifier.startsWith("@/")) {
      return {
        shortCircuit: true,
        url: moduleUrl(`${specifier.slice(2)}.ts`)
      };
    }

    if (specifier === "next/headers") {
      return { shortCircuit: true, url: headersModuleUrl };
    }

    if (specifier === "next/navigation") {
      return { shortCircuit: true, url: navigationModuleUrl };
    }

    return nextResolve(specifier, context);
  }
});

let session: SyntheticSession = null;
const redirects: string[] = [];
const rows: SyntheticRow[] = [];
let databaseQueries = 0;

class SyntheticRedirect extends Error {
  readonly destination: string;

  constructor(destination: string) {
    super(`Redirected to ${destination}`);
    this.name = "SyntheticRedirect";
    this.destination = destination;
  }
}

Object.assign(globalThis, {
  __wrapperTestGetSession: async () => session,
  __wrapperTestRedirect: (destination: string) => {
    redirects.push(destination);
    throw new SyntheticRedirect(destination);
  },
  __wrapperTestDatabaseQuery: async (
    statement: string,
    values: unknown[] = []
  ) => {
    databaseQueries += 1;

    if (statement.includes("create table if not exists public.customer_profiles")) {
      return { rows: [] };
    }

    if (statement.includes("where user_id = $1")) {
      const row = rows.find((candidate) => candidate.user_id === values[0]);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (statement.includes("insert into public.customer_profiles")) {
      const now = "2026-11-09T00:00:00.000Z";
      const row = {
        id: "wrapper-customer-1",
        user_id: values[0],
        email: values[1],
        company_name: values[2],
        contact_name: values[3],
        phone: values[4],
        status: values[5],
        stripe_customer_id: null,
        created_at: now,
        updated_at: now
      };
      rows.push(row);
      return { rows: [{ ...row }] };
    }

    throw new Error(`Unexpected synthetic query: ${statement}`);
  }
});

const { requireCurrentCustomer } = await import(moduleUrl("lib/customers.ts"));
const requireCurrentCustomerWithLegacyFallback = requireCurrentCustomer as (
  nextPath: string,
  legacyMissingCustomerRedirect?: string
) => ReturnType<typeof requireCurrentCustomer>;

test("production requireCurrentCustomer creates a missing profile without the former /app redirect", async () => {
  redirects.length = 0;
  session = {
    user: {
      id: "google-wrapper-user",
      email: "wrapper-user@example.test",
      name: "Wrapper User"
    }
  };

  const result = await requireCurrentCustomerWithLegacyFallback(
    "/time-card-manager",
    "/app"
  );

  assert.equal(result.userId, "google-wrapper-user");
  assert.equal(result.customer.id, "wrapper-customer-1");
  assert.equal(result.customer.email, "wrapper-user@example.test");
  assert.equal(rows.length, 1);
  assert.deepEqual(redirects, []);
});

test("production requireCurrentCustomer still redirects unauthenticated users to sign-in", async () => {
  redirects.length = 0;
  session = null;
  const queriesBeforeRequest = databaseQueries;

  await assert.rejects(
    requireCurrentCustomer("/time-card-manager"),
    (error: unknown) => {
      assert.ok(error instanceof SyntheticRedirect);
      assert.equal(error.destination, "/sign-in?next=%2Ftime-card-manager");
      return true;
    }
  );

  assert.equal(databaseQueries, queriesBeforeRequest);
  assert.deepEqual(redirects, ["/sign-in?next=%2Ftime-card-manager"]);
});
