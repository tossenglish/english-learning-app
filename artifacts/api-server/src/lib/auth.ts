import { clerkClient, getAuth } from "@clerk/express";
import type { Request } from "express";

export function getUserId(req: Request): string | null {
  const auth = getAuth(req);
  const claimUserId = auth?.sessionClaims?.userId;
  if (typeof claimUserId === "string") return claimUserId;
  return auth?.userId || null;
}

export async function isAdmin(req: Request): Promise<boolean> {
  const userId = getUserId(req);
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!userId || !adminEmail) return false;

  const user = await clerkClient.users.getUser(userId);
  return user.emailAddresses.some(
    ({ emailAddress }) => emailAddress.toLowerCase() === adminEmail,
  );
}