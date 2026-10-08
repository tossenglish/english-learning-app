import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";

const ALWAYS_ADMIN_EMAIL = "ok-mbc@daum.net";

export function getUserId(req: Request): string | null {
  const auth = getAuth(req);
  const claimUserId = auth?.sessionClaims?.userId;
  if (typeof claimUserId === "string") return claimUserId;
  return auth?.userId || null;
}

export function isAdminEmail(emailAddress: string): boolean {
  const normalizedEmail = emailAddress.trim().toLowerCase();
  const configuredAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

  return (
    normalizedEmail === ALWAYS_ADMIN_EMAIL ||
    Boolean(configuredAdminEmail && normalizedEmail === configuredAdminEmail)
  );
}

export async function isAdmin(req: Request): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) return false;

  const user = await clerkClient.users.getUser(userId);
  return (
    user.publicMetadata.role === "admin" ||
    user.emailAddresses.some(({ emailAddress }) => isAdminEmail(emailAddress))
  );
}