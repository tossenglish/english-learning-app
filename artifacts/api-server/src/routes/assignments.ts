import {
  CreateAssignmentFolderBody,
  CreateAssignmentFolderResponse,
  CreateAdminMemberClassBody,
  CreateAdminMemberClassResponse,
  CreateAssignmentBody,
  CreateAssignmentResponse,
  CreateAdminLibraryMaterialBody,
  CreateAdminLibraryMaterialResponse,
  DeleteAssignmentParams,
  DeleteAdminLibraryMaterialParams,
  DeleteAdminLibraryMaterialResponse,
  DeleteAdminMemberParams,
  ListAdminLibraryMaterialsResponse,
  ListAdminAssignmentFoldersResponse,
  ListAdminAssignmentsResponse,
  ListAdminMembersResponse,
  ListAdminMemberClassesResponse,
  ListAssignmentsQueryParams,
  ListAssignmentsResponse,
  ListAssignmentProgressResponse,
  UpsertAssignmentProgressBody,
  UpsertAssignmentProgressParams,
  UpsertAssignmentProgressResponse,
  UpdateMemberCourseBody,
  UpdateMemberCourseParams,
  UpdateMemberCourseResponse,
  UpdateMemberClassBody,
  UpdateMemberClassParams,
  UpdateMemberClassResponse,
  UpdateAdminMemberPasswordBody,
  UpdateAdminMemberPasswordParams,
} from "@workspace/api-zod";
import { clerkClient } from "@clerk/express";
import {
  assignmentFoldersTable,
  assignmentProgressTable,
  assignmentsTable,
  db,
  libraryMaterialsTable,
  memberCoursesTable,
  memberClassesTable,
} from "@workspace/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";

import { getUserId, isAdmin, isAdminEmail, isAdminUser } from "../lib/auth";

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
  "/assignments/progress",
  async (req: Request, res: Response): Promise<void> => {
    const memberId = getUserId(req);
    if (!memberId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const progress = await db
      .select({
        assignmentId: assignmentProgressTable.assignmentId,
        completedSteps: assignmentProgressTable.completedSteps,
        totalSteps: assignmentProgressTable.totalSteps,
        updatedAt: assignmentProgressTable.updatedAt,
      })
      .from(assignmentProgressTable)
      .where(eq(assignmentProgressTable.userId, memberId));
    res.json(ListAssignmentProgressResponse.parse(progress));
  },
);

router.put(
  "/assignments/:assignmentId/progress",
  async (req: Request, res: Response): Promise<void> => {
    const memberId = getUserId(req);
    if (!memberId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const params = UpsertAssignmentProgressParams.safeParse(req.params);
    const body = UpsertAssignmentProgressBody.safeParse(req.body);
    if (!params.success || !body.success || body.data.completedSteps > body.data.totalSteps) {
      res.status(400).json({ error: "Invalid assignment progress" });
      return;
    }

    const [assignment] = await db
      .select({
        id: assignmentsTable.id,
        assigneeUserId: assignmentsTable.assigneeUserId,
        level: assignmentsTable.level,
        isPublished: assignmentsTable.isPublished,
      })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.id, params.data.assignmentId));
    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    const [course] = await db
      .select()
      .from(memberCoursesTable)
      .where(eq(memberCoursesTable.memberId, memberId));
    const visibleLevels = course ? [course.courseLevel, "All"] : ["All"];
    const canAccess = assignment.isPublished && (
      assignment.assigneeUserId === memberId ||
      (assignment.assigneeUserId === null && visibleLevels.includes(assignment.level))
    );
    if (!canAccess) {
      res.status(403).json({ error: "Assignment is not available to this member" });
      return;
    }

    const [saved] = await db
      .insert(assignmentProgressTable)
      .values({
        userId: memberId,
        assignmentId: assignment.id,
        completedSteps: body.data.completedSteps,
        totalSteps: body.data.totalSteps,
      })
      .onConflictDoUpdate({
        target: [assignmentProgressTable.userId, assignmentProgressTable.assignmentId],
        set: {
          completedSteps: sql`case
            when ${assignmentProgressTable.totalSteps} = ${body.data.totalSteps}
              then greatest(${assignmentProgressTable.completedSteps}, ${body.data.completedSteps})
            else ${body.data.completedSteps}
          end`,
          totalSteps: body.data.totalSteps,
          updatedAt: new Date(),
        },
      })
      .returning({
        assignmentId: assignmentProgressTable.assignmentId,
        completedSteps: assignmentProgressTable.completedSteps,
        totalSteps: assignmentProgressTable.totalSteps,
        updatedAt: assignmentProgressTable.updatedAt,
      });

    res.json(UpsertAssignmentProgressResponse.parse(saved));
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

router.delete(
  "/admin/assignment-folders/:folderId",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const folderId = Number(req.params.folderId);
    if (!Number.isSafeInteger(folderId) || folderId <= 0) {
      res.status(400).json({ error: "Invalid folder ID" });
      return;
    }

    const [childFolder] = await db
      .select({ id: assignmentFoldersTable.id })
      .from(assignmentFoldersTable)
      .where(eq(assignmentFoldersTable.parentFolderId, folderId))
      .limit(1);
    const [assignment] = await db
      .select({ id: assignmentsTable.id })
      .from(assignmentsTable)
      .where(eq(assignmentsTable.folderId, folderId))
      .limit(1);
    if (childFolder || assignment) {
      res.status(409).json({ error: "Move or remove the folder contents before deleting it" });
      return;
    }

    const [deleted] = await db
      .delete(assignmentFoldersTable)
      .where(eq(assignmentFoldersTable.id, folderId))
      .returning({ id: assignmentFoldersTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Folder not found" });
      return;
    }

    res.status(204).send();
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

    res.setHeader("Cache-Control", "private, no-store");
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
      courseAssignments.map(({ memberId, courseLevel, classId }) => [memberId, { courseLevel, classId }]),
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
        course: courseByMember.get(user.id)?.courseLevel ?? null,
        classId: courseByMember.get(user.id)?.classId ?? null,
      }));

    res.json(ListAdminMembersResponse.parse(members));
  },
);

router.post(
  "/admin/members",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const body = req.body as { email?: unknown; password?: unknown };
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: "올바른 이메일 주소를 입력해 주세요." });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }
    if (isAdminEmail(email)) {
      res.status(400).json({ error: "관리자 계정은 회원 계정 생성에서 추가할 수 없습니다." });
      return;
    }

    try {
      const user = await clerkClient.users.createUser({
        emailAddress: [email],
        emailAddressIdentificationStatus: ["reserved"],
        password,
      });
      res.status(201).json({
        id: user.id,
        displayName: getDisplayName(user),
        email: user.primaryEmailAddress?.emailAddress ?? email,
        course: null,
        classId: null,
      });
    } catch (createError) {
      const clerkErrors = (createError as {
        errors?: Array<{
          code?: unknown;
          longMessage?: unknown;
          message?: unknown;
        }>;
      })?.errors;
      const firstError = clerkErrors?.[0];
      const code = typeof firstError?.code === "string" ? firstError.code : "";
      const detail = typeof firstError?.longMessage === "string"
        ? firstError.longMessage
        : typeof firstError?.message === "string"
          ? firstError.message
          : "";

      if (code === "form_identifier_exists") {
        res.status(409).json({ error: "이미 등록된 이메일 주소입니다." });
        return;
      }
      if (code.includes("password")) {
        res.status(400).json({
          error: detail
            ? `비밀번호가 Clerk의 보안 기준을 통과하지 못했습니다. ${detail}`
            : "다른 비밀번호를 사용해 주세요. 비밀번호가 너무 짧거나 유출된 비밀번호일 수 있습니다.",
        });
        return;
      }

      res.status(400).json({
        error: detail
          ? `계정을 만들지 못했습니다. ${detail}`
          : "계정을 만들지 못했습니다. 이메일 주소와 Clerk 계정 설정을 확인해 주세요.",
      });
    }
  },
);

router.patch(
  "/admin/members/:memberId/password",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const params = UpdateAdminMemberPasswordParams.safeParse(req.params);
    const body = UpdateAdminMemberPasswordBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "비밀번호는 8자 이상이어야 합니다." });
      return;
    }

    const { memberId } = params.data;
    let target;
    try {
      target = await clerkClient.users.getUser(memberId);
    } catch (lookupError) {
      const status = (lookupError as { status?: unknown })?.status;
      if (status === 404) {
        res.status(404).json({ error: "회원 계정을 찾을 수 없습니다." });
        return;
      }
      req.log.error({ memberId, status }, "Failed to load member before password update");
      res.status(502).json({ error: "회원 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." });
      return;
    }

    if (isAdminUser(target)) {
      res.status(403).json({ error: "관리자 계정의 비밀번호는 회원 관리에서 변경할 수 없습니다." });
      return;
    }

    try {
      await clerkClient.users.updateUser(memberId, { password: body.data.password });
    } catch (updateError) {
      const clerkErrors = (updateError as {
        errors?: Array<{ code?: unknown }>;
        status?: unknown;
      })?.errors;
      const clerkCode = typeof clerkErrors?.[0]?.code === "string"
        ? clerkErrors[0].code
        : "";
      const status = (updateError as { status?: unknown })?.status;

      if (clerkCode.toLowerCase().includes("password")) {
        req.log.warn({ memberId, clerkCode }, "Clerk rejected member password update");
        res.status(400).json({
          error: "Clerk의 보안 기준에 맞지 않는 비밀번호입니다. 다른 8자 이상 비밀번호를 입력해 주세요.",
        });
        return;
      }
      if (status === 404) {
        res.status(404).json({ error: "회원 계정을 찾을 수 없습니다." });
        return;
      }

      req.log.error({ memberId, clerkCode, status }, "Failed to update member password in Clerk");
      res.status(502).json({
        error: "회원 비밀번호를 변경하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    res.sendStatus(204);
  },
);

router.delete(
  "/admin/members/:memberId",
  async (req: Request, res: Response): Promise<void> => {
    if (!(await requireAdmin(req, res))) return;

    const params = DeleteAdminMemberParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }

    const { memberId } = params.data;
    if (memberId === getUserId(req)) {
      res.status(403).json({ error: "현재 로그인한 관리자 계정은 삭제할 수 없습니다." });
      return;
    }

    let target;
    try {
      target = await clerkClient.users.getUser(memberId);
    } catch {
      res.status(404).json({ error: "회원 계정을 찾을 수 없습니다." });
      return;
    }

    if (isAdminUser(target)) {
      res.status(403).json({ error: "관리자 계정은 회원 관리에서 삭제할 수 없습니다." });
      return;
    }

    try {
      await clerkClient.users.deleteUser(memberId);
    } catch (deleteError) {
      req.log.error({ err: deleteError, memberId }, "Failed to delete member from Clerk");
      res.status(500).json({ error: "회원 계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요." });
      return;
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(assignmentsTable)
          .where(eq(assignmentsTable.assigneeUserId, memberId));
        await tx
          .delete(memberCoursesTable)
          .where(eq(memberCoursesTable.memberId, memberId));
      });
    } catch (cleanupError) {
      req.log.error(
        { err: cleanupError, memberId },
        "Member was deleted from Clerk, but related application data cleanup failed",
      );
      res.status(500).json({
        error: "계정은 삭제됐지만 연결된 과정과 과제를 정리하지 못했습니다. 관리자에게 문의해 주세요.",
      });
      return;
    }

    res.status(204).end();
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
            classId: null,
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

router.get("/admin/member-classes", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const classes = await db.select().from(memberClassesTable).orderBy(memberClassesTable.courseLevel, memberClassesTable.name);
  res.json(ListAdminMemberClassesResponse.parse(classes));
});

router.post("/admin/member-classes", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const parsed = CreateAdminMemberClassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "반 이름을 입력해 주세요." });
    return;
  }
  if (parsed.data.parentClassId !== null) {
    const [parent] = await db.select().from(memberClassesTable).where(eq(memberClassesTable.id, parsed.data.parentClassId));
    if (!parent || parent.courseLevel !== parsed.data.courseLevel) {
      res.status(400).json({ error: "같은 과정 안의 상위 반 폴더를 선택해 주세요." });
      return;
    }
  }
  const [created] = await db.insert(memberClassesTable).values({ ...parsed.data, name }).returning();
  res.status(201).json(CreateAdminMemberClassResponse.parse(created));
});

router.put("/admin/members/:memberId/class", async (req: Request, res: Response): Promise<void> => {
  if (!(await requireAdmin(req, res))) return;
  const params = UpdateMemberClassParams.safeParse(req.params);
  const parsed = UpdateMemberClassBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: "회원 또는 반 정보가 올바르지 않습니다." });
    return;
  }
  try {
    const user = await clerkClient.users.getUser(params.data.memberId);
    if (isAdminUser(user)) {
      res.status(403).json({ error: "관리자 계정은 반에 배정할 수 없습니다." });
      return;
    }
  } catch {
    res.status(404).json({ error: "회원을 찾을 수 없습니다." });
    return;
  }
  let course: "Beginner" | "Intermediate" | "Advanced" | null = null;
  if (parsed.data.classId !== null) {
    const [classRow] = await db.select().from(memberClassesTable).where(eq(memberClassesTable.id, parsed.data.classId));
    if (!classRow) {
      res.status(404).json({ error: "반 폴더를 찾을 수 없습니다." });
      return;
    }
    course = classRow.courseLevel as "Beginner" | "Intermediate" | "Advanced";
    await db.insert(memberCoursesTable).values({
      memberId: params.data.memberId,
      courseLevel: classRow.courseLevel,
      classId: classRow.id,
    }).onConflictDoUpdate({
      target: memberCoursesTable.memberId,
      set: { courseLevel: classRow.courseLevel, classId: classRow.id, updatedAt: new Date() },
    });
  } else {
    const [existing] = await db.select().from(memberCoursesTable).where(eq(memberCoursesTable.memberId, params.data.memberId));
    course = existing
      ? existing.courseLevel as "Beginner" | "Intermediate" | "Advanced"
      : null;
    await db.update(memberCoursesTable).set({ classId: null, updatedAt: new Date() }).where(eq(memberCoursesTable.memberId, params.data.memberId));
  }
  res.json(UpdateMemberClassResponse.parse({ memberId: params.data.memberId, course, classId: parsed.data.classId }));
});

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