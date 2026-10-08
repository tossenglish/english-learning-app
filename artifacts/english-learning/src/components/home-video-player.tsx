import { useGetHomeVideoSettings } from '@workspace/api-client-react';
import { LoaderCircle, Play } from 'lucide-react';

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;

export default function HomeVideoPlayer() {
  const { data, isLoading, error } = useGetHomeVideoSettings();
  const videoId = data?.videoId && youtubeVideoIdPattern.test(data.videoId)
    ? data.videoId
    : null;

  return (
    <section
      aria-labelledby="home-video-title"
      className="rise-in stagger-2 rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 sm:p-7"
      data-testid="section-home-video"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
          <Play size={19} fill="currentColor" />
        </span>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">
            Home video
          </p>
          <h2 id="home-video-title" className="mt-1 text-lg font-bold">
            오늘의 영상
          </h2>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl bg-[#080a10]">
        {isLoading ? (
          <div className="flex aspect-video items-center justify-center text-[hsl(var(--muted-foreground))]">
            <LoaderCircle className="animate-spin" size={28} />
          </div>
        ) : error ? (
          <div
            className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/70"
            data-testid="status-home-video-error"
          >
            <Play size={25} />
            <p>영상 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          </div>
        ) : videoId ? (
          <div className="aspect-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0`}
              title="오늘의 YouTube 영상"
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
              loading="lazy"
              data-testid="iframe-home-video"
            />
          </div>
        ) : (
          <div
            className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center text-white/70"
            data-testid="status-home-video-empty"
          >
            <Play size={25} />
            <div>
              <p className="text-sm font-bold text-white">아직 등록된 영상이 없어요</p>
              <p className="mt-1 text-xs">
                관리자가 홈 영상으로 설정한 YouTube 영상이나 라이브가 여기에 표시됩니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
