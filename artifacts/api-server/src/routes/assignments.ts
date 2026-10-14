import {
  CreateAssignmentFolderBody,
  CreateAssignmentFolderResponse,
  CreateAssignmentBody,
  CreateAssignmentResponse,
  CreateAdminLibraryMaterialBody,
  CreateAdminLibraryMaterialResponse,
  DeleteAssignmentParams,
  DeleteAdminLibraryMaterialParams,
  DeleteAdminLibraryMaterialResponse,
  ListAdminLibraryMaterialsResponse,
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
  libraryMaterialsTable,
  memberCoursesTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { getUserId, isAdmin, isAdminEmail } from "../lib/auth";

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
  "/admin/library-materials",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;
    const materials = await db
      .select()
      .from(libraryMaterialsTable)
      .orderBy(desc(libraryMaterialsTable.createdAt));
    res.json(ListAdminLibraryMaterialsResponse.parse(materials));
  },
);

router.post(
  "/admin/library-materials",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const parsed = CreateAdminLibraryMaterialBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const title = parsed.data.title.trim();
    const materialContent = parsed.data.materialContent.trim();
    if (!title || !materialContent) {
      res.status(400).json({ error: "Title and material content cannot be empty" });
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
            or(
              eq(assignmentFoldersTable.level, parsed.data.level),
              isNull(assignmentFoldersTable.level),
            ),
            or(
              eq(assignmentFoldersTable.materialType, parsed.data.materialType),
              eq(assignmentFoldersTable.materialType, "mixed"),
            ),
          ),
        );
      if (!folder) {
        res.status(400).json({ error: "Selected folder does not match the course or material type" });
        return;
      }
    }

    const [material] = await db
      .insert(libraryMaterialsTable)
      .values({
        ...parsed.data,
        title,
        materialContent,
        folderId,
      })
      .returning();

    res.status(201).json(CreateAdminLibraryMaterialResponse.parse(material));
  },
);

router.delete(
  "/admin/library-materials/:materialId",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const params = DeleteAdminLibraryMaterialParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const [deleted] = await db
      .delete(libraryMaterialsTable)
      .where(eq(libraryMaterialsTable.id, params.data.materialId))
      .returning({ id: libraryMaterialsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Library material not found" });
      return;
    }

    res.status(204).send(DeleteAdminLibraryMaterialResponse.parse(undefined));
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

    const { level, parentFolderId } = parsed.data;
    if (parentFolderId !== null) {
      const [parent] = await db
        .select({ id: assignmentFoldersTable.id })
        .from(assignmentFoldersTable)
        .where(and(
          eq(assignmentFoldersTable.id, parentFolderId),
          eq(assignmentFoldersTable.level, level),
        ));
      if (!parent) {
        res.status(400).json({ error: "Parent folder must belong to the same course" });
        return;
      }
    }
    const siblingConditions = [
      eq(assignmentFoldersTable.name, name),
      eq(assignmentFoldersTable.level, level),
      parentFolderId === null
        ? isNull(assignmentFoldersTable.parentFolderId)
        : eq(assignmentFoldersTable.parentFolderId, parentFolderId),
    ];
    const [duplicate] = await db
      .select({ id: assignmentFoldersTable.id })
      .from(assignmentFoldersTable)
      .where(and(...siblingConditions));
    if (duplicate) {
      res.status(409).json({ error: "A folder with this name already exists here" });
      return;
    }

    const [folder] = await db
      .insert(assignmentFoldersTable)
      .values({ ...parsed.data, name })
      .returning();

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
    const members = users.data
      .filter(
        (user) =>
          !user.emailAddresses.some(
            ({ emailAddress }) => isAdminEmail(emailAddress),
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
            or(
              eq(assignmentFoldersTable.level, parsed.data.level),
              isNull(assignmentFoldersTable.level),
            ),
          ),
        );
      if (!folder) {
        res.status(400).json({ error: "Selected folder does not match the course" });
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