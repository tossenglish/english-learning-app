import {
  CreateAssignmentFolderBody,
  CreateAssignmentFolderResponse,
  CreateAssignmentBody,
  CreateAssignmentResponse,
  DeleteAssignmentParams,
  ListAdminAssignmentFoldersResponse,
  ListAdminAssignmentsResponse,
  ListAdminMembersResponse,
  ListAssignmentsQueryParams,
  ListAssignmentsResponse,
  UpdateMemberCourseBody,
  UpdateMemberCourseParams,
  UpdateMemberCourseResponse,
} from "@workspace/api-zod";
import { clerkClient } from "@clerk/express";
import {
  assignmentFoldersTable,
  assignmentsTable,
  db,
  memberCoursesTable,
} from "@workspace/db";
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

    const memberId = getUserId(req)!;
    const [course] = await db
      .select()
      .from(memberCoursesTable)
      .where(eq(memberCoursesTable.memberId, memberId));
    const visibleLevels = course ? [course.courseLevel, "All"] : ["All"];

    const assignments = await db
      .select()
      .from(assignmentsTable)
      .where(
        and(
          eq(assignmentsTable.isPublished, true),
          or(
            eq(assignmentsTable.assigneeUserId, memberId),
            and(
              isNull(assignmentsTable.assigneeUserId),
              inArray(assignmentsTable.level, visibleLevels),
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
  "/admin/assignment-folders",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const folders = await db
      .select()
      .from(assignmentFoldersTable)
      .orderBy(desc(assignmentFoldersTable.createdAt));

    res.json(ListAdminAssignmentFoldersResponse.parse(folders));
  },
);

router.post(
  "/admin/assignment-folders",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const parsed = CreateAssignmentFolderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const name = parsed.data.name.trim();
    if (!name) {
      res.status(400).json({ error: "Folder name cannot be empty" });
      return;
    }

    const [folder] = await db
      .insert(assignmentFoldersTable)
      .values({ ...parsed.data, name })
      .onConflictDoNothing()
      .returning();

    if (!folder) {
      res.status(409).json({ error: "A folder with this name already exists for this material type" });
      return;
    }

    res.status(201).json(CreateAssignmentFolderResponse.parse(folder));
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
    const userIds = users.data.map((user) => user.id);
    const courseAssignments = userIds.length > 0
      ? await db
        .select()
        .from(memberCoursesTable)
        .where(inArray(memberCoursesTable.memberId, userIds))
      : [];
    const courseByMember = new Map(
      courseAssignments.map(({ memberId, courseLevel }) => [memberId, courseLevel]),
    );
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
        course: courseByMember.get(user.id) ?? null,
      }));

    res.json(ListAdminMembersResponse.parse(members));
  },
);

router.put(
  "/admin/members/:memberId/course",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const params = UpdateMemberCourseParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const parsed = UpdateMemberCourseBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    try {
      await clerkClient.users.getUser(params.data.memberId);
    } catch {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    if (parsed.data.course === null) {
      await db
        .delete(memberCoursesTable)
        .where(eq(memberCoursesTable.memberId, params.data.memberId));
    } else {
      await db
        .insert(memberCoursesTable)
        .values({
          memberId: params.data.memberId,
          courseLevel: parsed.data.course,
        })
        .onConflictDoUpdate({
          target: memberCoursesTable.memberId,
          set: {
            courseLevel: parsed.data.course,
            updatedAt: new Date(),
          },
        });
    }

    res.json(
      UpdateMemberCourseResponse.parse({
        memberId: params.data.memberId,
        course: parsed.data.course,
      }),
    );
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

    const folderId = parsed.data.folderId ?? null;
    if (folderId !== null) {
      const [folder] = await db
        .select({ id: assignmentFoldersTable.id })
        .from(assignmentFoldersTable)
        .where(
          and(
            eq(assignmentFoldersTable.id, folderId),
            eq(assignmentFoldersTable.materialType, parsed.data.materialType),
          ),
        );
      if (!folder) {
        res.status(400).json({ error: "Selected folder does not match the material type" });
        return;
      }
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
        folderId,
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