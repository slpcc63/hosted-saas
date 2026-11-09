export type SharedProductIdentity = Readonly<{
  authUserId: string;
  customerProfileId: string;
  displayName: string | null;
  email: string;
}>;

export function validateSharedProductIdentity(value: SharedProductIdentity) {
  if (!value.authUserId.trim() || !value.customerProfileId.trim()) {
    throw new Error("Shared identity requires stable auth and customer profile IDs.");
  }

  if (!value.email.includes("@")) {
    throw new Error("Shared identity email is invalid.");
  }

  return value;
}
