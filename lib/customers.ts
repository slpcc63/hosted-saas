import "server-only";

import { redirect } from "next/navigation";

import { requireSession } from "@/lib/auth/server";
import { db } from "@/lib/db";

export type CustomerProfile = {
  id: string;
  userId: string;
  email: string;
  companyName: string | null;
  contactName: string | null;
  phone: string | null;
  status: string;
  stripeCustomerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UpsertCustomerProfileInput = {
  userId: string;
  email: string;
  companyName?: string;
  contactName?: string;
  phone?: string;
  status?: string;
};

let customerProfilesTableReady: Promise<void> | null = null;

function mapCustomerProfile(row: Record<string, unknown>): CustomerProfile {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: String(row.email),
    companyName: row.company_name ? String(row.company_name) : null,
    contactName: row.contact_name ? String(row.contact_name) : null,
    phone: row.phone ? String(row.phone) : null,
    status: String(row.status),
    stripeCustomerId: row.stripe_customer_id ? String(row.stripe_customer_id) : null,
    createdAt: new Date(String(row.created_at)),
    updatedAt: new Date(String(row.updated_at))
  };
}

export async function ensureCustomerProfilesTable() {
  if (!customerProfilesTableReady) {
    customerProfilesTableReady = db.query(`
      create extension if not exists pgcrypto;

      create table if not exists public.customer_profiles (
        id uuid primary key default gen_random_uuid(),
        user_id text not null unique,
        email text not null unique,
        company_name text,
        contact_name text,
        phone text,
        status text not null default 'active',
        stripe_customer_id text unique,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      alter table public.customer_profiles
        add column if not exists stripe_customer_id text unique;
    `).then(() => undefined);
  }

  return customerProfilesTableReady;
}

export async function getCustomerByUserId(userId: string) {
  await ensureCustomerProfilesTable();

  const result = await db.query(
    `select id, user_id, email, company_name, contact_name, phone, status, stripe_customer_id, created_at, updated_at
     from public.customer_profiles
     where user_id = $1
     limit 1`,
    [userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapCustomerProfile(result.rows[0]);
}

export async function getCustomerByIdForUser(customerId: string, userId: string) {
  await ensureCustomerProfilesTable();

  const result = await db.query(
    `select id, user_id, email, company_name, contact_name, phone, status, stripe_customer_id, created_at, updated_at
     from public.customer_profiles
     where id = $1 and user_id = $2
     limit 1`,
    [customerId, userId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapCustomerProfile(result.rows[0]);
}

export async function upsertCustomerProfile(input: UpsertCustomerProfileInput) {
  await ensureCustomerProfilesTable();

  const result = await db.query(
    `insert into public.customer_profiles (
      user_id,
      email,
      company_name,
      contact_name,
      phone,
      status
    ) values ($1, $2, $3, $4, $5, $6)
    on conflict (user_id)
    do update set
      email = excluded.email,
      company_name = excluded.company_name,
      contact_name = excluded.contact_name,
      phone = excluded.phone,
      status = excluded.status,
      updated_at = now()
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

  return mapCustomerProfile(result.rows[0]);
}

export async function setStripeCustomerId(customerId: string, stripeCustomerId: string) {
  await ensureCustomerProfilesTable();

  const result = await db.query(
    `update public.customer_profiles
     set stripe_customer_id = $2,
         updated_at = now()
     where id = $1
     returning id, user_id, email, company_name, contact_name, phone, status, stripe_customer_id, created_at, updated_at`,
    [customerId, stripeCustomerId]
  );

  if (!result.rows[0]) {
    return null;
  }

  return mapCustomerProfile(result.rows[0]);
}

export async function getOrCreateCustomerProfile(input: UpsertCustomerProfileInput) {
  const existing = await getCustomerByUserId(input.userId);

  if (existing) {
    return existing;
  }

  return upsertCustomerProfile(input);
}

export async function requireCurrentCustomer(nextPath: string, missingCustomerRedirect = "/") {
  const session = await requireSession(nextPath);
  const customer = await getCustomerByUserId(session.user.id);

  if (!customer) {
    redirect(missingCustomerRedirect);
  }

  return {
    customer,
    session,
    userId: session.user.id
  };
}
