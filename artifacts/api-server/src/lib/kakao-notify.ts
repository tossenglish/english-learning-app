import crypto from "node:crypto";
import { clerkClient } from "@clerk/express";
import {
  assignmentNotificationsTable,
  assignmentsTable,
  db,
  memberContactsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";

import { logger } from "./logger";

/**
 * 과제 시작 / 완료 시 학부모에게 카카오 알림톡을 보냅니다. (솔라피 API 사용)
 *
 * 필요한 환경변수 (Render > Environment 에 등록):
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET   솔라피 콘솔 > API Key 관리
 *   SOLAPI_SENDER                       솔라피에 등록된 발신번호 (문자 대체발송에 필요)
 *   KAKAO_PF_ID                         카카오 채널 연동 후 솔라피에 표시되는 pfId
 *   KAKAO_TEMPLATE_STARTED              "과제 시작" 알림톡 템플릿 ID
 *   KAKAO_TEMPLATE_COMPLETED            "과제 완료" 알림톡 템플릿 ID
 * 선택:
 *   KAKAO_DISABLE_SMS_FALLBACK=true     알림톡 실패 시 문자 대체발송을 끕니다.
 *
 * 환경변수가 하나라도 없으면 아무것도 발송하지 않고 조용히 넘어갑니다.
 *
 * 템플릿 변수: #{학생이름}, #{과제명}
 */

export type NotificationKind = "started" | "completed";

const SOLAPI_ENDPOINT = "https://api.solapi.com/messages/v4/send-many/detail";

interface NotifyConfig {
  apiKey: string;
  apiSecret: string;
  sender: string;
  pfId: string;
  templateStarted: string;
  templateCompleted: string;
  disableSmsFallback: boolean;
}

export function loadNotifyConfig(): NotifyConfig | null {
  const apiKey = process.env.SOLAPI_API_KEY?.trim();
  const apiSecret = process.env.SOLAPI_API_SECRET?.trim();
  const sender = process.env.SOLAPI_SENDER?.replace(/\D/g, "");
  const pfId = process.env.KAKAO_PF_ID?.trim();
  const templateStarted = process.env.KAKAO_TEMPLATE_STARTED?.trim();
  const templateCompleted = process.env.KAKAO_TEMPLATE_COMPLETED?.trim();
  if (!apiKey || !apiSecret || !sender || !pfId || !templateStarted || !templateCompleted) {
    return null;
  }
  return {
    apiKey,
    apiSecret,
    sender,
    pfId,
    templateStarted,
    templateCompleted,
    disableSmsFallback: process.env.KAKAO_DISABLE_SMS_FALLBACK === "true",
  };
}

function buildAuthorizationHeader(apiKey: string, apiSecret: string): string {
  const date = new Date().toISOString();
  const salt = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(date + salt)
    .digest("hex");
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

interface SolapiResponse {
  errorCode?: string;
  errorMessage?: string;
  groupInfo?: { groupId?: string; _id?: string };
  failedMessageList?: Array<{ statusCode?: string; statusMessage?: string }>;
}

/** 알림톡 1건을 솔라피에 접수합니다. 접수 실패 시 Error 를 던집니다. */
async function sendAlimtalk(
  config: NotifyConfig,
  to: string,
  templateId: string,
  variables: Record<string, string>,
): Promise<string | null> {
  const response = await fetch(SOLAPI_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: buildAuthorizationHeader(config.apiKey, config.apiSecret),
    },
    body: JSON.stringify({
      messages: [
        {
          to,
          from: config.sender,
          kakaoOptions: {
            pfId: config.pfId,
            templateId,
            variables,
            disableSms: config.disableSmsFallback,
          },
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });

  const body = (await response.json().catch(() => null)) as SolapiResponse | null;
  if (!response.ok) {
    throw new Error(body?.errorMessage || `솔라피 요청 실패 (HTTP ${response.status})`);
  }
  const failed = body?.failedMessageList?.[0];
  if (failed) {
    throw new Error(`${failed.statusCode ?? ""} ${failed.statusMessage ?? "발송 접수 실패"}`.trim());
  }
  return body?.groupInfo?.groupId ?? body?.groupInfo?._id ?? null;
}

async function getStudentName(memberId: string): Promise<string> {
  try {
    const user = await clerkClient.users.getUser(memberId);
    return (
      user.fullName ||
      user.username ||
      user.primaryEmailAddress?.emailAddress ||
      "학생"
    );
  } catch {
    return "학생";
  }
}

function clip(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * 기록된 알림 1건을 실제로 발송하고 결과를 기록합니다.
 * 이미 발송 완료(sent)된 건은 다시 보내지 않습니다. 실패 건 재시도에도 사용합니다.
 */
export async function deliverNotification(
  notificationId: number,
): Promise<"sent" | "failed" | "skipped"> {
  const [row] = await db
    .select()
    .from(assignmentNotificationsTable)
    .where(eq(assignmentNotificationsTable.id, notificationId));
  if (!row || row.status === "sent") return "skipped";

  const config = loadNotifyConfig();
  if (!config) {
    await db
      .update(assignmentNotificationsTable)
      .set({
        status: "failed",
        errorMessage: "알림톡 설정(환경변수)이 완료되지 않았습니다.",
      })
      .where(eq(assignmentNotificationsTable.id, row.id));
    return "failed";
  }

  try {
    const [contact] = await db
      .select()
      .from(memberContactsTable)
      .where(eq(memberContactsTable.memberId, row.memberId));
    const phone = contact?.parentPhone || row.phone;
    if (!phone) throw new Error("학부모 연락처가 등록되어 있지 않습니다.");

    const studentName = row.studentName || (await getStudentName(row.memberId));
    let assignmentTitle = row.assignmentTitle;
    if (!assignmentTitle) {
      const [assignment] = await db
        .select({ title: assignmentsTable.title })
        .from(assignmentsTable)
        .where(eq(assignmentsTable.id, row.assignmentId));
      assignmentTitle = assignment?.title ?? "과제";
    }

    const groupId = await sendAlimtalk(
      config,
      phone,
      row.kind === "completed" ? config.templateCompleted : config.templateStarted,
      {
        "#{학생이름}": clip(studentName, 20),
        "#{과제명}": clip(assignmentTitle, 30),
      },
    );

    await db
      .update(assignmentNotificationsTable)
      .set({
        status: "sent",
        studentName,
        assignmentTitle,
        phone,
        providerGroupId: groupId,
        errorMessage: null,
        sentAt: new Date(),
      })
      .where(eq(assignmentNotificationsTable.id, row.id));
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ notificationId: row.id, message }, "Failed to send assignment notification");
    await db
      .update(assignmentNotificationsTable)
      .set({ status: "failed", errorMessage: clip(message, 500) })
      .where(eq(assignmentNotificationsTable.id, row.id));
    return "failed";
  }
}

async function notifyOnce(
  memberId: string,
  assignmentId: number,
  kind: NotificationKind,
  phone: string,
): Promise<void> {
  // (member, assignment, kind) 유일 인덱스 덕분에 이미 처리된 알림이면 행이 만들어지지 않습니다.
  const [created] = await db
    .insert(assignmentNotificationsTable)
    .values({ memberId, assignmentId, kind, phone })
    .onConflictDoNothing()
    .returning({ id: assignmentNotificationsTable.id });
  if (!created) return;
  await deliverNotification(created.id);
}

/**
 * 과제 진행도 저장 직후 호출합니다.
 * - 진행도가 처음 저장될 때: "과제 시작" 알림
 * - 마지막 단계까지 마쳤을 때: "과제 완료" 알림
 * 학부모 연락처가 없거나 알림 설정이 없으면 아무 일도 하지 않습니다.
 * 호출한 쪽의 응답을 지연시키지 않도록 `void` 로 호출하세요.
 */
export async function notifyAssignmentProgress(params: {
  memberId: string;
  assignmentId: number;
  completedSteps: number;
  totalSteps: number;
}): Promise<void> {
  if (!loadNotifyConfig()) return;

  const [contact] = await db
    .select({ parentPhone: memberContactsTable.parentPhone })
    .from(memberContactsTable)
    .where(eq(memberContactsTable.memberId, params.memberId));
  if (!contact?.parentPhone) return;

  await notifyOnce(params.memberId, params.assignmentId, "started", contact.parentPhone);

  if (params.totalSteps > 0 && params.completedSteps >= params.totalSteps) {
    await notifyOnce(params.memberId, params.assignmentId, "completed", contact.parentPhone);
  }
}
