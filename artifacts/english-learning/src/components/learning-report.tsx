import { useMemo, useRef, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  FileText,
  Headphones,
  LoaderCircle,
  MessageCircle,
  PenLine,
  Target,
} from 'lucide-react';
import type { PassageEvaluation } from '@/components/passage-practice';

type Level = 'Beginner' | 'Intermediate' | 'Advanced';

export type LearningMetrics = {
  cardFlipped: boolean;
  hasListened: boolean;
  learned: boolean;
  quizAnswer: string | null;
  quizAttempts: number;
  passage: PassageEvaluation;
};

type ActivityScore = {
  label: string;
  score: number;
  max: number;
  detail: string;
  icon: typeof Headphones;
};

export default function LearningReport({
  level,
  metrics,
}: {
  level: Level;
  metrics: LearningMetrics;
}) {
  const reportRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const activities = useMemo<ActivityScore[]>(() => {
    const quizCorrect = metrics.quizAnswer === '뜻밖의 행운';
    const quizScore = quizCorrect
      ? Math.max(15, 25 - Math.max(0, metrics.quizAttempts - 1) * 3)
      : 0;
    const sentenceCount = Math.max(1, metrics.passage.totalSteps / 3);
    const accuracyPenalty = Math.min(5, metrics.passage.wrongAttempts);

    return [
      {
        label: '단어 이해',
        score:
          (metrics.cardFlipped ? 10 : 0) +
          (metrics.hasListened ? 10 : 0) +
          (metrics.learned ? 10 : 0),
        max: 30,
        detail: '뜻 확인, 발음 듣기, 단어장 저장을 평가해요.',
        icon: FileText,
      },
      {
        label: '의미 퀴즈',
        score: quizScore,
        max: 25,
        detail: quizCorrect
          ? `${Math.max(1, metrics.quizAttempts)}번의 시도 끝에 정답을 찾았어요.`
          : '퀴즈 정답을 선택하면 점수가 반영돼요.',
        icon: Target,
      },
      {
        label: '받아쓰기',
        score: Math.max(
          0,
          Math.round((metrics.passage.dictationCompleted / sentenceCount) * 15) -
            accuracyPenalty,
        ),
        max: 15,
        detail: `${metrics.passage.dictationCompleted}/${sentenceCount}문장 완료 · 오답 시도 ${metrics.passage.wrongAttempts}회`,
        icon: Headphones,
      },
      {
        label: '영작',
        score: Math.max(
          0,
          Math.round((metrics.passage.writingCompleted / sentenceCount) * 15) -
            accuracyPenalty,
        ),
        max: 15,
        detail: `${metrics.passage.writingCompleted}/${sentenceCount}문장을 직접 만들었어요.`,
        icon: PenLine,
      },
      {
        label: '따라 말하기',
        score: Math.round(
          (metrics.passage.shadowingCompleted / sentenceCount) * 15,
        ),
        max: 15,
        detail: `${metrics.passage.shadowingCompleted}/${sentenceCount}문장을 소리 내어 연습했어요.`,
        icon: MessageCircle,
      },
    ];
  }, [metrics]);

  const total = activities.reduce((sum, activity) => sum + activity.score, 0);
  const grade =
    total >= 90 ? 'Excellent' : total >= 75 ? 'Great' : total >= 55 ? 'Growing' : 'Starting';
  const completedActivities = activities.filter(({ score }) => score > 0);
  const strength = [...activities].sort(
    (a, b) => b.score / b.max - a.score / a.max,
  )[0];
  const focus = [...activities].sort(
    (a, b) => a.score / a.max - b.score / b.max,
  )[0];
  const reportDate = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const downloadPdf = async () => {
    if (!reportRef.current || exporting) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#fffaf2',
      });
      const image = canvas.toDataURL('image/jpeg', 0.94);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = 210;
      const pageHeight = 297;
      const imageHeight = (canvas.height * pageWidth) / canvas.width;
      let remaining = imageHeight;
      let y = 0;

      pdf.addImage(image, 'JPEG', 0, y, pageWidth, imageHeight);
      remaining -= pageHeight;
      while (remaining > 0) {
        y = remaining - imageHeight;
        pdf.addPage();
        pdf.addImage(image, 'JPEG', 0, y, pageWidth, imageHeight);
        remaining -= pageHeight;
      }
      pdf.save(`영어의신-학습리포트-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-[980px] space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            Learning evaluation
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.05em]">학습 평가 리포트</h1>
        </div>
        <button
          type="button"
          onClick={downloadPdf}
          disabled={exporting}
          className="button-pop inline-flex items-center justify-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3 text-sm font-bold text-[hsl(var(--primary-foreground))] disabled:opacity-60"
        >
          {exporting ? <LoaderCircle className="animate-spin" size={17} /> : <Download size={17} />}
          {exporting ? 'PDF 만드는 중...' : 'PDF 다운로드'}
        </button>
      </div>

      <div ref={reportRef} className="rounded-[30px] bg-[hsl(var(--background))] p-5 sm:p-8">
        <section className="overflow-hidden rounded-[28px] bg-[hsl(var(--sidebar))] p-7 text-[hsl(var(--sidebar-foreground))] sm:p-9">
          <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-end">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">
                영어의신 · {reportDate}
              </p>
              <h2 className="mt-4 text-3xl font-bold tracking-[-.05em]">나의 영어 학습 기록</h2>
              <p className="mt-2 text-sm text-[hsl(var(--sidebar-foreground)/.6)]">
                현재 레벨 {level} · {completedActivities.length}/5개 영역 참여
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-[10px] border-[hsl(var(--sidebar-primary)/.25)]">
                <span className="font-mono text-3xl font-bold">{total}</span>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[.15em] opacity-55">Overall</p>
                <p className="mt-1 text-xl font-bold text-[hsl(var(--sidebar-primary))]">{grade}</p>
                <p className="mt-1 text-xs opacity-55">100점 만점</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          {activities.map(({ label, score, max, detail, icon: Icon }) => (
            <article key={label} className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                  <Icon size={18} />
                </span>
                <span className="font-mono text-lg font-bold">{score}<span className="text-xs text-[hsl(var(--muted-foreground))]">/{max}</span></span>
              </div>
              <h3 className="mt-4 font-bold">{label}</h3>
              <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{detail}</p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                <div className="h-full rounded-full bg-[hsl(var(--accent))]" style={{ width: `${(score / max) * 100}%` }} />
              </div>
            </article>
          ))}
        </section>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-[22px] bg-[hsl(var(--secondary))] p-5 text-[hsl(var(--secondary-foreground))]">
            <Award size={20} />
            <h3 className="mt-3 font-bold">잘하고 있는 점</h3>
            <p className="mt-2 text-sm leading-relaxed">
              {strength.score > 0
                ? `${strength.label} 영역이 가장 좋아요. 지금의 연습 방식을 계속 유지해보세요.`
                : '첫 학습 활동을 완료하면 강점 분석이 시작돼요.'}
            </p>
          </div>
          <div className="rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
            <Target size={20} className="text-[hsl(var(--accent))]" />
            <h3 className="mt-3 font-bold">다음 추천 학습</h3>
            <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
              {focus.label} 영역부터 한 단계 더 완료해보세요. 가장 낮은 영역을 먼저 채우면 종합 점수가 빠르게 올라가요.
            </p>
          </div>
        </section>

        <section className="mt-5 rounded-[22px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-[hsl(var(--accent))]" />
            <h3 className="font-bold">평가 기준</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            단어 이해 30점, 의미 퀴즈 25점, 받아쓰기 15점, 영작 15점, 따라 말하기 15점으로 구성됩니다.
            정답 여부, 완료 문장 수, 오답 시도 횟수를 함께 반영하며 이 리포트는 현재 학습 세션을 기준으로 작성됩니다.
          </p>
        </section>
      </div>
    </div>
  );
}