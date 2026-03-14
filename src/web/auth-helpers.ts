import type { AuthenticatedUserView } from "../server/protocol.js";

export interface AuthRestoreResult {
  user: AuthenticatedUserView;
}

export async function restoreAuthSessionRequest(sessionToken: string): Promise<AuthRestoreResult> {
  const response = await fetch(`/api/auth/session?token=${encodeURIComponent(sessionToken)}`);
  if (!response.ok) {
    throw new Error("Saved session is no longer valid.");
  }

  return (await response.json()) as AuthRestoreResult;
}
