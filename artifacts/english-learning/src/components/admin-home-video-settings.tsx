import { useState } from 'react';
import {
  getGetHomeVideoSettingsQueryKey,
  useGetHomeVideoSettings,
  useUpdateHomeVideoSettings,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Play, UploadCloud } from 'lucide-react';
import { apiFetch, getApiAuthorizationHeader, resolveApiUrl } from '@/lib/api-fetch';

const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const MIME_BY_EXTENSION: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
};

function getVideoContentType(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const fallbackType = MIME_BY_EXTENSION[extension];
  const contentType = file.type || fallbackType;
  return contentType && contentType.startsWith('video/') ? contentType : null;
}

export default function AdminHomeVideoSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, error: loadError } = useGetHomeVideoSettings();
  const updateSettings = useUpdateHomeVideoSettings();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);

  const saveSettings = async (
    objectPath: string | null,
    resourceName: string | null,
  ) => {
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const updated = await updateSettings.mutateAsync({
        data: { objectPath, resourceName },
      });
      queryClient.setQueryData(getGetHomeVideoSettingsQueryKey(), updated);
      setFile(null);
      setProgress(0);
      setStatusMessage(objectPath ? '홈 영상을 적용했습니다.' : '홈 영상 연결을 해제했습니다.');
    } catch (error) {
      setStatusIsError(true);
      setStatusMessage(
        error instanceof Error
          ? error.message
          : '홈 영상 설정을 저장하지 못했습니다.',
      );
    }
  };

  const uploadAndApply = async () => {
    if (!file || isUploading || updateSettings.isPending) return;
    const contentType = getVideoContentType(file);
    if (!contentType) {
      setStatusIsError(true);
      setStatusMessage('MP4, WebM, OGG 또는 MOV 동영상 파일을 선택해 주세요.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setStatusIsError(true);
      setStatusMessage('파일 크기는 5GB 이하여야 해요.');
      return;
    }

    setIsUploading(true);
    setProgress(0);
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const response = await apiFetch('/api/storage/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType }),
      });
      const body = await response.json().catch(() => null) as
        | { uploadURL?: string; objectPath?: string; error?: string }
        | null;
      if (!response.ok || !body?.uploadURL || !body.objectPath) {
        throw new Error(body?.error || '업로드 주소를 만들지 못했습니다.');
      }

      await new Promise<void>((resolve, reject) => {
        const request = new XMLHttpRequest();
        const uploadUrl = resolveApiUrl(body.uploadURL!);
        request.open('PUT', uploadUrl);
        request.setRequestHeader('Content-Type', contentType);
        void getApiAuthorizationHeader(uploadUrl).then((authorization) => {
          if (authorization) request.setRequestHeader('Authorization', authorization);
          request.upload.onprogress = (event) => {
            if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
          };
          request.onload = () => {
            if (request.status >= 200 && request.status < 300) resolve();
            else reject(new Error('동영상 업로드에 실패했습니다.'));
          };
          request.onerror = () => reject(new Error('업로드 중 네트워크 오류가 발생했습니다.'));
          request.send(file);
        }).catch(reject);
      });

      await saveSettings(body.objectPath, file.name);
    } catch (error) {
      setStatusIsError(true);
      setStatusMessage(error instanceof Error ? error.message : '동영상 업로드에 실패했습니다.');
    } finally {
      setIsUploading(false);
    }
  };

  const clearSettings = async () => {
    await saveSettings(null, null);
  };

  const busy = isUploading || updateSettings.isPending;

  return (
    <section className="rise-in stagger-2 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <Play size={17} fill="currentColor" />
        </span>
        <div>
          <h2 className="text-lg font-bold">홈 영상 스트리밍</h2>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            동영상 파일을 직접 올리면 모든 회원의 초기 화면에서 재생돼요. 최대 50MB까지 업로드할 수 있어요.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <label className="grid gap-2 text-xs font-bold">
          동영상 파일
          <input
            type="file"
            accept="video/mp4,video/webm,video/ogg,video/quicktime,.mp4,.webm,.ogg,.mov"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setProgress(0);
              setStatusMessage('');
            }}
            disabled={busy || isLoading}
            className="block w-full rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-3 text-sm"
            data-testid="input-home-video-file"
          />
        </label>
        {file && <p className="text-xs text-[hsl(var(--muted-foreground))]">{file.name}</p>}
        {(isUploading || progress > 0) && (
          <progress className="h-2 w-full accent-[hsl(var(--primary))]" max={100} value={progress} />
        )}
        {(loadError || statusMessage) && (
          <p
            className={`text-xs font-semibold ${statusIsError || loadError ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--accent))]'}`}
            role={statusIsError || loadError ? 'alert' : 'status'}
            data-testid="status-home-video-settings"
          >
            {loadError ? '현재 홈 영상 설정을 불러오지 못했습니다.' : statusMessage}
          </p>
        )}
        {data?.resourceName && (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">현재 영상: {data.resourceName}</p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-3">
          {(data?.objectPath || data?.videoId) && (
            <button
              type="button"
              onClick={() => void clearSettings()}
              disabled={busy || isLoading}
              className="rounded-xl border border-[hsl(var(--border))] px-4 py-3 text-sm font-bold transition-colors hover:bg-[hsl(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="button-clear-home-video"
            >
              연결 해제
            </button>
          )}
          <button
            type="button"
            onClick={() => void uploadAndApply()}
            disabled={!file || busy || isLoading}
            className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="button-save-home-video"
          >
            <UploadCloud size={16} />
            {isUploading ? `업로드 중 ${progress}%` : updateSettings.isPending ? '저장 중...' : '업로드하고 적용'}
          </button>
        </div>
      </div>
    </section>
  );
}
