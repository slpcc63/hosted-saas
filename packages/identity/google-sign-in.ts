export type GoogleSignInResponse = {
  error?: {
    message?: string;
  } | null;
};

type GoogleSignInInput = {
  callbackURL: string;
  onError: (message: string | null) => void;
  onSubmittingChange: (submitting: boolean) => void;
  onStatusChange: (message: string | null) => void;
  signIn: (input: {
    callbackURL: string;
    provider: "google";
  }) => Promise<GoogleSignInResponse>;
};

export async function runGoogleSignIn(input: GoogleSignInInput) {
  input.onError(null);
  input.onStatusChange("Redirecting to Google...");
  input.onSubmittingChange(true);

  try {
    const response = await input.signIn({
      provider: "google",
      callbackURL: input.callbackURL
    });

    if (response.error) {
      input.onError(response.error.message ?? "Google sign-in failed.");
      input.onStatusChange(null);
      input.onSubmittingChange(false);
      return false;
    }

    return true;
  } catch (error) {
    input.onError(
      error instanceof Error ? error.message : "Google sign-in failed."
    );
    input.onStatusChange(null);
    input.onSubmittingChange(false);
    return false;
  }
}
