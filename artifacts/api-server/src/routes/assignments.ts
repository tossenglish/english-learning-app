import {
  CreateAssignmentBody,
  CreateAssignmentResponse,
  DeleteAssignmentParams,
  ListAdminAssignmentsResponse,
  ListAdminMembersResponse,
  ListAssignmentsQueryParams,
  ListAssignmentsResponse,
} from "@workspace/api-zod";
import { clerkClient } from "@clerk/express";
import { assignmentsTable, db } from "@workspace/db";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { getUserId, isAdmin } from "../lib/auth";

const router: IRouter = Router();

function getDisplayName(user: Awaited<ReturnType<typeof clerkClient.users.getUser>>) {
  return (
    user.fullName ||
    user.username ||
    user.primaryEmailAddress?.emailAddress ||
    "이름 없는 회원"
  );
}

async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!getUserId(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  if (!(await isAdmin(req))) {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

router.get(
  "/assignments",
  async (req: Request, res: Response): Promise<void> => {
    if (!getUserId(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const query = ListAssignmentsQueryParams.safeParse(req.query);
    if (!query.success || query.data.level === "All") {
      res.status(400).json({ error: "A member learning level is required" });
      return;
    }

    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.isPublished, true),
          or(
            eq(assignmentsTable.assigneeUserId, getUserId(req)!),
            and(
              isNull(assignmentsTable.assigneeUserId),
              inArray(assignmentsTable.level, [query.data.level, "All"]),
            ),
          ),
        ),
      )
      .orderBy(desc(assignmentsTable.createdAt));

    res.json(ListAssignmentsResponse.parse(assignments));
  },
);

router.get(
  "/admin/assignments",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const assignments = await db
      .select()
      .from(assignmentsTable)
      .orderBy(desc(assignmentsTable.createdAt));

    res.json(ListAdminAssignmentsResponse.parse(assignments));
  },
);

router.get(
  "/admin/members",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const users = await clerkClient.users.getUserList({
      limit: 100,
      orderBy: "-created_at",
    });
    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const members = users.data
      .filter(
        (user) =>
          !user.emailAddresses.some(
            ({ emailAddress }) => emailAddress.toLowerCase() === adminEmail,
          ),
      )
      .map((user) => ({
        id: user.id,
        displayName: getDisplayName(user),
        email: user.primaryEmailAddress?.emailAddress ?? null,
      }));

    res.json(ListAdminMembersResponse.parse(members));
  },
);

router.post(
  "/admin/assignments",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const parsed = CreateAssignmentBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    let assigneeName: string | null = null;
    if (parsed.data.assigneeUserId) {
      try {
        const user = await clerkClient.users.getUser(parsed.data.assigneeUserId);
        assigneeName = getDisplayName(user);
      } catch {
        res.status(400).json({ error: "Selected member was not found" });
        return;
      }
    }

    const [assignment] = await db
      .insert(assignmentsTable)
      .values({
        ...parsed.data,
        assigneeUserId: parsed.data.assigneeUserId || null,
        assigneeName,
      })
      .returning();

    res.status(201).json(CreateAssignmentResponse.parse(assignment));
  },
);

router.delete(
  "/admin/assignments/:assignmentId",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const params = DeleteAssignmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deleted] = await db
      .delete(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId))
      .returning({ id: assignmentsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.sendStatus(204);
  },
);

export default router;