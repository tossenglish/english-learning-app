import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  getGetHomeVideoSettingsQueryKey,
  useGetHomeVideoSettings,
  useUpdateHomeVideoSettings,
  type HomeVideoSettingsInput,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

const youtubeHosts = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
  'www.youtu.be',
]);

function isValidYoutubeUrl(value: string): boolean {
  const input = value.trim();
  if (!input) return true;

  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || !youtubeHosts.has(url.hostname.toLowerCase())) {
      return false;
    }

    const videoId = url.hostname.endsWith('youtu.be')
      ? url.pathname.split('/').filter(Boolean)[0]
      : url.pathname === '/watch'
        ? url.searchParams.get('v')
        : url.pathname.match(/^\/(?:embed|live|shorts)\/([^/]+)/)?.[1];

    return Boolean(videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId));
  } catch {
    return false;
  }
}

const homeVideoFormSchema = z.object({
  youtubeUrl: z
    .string()
    .max(2048, '링크가 너무 깁니다.')
    .refine(isValidYoutubeUrl, 'YouTube 영상 또는 라이브 링크를 입력해 주세요.'),
});

export default function AdminHomeVideoSettings() {
  const queryClient = useQueryClient();
  const { data, isLoading, error: loadError } = useGetHomeVideoSettings();
  const updateSettings = useUpdateHomeVideoSettings();
  const [statusMessage, setStatusMessage] = useState('');
  const [statusIsError, setStatusIsError] = useState(false);
  const form = useForm<HomeVideoSettingsInput>({
    resolver: zodResolver(homeVideoFormSchema),
    defaultValues: { youtubeUrl: '' },
  });

  useEffect(() => {
    form.reset({ youtubeUrl: data?.youtubeUrl ?? '' });
  }, [data?.youtubeUrl, form]);

  const saveSettings = async (values: HomeVideoSettingsInput) => {
    setStatusMessage('');
    setStatusIsError(false);
    try {
      const updated = await updateSettings.mutateAsync({ data: values });
      queryClient.setQueryData(getGetHomeVideoSettingsQueryKey(), updated);
      form.reset({ youtubeUrl: updated.youtubeUrl ?? '' });
      setStatusMessage(
        updated.videoId
          ? '홈 영상 링크를 저장했습니다.'
          : '홈 영상 연결을 해제했습니다.',
      );
    } catch (error) {
      setStatusIsError(true);
      setStatusMessage(
        error instanceof Error
          ? error.message
          : '홈 영상 링크를 저장하지 못했습니다.',
      );
    }
  };

  const clearSettings = async () => {
    form.setValue('youtubeUrl', '');
    await saveSettings({ youtubeUrl: '' });
  };

  return (
    <section className="rise-in stagger-2 rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <Play size={17} fill="currentColor" />
        </span>
        <div>
          <h2 className="text-lg font-bold">홈 영상 스트리밍</h2>
          <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            YouTube 일반 영상이나 라이브 링크를 등록하면 모든 회원의 초기 화면에 표시돼요.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(saveSettings)} className="mt-6 grid gap-4">
          <FormField
            control={form.control}
            name="youtubeUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-bold">YouTube 링크</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    placeholder="https://www.youtube.com/live/..."
                    autoComplete="url"
                    data-testid="input-home-video-url"
                  />
                </FormControl>
                <FormDescription>
                  영상 주소를 비우고 저장하면 홈 영상 연결이 해제됩니다.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {(loadError || statusMessage) && (
            <p
              className={`text-xs font-semibold ${statusIsError || loadError ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--accent))]'}`}
              role={statusIsError || loadError ? 'alert' : 'status'}
              data-testid="status-home-video-settings"
            >
              {loadError
                ? '현재 홈 영상 설정을 불러오지 못했습니다.'
                : statusMessage}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {data?.videoId && (
              <button
                type="button"
                onClick={() => void clearSettings()}
                disabled={updateSettings.isPending}
                className="rounded-xl border border-[hsl(var(--border))] px-4 py-3 text-sm font-bold transition-colors hover:bg-[hsl(var(--secondary))] disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="button-clear-home-video"
              >
                연결 해제
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading || updateSettings.isPending}
              className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              data-testid="button-save-home-video"
            >
              {updateSettings.isPending ? '저장 중...' : '영상 링크 저장'}
            </button>
          </div>
        </form>
      </Form>
    </section>
  );
}
