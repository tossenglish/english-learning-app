import { useEffect, useState } from 'react';
import { useGetHomeVideoSettings } from '@workspace/api-client-react';
import { LoaderCircle, Play } from 'lucide-react';
import { apiFetch } from '@/lib/api-fetch';

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;

function getYoutubeVideoId(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    let videoId: string | null = null;
    if (hostname === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] ?? null;
    else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(hostname)) {
      videoId = url.searchParams.get('v')
        || url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)?.[1]
        || null;
    }
    return videoId && youtubeVideoIdPattern.test(videoId) ? videoId : null;
  } catch {
    return null;
  }
}

export default function HomeVideoPlayer() {
  const { data, isLoading, error } = useGetHomeVideoSettings();
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);
  const [isLoadingUploadedVideo, setIsLoadingUploadedVideo] = useState(false);
  const [uploadedVideoError, setUploadedVideoError] = useState(false);
  const objectPath = data?.objectPath?.startsWith('/objects/uploads/')
    ? data.objectPath
    : null;
  const videoId = data?.videoId && youtubeVideoIdPattern.test(data.videoId)
    ? data.videoId
    : getYoutubeVideoId(data?.streamUrl);
  const streamUrl = data?.streamUrl && !videoId ? data.streamUrl : null;

  useEffect(() => {
    if (!objectPath) {
      setUploadedVideoUrl(null);
      setUploadedVideoError(false);
      setIsLoadingUploadedVideo(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setUploadedVideoUrl(null);
    setUploadedVideoError(false);
    setIsLoadingUploadedVideo(true);

    void apiFetch(`/api/storage${objectPath}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('영상 파일을 불러오지 못했습니다.');
        return URL.createObjectURL(await response.blob());
      })
      .then((url) => {
        objectUrl = url;
        if (cancelled) URL.revokeObjectURL(url);
        else setUploadedVideoUrl(url);
      })
      .catch(() => {
        if (!cancelled) setUploadedVideoError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingUploadedVideo(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectPath]);

  const isLoadingVideo = isLoading || isLoadingUploadedVideo;

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
        {isLoadingVideo ? (
          <div className="flex aspect-video items-center justify-center text-[hsl(var(--muted-foreground))]">
            <LoaderCircle className="animate-spin" size={28} />
          </div>
        ) : error || uploadedVideoError ? (
          <div
            className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center text-sm text-white/70"
            data-testid="status-home-video-error"
          >
            <Play size={25} />
            <p>영상 설정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          </div>
        ) : uploadedVideoUrl ? (
          <video
            src={uploadedVideoUrl}
            title={data?.resourceName ?? '오늘의 영상'}
            className="aspect-video w-full"
            controls
            playsInline
            preload="metadata"
            data-testid="video-home-uploaded"
          />
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
        ) : streamUrl ? (
          <video
            src={streamUrl}
            title="오늘의 영상"
            className="aspect-video w-full"
            controls
            playsInline
            preload="metadata"
            data-testid="video-home-stream-url"
          />
        ) : (
          <div
            className="flex aspect-video flex-col items-center justify-center gap-3 px-6 text-center text-white/70"
            data-testid="status-home-video-empty"
          >
            <Play size={25} />
            <div>
              <p className="text-sm font-bold text-white">아직 등록된 영상이 없어요</p>
              <p className="mt-1 text-xs">
                관리자가 업로드하거나 영상 URL을 등록하면 여기에 표시됩니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
