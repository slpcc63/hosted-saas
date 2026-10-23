type DeliveryEnvironment = { [key: string]: string | undefined; VERCEL_ENV?: string; TCM_PREVIEW_DELIVERY_OFF?: string };

// This opt-in flag belongs only to the isolated TCM Preview deployment.
export function isTcmDeliveryOff(env: DeliveryEnvironment = process.env) {
  return env.VERCEL_ENV === "preview" && env.TCM_PREVIEW_DELIVERY_OFF === "true";
}

export function assertTcmDeliveryAllowed(env: DeliveryEnvironment = process.env) {
  if (isTcmDeliveryOff(env)) {
    throw new Error("External delivery is disabled for this Time Card Manager Preview");
  }
}
