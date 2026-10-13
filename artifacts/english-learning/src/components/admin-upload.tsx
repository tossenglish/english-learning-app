import { LoaderCircle, ShieldCheck } from 'lucide-react';
import { useAdminAccess } from '@/hooks/use-admin-access';
import AdminAssignments from '@/components/admin-assignments';
import AdminHomeVideoSettings from '@/components/admin-home-video-settings';
import AdminWordContentSettings from '@/components/admin-word-content-settings';

export default function AdminUpload() {
  const { isAdmin, isChecking } = useAdminAccess();

  if (isChecking) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <LoaderCircle className="animate-spin text-[hsl(var(--accent))]" size={28} />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <section className="mx-auto max-w-xl rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-8 text-center">
        <ShieldCheck className="mx-auto text-[hsl(var(--accent))]" size={34} />
        <h1 className="mt-4 text-2xl font-bold">관리자 전용 화면입니다.</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          지정된 관리자 계정으로 로그인해야 관리자 기능을 사용할 수 있어요.
        </p>
      </section>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-7">
      <section className="rise-in">
        <p className="mb-2 flex items-center gap-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
          <ShieldCheck size={14} /> Admin workspace
        </p>
        <h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">관리자 작업공간</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          회원 과정과 과제를 관리하고 홈 영상 및 단어 콘텐츠를 설정할 수 있어요.
        </p>
      </section>

      <AdminHomeVideoSettings />
      <AdminWordContentSettings />
      <AdminAssignments />
    </div>
  );
}