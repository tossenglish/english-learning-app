import { clerkClient, getAuth } from "@clerk/express";
import type { Request, RequestHandler } from "express";

const ALWAYS_ADMIN_USERNAME = "ok-mbc";
const ALWAYS_ADMIN_EMAIL = "ok-mbc@daum.net";

type AdminAwareRequest = Request & { adminAccess?: boolean };

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

function isAdminUser(
  user: Awaited<ReturnType<typeof clerkClient.users.getUser>>,
): boolean {
  return (
    user.username?.trim().toLowerCase() === ALWAYS_ADMIN_USERNAME ||
    user.publicMetadata.role === "admin" ||
    user.emailAddresses.some(({ emailAddress }) => isAdminEmail(emailAddress))
  );
}

export async function isAdmin(req: Request): Promise<boolean> {
  const cachedAdminAccess = (req as AdminAwareRequest).adminAccess;
  if (typeof cachedAdminAccess === "boolean") return cachedAdminAccess;

  const userId = getUserId(req);
  if (!userId) return false;

  const user = await clerkClient.users.getUser(userId);
  return isAdminUser(user);
}

export const adminIdentityMiddleware: RequestHandler = (
  req,
  _res,
  next,
) => {
  void isAdmin(req)
    .then((allowed) => {
      (req as AdminAwareRequest).adminAccess = allowed;
      next();
    })
    .catch(next);
}