import { useState } from 'react';
import {
  CheckCircle2,
  FileText,
  LoaderCircle,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react';
import { useAdminAccess } from '@/hooks/use-admin-access';
import AdminAssignments, { type AssignmentResource } from '@/components/admin-assignments';
import AdminHomeVideoSettings from '@/components/admin-home-video-settings';
import AdminWordContentSettings from '@/components/admin-word-content-settings';
import { apiFetch, openApiFile } from '@/lib/api-fetch';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export default function AdminUpload() {
  const { isAdmin, isChecking } = useAdminAccess();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [uploaded, setUploaded] = useState<AssignmentResource | null>(null);

  const upload = async () => {
    if (!file || status === 'uploading') return;
    if (file.size > MAX_FILE_SIZE) {
      setStatus('error');
      setMessage('파일 크기는 50MB 이하여야 해요.');
      return;
    }

    setStatus('uploading');
    setProgress(0);
    setMessage('');
    setUploaded(null);

    try {
      const response = await apiFetch('/api/storage/uploads/request-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || 'application/octet-stream',
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error || '업로드 주소를 만들지 못했습니다.');
      }

      const { uploadURL, objectPath } = await response.json() as {
        uploadURL: string;
        objectPath: string;
      };

      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('PUT', uploadURL);
        request.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100));
          }
        };
        request.onload = () => {
          if (request.status >= 200 && request.status < 300) resolve();
          else reject(new Error('파일 전송에 실패했습니다.'));
        };
        request.onerror = () => reject(new Error('파일 전송 중 네트워크 오류가 발생했습니다.'));
        request.send(file);
      });

      setProgress(100);
      setStatus('done');
      setMessage('자료가 안전하게 업로드되었습니다.');
      setUploaded({ name: file.name, objectPath });
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '업로드에 실패했습니다.');
    }
  };

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
          지정된 관리자 계정으로 로그인해야 자료를 업로드할 수 있어요.
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
        <h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">학습 자료 업로드</h1>
        <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
          문서, 이미지, 음원, 영상을 최대 50MB까지 App Storage에 저장할 수 있어요.
        </p>
      </section>

      <section className="rise-in stagger-1 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-9">
        <label className="flex min-h-[260px] cursor-pointer flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-[hsl(var(--border))] bg-[hsl(var(--background)/.55)] px-6 text-center transition-colors hover:border-[hsl(var(--accent)/.65)]">
          <input
            type="file"
            className="sr-only"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.jpg,.jpeg,.png,.webp,.mp3,.wav,.mp4"
            disabled={status === 'uploading'}
            onChange={(event) => {
              const selected = event.target.files?.[0] ?? null;
              setFile(selected);
              setStatus('idle');
              setProgress(0);
              setMessage('');
              setUploaded(null);
            }}
          />
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
            <UploadCloud size={28} />
          </span>
          <p className="mt-5 text-lg font-bold">{file ? file.name : '파일을 선택하거나 여기로 끌어오세요'}</p>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">
            PDF, Word, PPT, 이미지, 음원, 영상 · 최대 50MB
          </p>
          {file && (
            <p className="mt-3 rounded-full bg-[hsl(var(--muted))] px-3 py-1.5 font-mono text-[10px] font-bold">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
        </label>

        {status === 'uploading' && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span>업로드 중</span>
              <span>{progress}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
              <div className="h-full rounded-full bg-[hsl(var(--accent))] transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {message && (
          <div className={`mt-6 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${
            status === 'done'
              ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'
              : 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]'
          }`}>
            {status === 'done' ? <CheckCircle2 size={18} /> : <FileText size={18} />}
            <span>{message}</span>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          {uploaded ? (
            <a
              href={`/api/storage${uploaded.objectPath}`}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                event.preventDefault();
                void openApiFile(`/api/storage${uploaded.objectPath}`).catch((error: unknown) => {
                  window.alert(error instanceof Error ? error.message : '파일을 열지 못했습니다.');
                });
              }}
              className="inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent))] hover:underline"
            >
              <FileText size={16} /> {uploaded.name} 열기
            </a>
          ) : <span />}
          <button
            type="button"
            onClick={upload}
            disabled={!file || status === 'uploading'}
            className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {status === 'uploading' ? <LoaderCircle className="animate-spin" size={17} /> : <UploadCloud size={17} />}
            {status === 'uploading' ? '업로드 중...' : '자료 업로드'}
          </button>
        </div>
      </section>
      <AdminHomeVideoSettings />
      <AdminWordContentSettings />
      <AdminAssignments latestUpload={uploaded} />
    </div>
  );
}