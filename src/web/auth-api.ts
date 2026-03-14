import type { AdminOverview, AuthenticatedUserView, PublicRoomSummary } from "../server/protocol.js";

interface AuthSuccessResponse {
  token: string;
  user: AuthenticatedUserView;
}

interface ErrorResponse {
  message: string;
}

interface AdminOverviewResponse {
  viewer?: AuthenticatedUserView;
  overview?: AdminOverview;
  message?: string;
}

interface PublicRoomListResponse {
  rooms?: PublicRoomSummary[];
  message?: string;
}

export async function submitAuthRequestToServer(
  path: string,
  payload: Record<string, string>
): Promise<AuthSuccessResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = (await response.json()) as AuthSuccessResponse | ErrorResponse;

  if (!response.ok || "message" in data) {
    throw new Error("message" in data ? data.message : "Authentication failed.");
  }

  return data;
}

export async function logoutSessionOnServer(token: string): Promise<void> {
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ token })
  });
}

export async function fetchAdminOverviewFromServer(token: string): Promise<AdminOverviewResponse> {
  const response = await fetch(`/api/admin/overview?token=${encodeURIComponent(token)}`);
  const data = (await response.json()) as AdminOverviewResponse;
  if (!response.ok || data.overview === undefined || data.viewer === undefined) {
    throw new Error(data.message ?? "Failed to load admin overview.");
  }

  return data;
}

export async function adjustAdminBalanceOnServer(
  token: string,
  targetUserId: string,
  amount: string
): Promise<AdminOverviewResponse> {
  const response = await fetch("/api/admin/adjust-balance", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      token,
      targetUserId,
      amount
    })
  });
  const data = (await response.json()) as AdminOverviewResponse;
  if (!response.ok || data.overview === undefined || data.viewer === undefined) {
    throw new Error(data.message ?? "Failed to adjust balance.");
  }

  return data;
}

export async function fetchPublicRoomsFromServer(token: string): Promise<PublicRoomSummary[]> {
  const response = await fetch(`/api/lobby/rooms?token=${encodeURIComponent(token)}`);
  const data = (await response.json()) as PublicRoomListResponse;
  if (!response.ok || data.rooms === undefined) {
    throw new Error(data.message ?? "Failed to load public rooms.");
  }

  return data.rooms;
}
