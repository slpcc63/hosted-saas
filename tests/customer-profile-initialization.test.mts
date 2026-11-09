import assert from "node:assert/strict";
import test from "node:test";

import {
  CustomerProfileAssociationConflictError,
  getAuthenticatedCustomerProfileRow,
  getOrCreateCustomerProfileRow,
  type CustomerProfileQuery,
  type CustomerProfileRow
} from "../lib/customer-profile-initialization.ts";

function profileRow(overrides: Partial<CustomerProfileRow> = {}): CustomerProfileRow {
  return {
    id: "customer-1",
    user_id: "user-1",
    email: "owner@example.test",
    company_name: "Existing Company",
    contact_name: "Existing Owner",
    phone: "555-0100",
    status: "active",
    stripe_customer_id: "stripe-customer-1",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides
  };
}

class SyntheticCustomerProfiles {
  readonly rows: CustomerProfileRow[];
  readonly statements: string[] = [];
  private nextId = 1;

  constructor(initialRows: CustomerProfileRow[] = []) {
    this.rows = initialRows.map((row) => ({ ...row }));
  }

  query: CustomerProfileQuery = async (statement, values = []) => {
    this.statements.push(statement);

    if (statement.includes("select id") && statement.includes("where user_id = $1")) {
      const row = this.rows.find((candidate) => candidate.user_id === values[0]);
      return { rows: row ? [{ ...row }] : [] };
    }

    if (statement.includes("insert into public.customer_profiles")) {
      const [userId, email, companyName, contactName, phone, status] = values;
      const existingUser = this.rows.find((candidate) => candidate.user_id === userId);

      if (existingUser) {
        return { rows: [] };
      }

      if (this.rows.some((candidate) => candidate.email === email)) {
        throw Object.assign(new Error("synthetic unique constraint"), { code: "23505" });
      }

      const now = "2026-11-09T00:00:00.000Z";
      const row = profileRow({
        id: `synthetic-customer-${this.nextId++}`,
        user_id: userId,
        email,
        company_name: companyName,
        contact_name: contactName,
        phone,
        status,
        stripe_customer_id: null,
        created_at: now,
        updated_at: now
      });
      this.rows.push(row);
      return { rows: [{ ...row }] };
    }

    throw new Error(`Unexpected synthetic query: ${statement}`);
  };
}

test("first authenticated Google user gets a profile before protected routing", async () => {
  const database = new SyntheticCustomerProfiles();

  const customer = await getAuthenticatedCustomerProfileRow(database.query, {
    id: "google-user-1",
    email: "new-google-user@example.test",
    name: "New Google User"
  });

  assert.equal(customer.user_id, "google-user-1");
  assert.equal(customer.email, "new-google-user@example.test");
  assert.equal(customer.company_name, "New Google User");
  assert.equal(customer.contact_name, "New Google User");
  assert.equal(database.rows.length, 1);
});

test("protected-route initialization terminates and is idempotent on repeat requests", async () => {
  const database = new SyntheticCustomerProfiles();
  const user = {
    id: "google-user-2",
    email: "repeat@example.test",
    name: "Repeat User"
  };

  const first = await getAuthenticatedCustomerProfileRow(database.query, user);
  const second = await getAuthenticatedCustomerProfileRow(database.query, user);

  assert.equal(first.id, second.id);
  assert.equal(database.rows.length, 1);
  assert.equal(
    database.statements.filter((statement) =>
      statement.includes("insert into public.customer_profiles")
    ).length,
    1
  );
});

test("existing customer data is returned without clobbering profile fields", async () => {
  const original = profileRow();
  const database = new SyntheticCustomerProfiles([original]);

  const customer = await getOrCreateCustomerProfileRow(database.query, {
    userId: "user-1",
    email: "changed-session-email@example.test",
    companyName: "Changed Session Name",
    contactName: "Changed Session Name",
    phone: "555-9999",
    status: "suspended"
  });

  assert.deepEqual(customer, original);
  assert.deepEqual(database.rows[0], original);
  assert.equal(
    database.statements.some((statement) =>
      statement.includes("insert into public.customer_profiles")
    ),
    false
  );
});

test("concurrent first requests resolve to one customer profile", async () => {
  const database = new SyntheticCustomerProfiles();
  const input = {
    userId: "concurrent-user",
    email: "concurrent@example.test",
    companyName: "Concurrent User",
    contactName: "Concurrent User",
    status: "active"
  };

  const [first, second] = await Promise.all([
    getOrCreateCustomerProfileRow(database.query, input),
    getOrCreateCustomerProfileRow(database.query, input)
  ]);

  assert.equal(first.id, second.id);
  assert.equal(database.rows.length, 1);
});

test("same user safely reuses its profile while a different user cannot claim its email", async () => {
  const original = profileRow();
  const database = new SyntheticCustomerProfiles([original]);

  const sameUser = await getAuthenticatedCustomerProfileRow(database.query, {
    id: "user-1",
    email: "owner@example.test",
    name: "Provider Display Name"
  });
  assert.equal(sameUser.id, original.id);

  await assert.rejects(
    getAuthenticatedCustomerProfileRow(database.query, {
      id: "different-provider-user",
      email: "owner@example.test",
      name: "Different Identity"
    }),
    (error: unknown) => {
      assert.ok(error instanceof CustomerProfileAssociationConflictError);
      assert.equal(error.code, "CUSTOMER_PROFILE_ASSOCIATION_CONFLICT");
      return true;
    }
  );

  assert.equal(database.rows.length, 1);
  assert.deepEqual(database.rows[0], original);
});
