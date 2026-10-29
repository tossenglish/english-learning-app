-- 출결 / 학부모 연락처 / 알림톡 발송 기록 테이블
-- Render PostgreSQL 에서 한 번만 실행하세요. (여러 번 실행해도 안전합니다)
-- 또는 DATABASE_URL 을 운영 DB로 지정하고 `pnpm --filter @workspace/db run push` 를 실행해도 됩니다.

CREATE TABLE IF NOT EXISTS member_contacts (
  member_id    text PRIMARY KEY,
  parent_phone text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id              serial PRIMARY KEY,
  member_id       text NOT NULL,
  attendance_date date NOT NULL,
  status          text NOT NULL,
  note            text NOT NULL DEFAULT '',
  recorded_by     text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS attendance_member_date_unique
  ON attendance_records (member_id, attendance_date);

CREATE TABLE IF NOT EXISTS assignment_notifications (
  id                serial PRIMARY KEY,
  member_id         text NOT NULL,
  assignment_id     integer NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  kind              text NOT NULL,
  status            text NOT NULL DEFAULT 'pending',
  student_name      text NOT NULL DEFAULT '',
  assignment_title  text NOT NULL DEFAULT '',
  phone             text NOT NULL DEFAULT '',
  provider_group_id text,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  sent_at           timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_notifications_unique
  ON assignment_notifications (member_id, assignment_id, kind);
