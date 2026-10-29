-- 학생 표시 이름 컬럼 추가 (알림톡에 이메일 대신 이름이 나가도록)
-- Render PostgreSQL 에서 한 번만 실행하세요. (여러 번 실행해도 안전합니다)

ALTER TABLE member_contacts
  ADD COLUMN IF NOT EXISTS student_name text NOT NULL DEFAULT '';

-- 이름만 입력하고 연락처는 비워 둘 수 있도록 기본값을 빈 문자열로 지정
ALTER TABLE member_contacts
  ALTER COLUMN parent_phone SET DEFAULT '';
