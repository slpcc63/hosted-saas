export type CustomerProfileInitializerInput = {
  userId: string;
  email: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  status?: string;
};

export type AuthenticatedCustomerUser = {
  id: string;
  email: string;
  name?: string | null;
};

export type CustomerProfileRow = Record<string, unknown>;

export type CustomerProfileQuery = (
  statement: string,
  values?: unknown[]
) => Promise<{ rows: CustomerProfileRow[] }>;

export class CustomerProfileAssociationConflictError extends Error {
  readonly code = "CUSTOMER_PROFILE_ASSOCIATION_CONFLICT";

  constructor() {
    super("The authenticated identity cannot be associated with this customer profile.");
    this.name = "CustomerProfileAssociationConflictError";
  }
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
  );
}

export async function getOrCreateCustomerProfileRow(
  query: CustomerProfileQuery,
  input: CustomerProfileInitializerInput
) {
  const existingBeforeInsert = await query(
    `select id, user_id, email, company_name, contact_name, phone, status, stripe_customer_id, created_at, updated_at
     from public.customer_profiles
     where user_id = $1
     limit 1`,
    [input.userId]
  );

  if (existingBeforeInsert.rows[0]) {
    return existingBeforeInsert.rows[0];
  }

  let inserted: { rows: CustomerProfileRow[] };

  try {
    inserted = await query(
      `insert into public.customer_profiles (
        user_id,
        email,
        company_name,
        contact_name,
        phone,
        status
      ) values ($1, $2, $3, $4, $5, $6)
      on conflict (user_id) do nothing
      returning id, user_id, email, company_name, contact_name, phone, status, stripe_customer_id, created_at, updated_at`,
      [
        input.userId,
        input.email.trim(),
        input.companyName?.trim() || null,
        input.contactName?.trim() || null,
        input.phone?.trim() || null,
        input.status?.trim() || "active"
      ]
    );
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new CustomerProfileAssociationConflictError();
    }

    throw error;
  }

  if (inserted.rows[0]) {
    return inserted.rows[0];
  }

  const existing = await query(
    `select id, user_id, email, company_name, contact_name, phone, status, stripe_customer_id, created_at, updated_at
     from public.customer_profiles
     where user_id = $1
     limit 1`,
    [input.userId]
  );

  if (!existing.rows[0]) {
    throw new Error("Customer profile initialization did not return a profile.");
  }

  return existing.rows[0];
}

export function getAuthenticatedCustomerProfileRow(
  query: CustomerProfileQuery,
  user: AuthenticatedCustomerUser
) {
  return getOrCreateCustomerProfileRow(query, {
    userId: user.id,
    email: user.email,
    companyName: user.name ?? user.email.split("@")[0] ?? "",
    contactName: user.name ?? "",
    status: "active"
  });
}
