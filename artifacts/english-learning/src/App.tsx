import { type ReactNode, useEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flame,
  Headphones,
  Home as HomeIcon,
  Layers3,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';

type Level = 'Beginner' | 'Intermediate' | 'Advanced';

const levelCopy: Record<Level, { korean: string; detail: string; next: string }> = {
  Beginner: {
    korean: '기초부터 천천히, 입에 붙는 표현을 배워요.',
    detail: '짧고 쉬운 문장으로 자신감을 쌓는 중이에요.',
    next: '오늘은 생활 속 단어부터',
  },
  Intermediate: {
    korean: '대화 속에서 자연스럽게 쓰이는 표현을 익혀요.',
    detail: '알고 있는 단어를 내 문장으로 바꿔보는 단계예요.',
    next: '오늘은 발견의 순간을 말해봐요',
  },
  Advanced: {
    korean: '뉘앙스까지 살아 있는 영어를 연습해요.',
    detail: '정확한 뜻보다 맥락과 리듬에 집중해보세요.',
    next: '오늘은 우연한 발견을 섬세하게',
  },
};

const weekData = [
  { day: '월', minutes: 10, done: true },
  { day: '화', minutes: 8, done: true },
  { day: '수', minutes: 12, done: true },
  { day: '목', minutes: 9, done: true },
  { day: '금', minutes: 0, done: false },
  { day: '토', minutes: 0, done: false },
  { day: '일', minutes: 0, done: false },
];

const quizOptions = ['계획된 만남', '뜻밖의 행운', '오래된 기억', '작은 실수'];

const queryClient = new QueryClient();

function Logo() {
  return (
    <Link href="/" className="group flex items-center gap-3" data-testid="link-logo">
      <span className="relative flex h-10 w-10 items-center justify-center rounded-[14px] bg-[hsl(var(--sidebar-primary))] text-[hsl(var(--sidebar)]">
        <span className="absolute h-5 w-5 rounded-full border-[3px] border-[hsl(var(--sidebar))] border-r-transparent transition-transform duration-500 group-hover:rotate-180" />
        <span className="absolute h-2 w-2 translate-x-1 rounded-full bg-[hsl(var(--accent))]" />
      </span>
      <span className="font-mono text-[15px] font-bold tracking-[-0.04em] text-[hsl(var(--sidebar-foreground))]">
        lingoloop<span className="text-[hsl(var(--sidebar-primary))]">.</span>
      </span>
    </Link>
  );
}

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof HomeIcon; active: boolean }) {
  return (
    <Link
      href={href}
      data-testid={`link-nav-${label.toLowerCase()}`}
      className={`group flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-all duration-200 ${
        active
          ? 'bg-[hsl(var(--sidebar-accent))] text-[hsl(var(--sidebar-foreground))] shadow-[inset_3px_0_0_hsl(var(--sidebar-primary))]'
          : 'text-[hsl(var(--sidebar-foreground)/.62)] hover:bg-[hsl(var(--sidebar-accent)/.7)] hover:text-[hsl(var(--sidebar-foreground))]'
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
      <span>{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[hsl(var(--sidebar-primary))]" />}
    </Link>
  );
}

function Sidebar({ location }: { location: string }) {
  return (
    <aside className="hidden min-h-[100dvh] w-[248px] shrink-0 flex-col bg-[hsl(var(--sidebar))] px-5 py-7 md:flex">
      <Logo />
      <div className="mt-14">
        <p className="mb-3 px-3 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.38)]">My practice</p>
        <nav className="space-y-1.5">
          <NavItem href="/" label="오늘의 연습" icon={HomeIcon} active={location === '/'} />
          <NavItem href="/learn" label="배우기" icon={BookOpen} active={location === '/learn'} />
          <NavItem href="/vocabulary" label="단어장" icon={Layers3} active={location === '/vocabulary'} />
          <NavItem href="/progress" label="나의 기록" icon={BarChart3} active={location === '/progress'} />
        </nav>
      </div>
      <div className="mt-auto rounded-2xl border border-[hsl(var(--sidebar-foreground)/.12)] bg-[hsl(var(--sidebar-accent)/.55)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[.14em] text-[hsl(var(--sidebar-foreground)/.5)]">This week</span>
          <Trophy size={16} className="text-[hsl(var(--sidebar-primary))]" />
        </div>
        <p className="text-sm font-semibold text-[hsl(var(--sidebar-foreground))]">조금씩, 확실하게.</p>
        <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--sidebar-foreground)/.5)]">이번 주 4일 연속으로<br />연습하고 있어요.</p>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[hsl(var(--sidebar)/.7)]">
          <div className="progress-grow h-full w-[57%] rounded-full bg-[hsl(var(--sidebar-primary))]" />
        </div>
      </div>
    </aside>
  );
}

function MobileNav({ location }: { location: string }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.94)] px-2 py-2 shadow-[0_12px_32px_rgba(49,42,29,.15)] backdrop-blur-md md:hidden">
      {[
        { href: '/', label: '오늘', icon: HomeIcon },
        { href: '/learn', label: '배우기', icon: BookOpen },
        { href: '/vocabulary', label: '단어장', icon: Layers3 },
        { href: '/progress', label: '기록', icon: BarChart3 },
      ].map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          data-testid={`link-mobile-nav-${label}`}
          className={`flex min-w-[60px] flex-col items-center gap-1 rounded-xl px-3 py-1.5 text-[10px] font-bold transition-colors ${
            location === href ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))]'
          }`}
        >
          <Icon size={19} strokeWidth={location === href ? 2.5 : 1.8} />
          <span>{label}</span>
        </Link>
      ))}
    </nav>
  );
}

function Shell({ children, level, onLevelChange }: { children: ReactNode; level: Level; onLevelChange: (level: Level) => void }) {
  const [location] = useLocation();
  const [levelOpen, setLevelOpen] = useState(false);
  return (
    <div className="grain flex min-h-[100dvh] bg-[hsl(var(--background))]">
      <Sidebar location={location} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-[hsl(var(--border)/.75)] bg-[hsl(var(--background)/.88)] px-5 backdrop-blur-md sm:px-8 lg:px-12">
          <div className="md:hidden"><Logo /></div>
          <div className="hidden items-center gap-2 text-sm text-[hsl(var(--muted-foreground))] md:flex">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--accent))]" />
            매일 10분, 나를 위한 영어
          </div>
          <div className="relative ml-auto">
            <button
              type="button"
              onClick={() => setLevelOpen((open) => !open)}
              data-testid="button-level-menu"
              className="button-pop flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 text-xs font-bold text-[hsl(var(--foreground))]"
              aria-expanded={levelOpen}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--secondary))] text-[10px] text-[hsl(var(--secondary-foreground))]">민</span>
              <span className="hidden sm:inline">{level}</span>
              <ChevronRight size={14} className={`transition-transform ${levelOpen ? 'rotate-90' : ''}`} />
            </button>
            {levelOpen && (
              <div className="soft-pop absolute right-0 top-12 z-50 w-48 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2 shadow-[var(--shadow-md)]">
                <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-[.15em] text-[hsl(var(--muted-foreground))]">학습 레벨</p>
                {(['Beginner', 'Intermediate', 'Advanced'] as Level[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    data-testid={`button-level-${item.toLowerCase()}`}
                    onClick={() => { onLevelChange(item); setLevelOpen(false); }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition-colors ${level === item ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'hover:bg-[hsl(var(--muted))]'}`}
                  >
                    {item}
                    {level === item && <Check size={14} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1320px] px-5 pb-28 pt-8 sm:px-8 lg:px-12 lg:pb-12">{children}</main>
      </div>
      <MobileNav location={location} />
    </div>
  );
}

function LevelPills({ level, onChange }: { level: Level; onChange: (level: Level) => void }) {
  return (
    <div className="flex flex-wrap gap-2" data-testid="group-level-selection">
      {(['Beginner', 'Intermediate', 'Advanced'] as Level[]).map((item) => (
        <button
          key={item}
          type="button"
          data-testid={`button-select-${item.toLowerCase()}`}
          onClick={() => onChange(item)}
          className={`rounded-full border px-3.5 py-2 text-xs font-bold transition-all ${level === item ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] shadow-sm' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--accent)/.6)] hover:text-[hsl(var(--foreground))]'}`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  return (
    <div className="relative flex h-28 w-28 items-center justify-center rounded-full" style={{ background: `conic-gradient(hsl(var(--sidebar-primary)) ${percent * 3.6}deg, hsl(var(--sidebar)/.55) 0deg)` }} data-testid="progress-ring">
      <div className="flex h-[88px] w-[88px] flex-col items-center justify-center rounded-full bg-[hsl(var(--sidebar))]">
        <span className="font-mono text-2xl font-bold text-[hsl(var(--sidebar-foreground))]" data-testid="text-today-percent">{percent}%</span>
        <span className="text-[10px] text-[hsl(var(--sidebar-foreground)/.55)]">오늘의 달성</span>
      </div>
    </div>
  );
}

function Home({ level, onLevelChange, learned, onStart }: { level: Level; onLevelChange: (level: Level) => void; learned: boolean; onStart: () => void }) {
  const completed = learned ? 4 : 3;
  return (
    <div className="space-y-8">
      <section className="rise-in flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--accent))]" data-testid="text-greeting-label">
            <Sparkles size={14} /> Friday, May 24
          </p>
          <h1 className="font-sans text-3xl font-bold tracking-[-.04em] text-[hsl(var(--foreground))] sm:text-4xl" data-testid="text-welcome">좋은 아침이에요, 민지님<span className="text-[hsl(var(--accent))]">.</span></h1>
          <p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]" data-testid="text-level-message">{levelCopy[level].korean}</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card)/.55)] p-1.5 pl-3.5">
          <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">현재 레벨</span>
          <LevelPills level={level} onChange={onLevelChange} />
        </div>
      </section>

      <section className="rise-in stagger-1 grid gap-5 lg:grid-cols-[1.28fr_.72fr]">
        <div className="relative overflow-hidden rounded-[28px] bg-[hsl(var(--sidebar))] p-7 text-[hsl(var(--sidebar-foreground))] shadow-[var(--shadow-md)] sm:p-9">
          <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[36px] border-[hsl(var(--sidebar-primary)/.12)]" />
          <div className="absolute -bottom-20 right-24 h-40 w-40 rounded-full border-[22px] border-[hsl(var(--accent)/.12)]" />
          <div className="relative flex flex-col justify-between gap-8 sm:flex-row sm:items-center">
            <div>
              <div className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-[hsl(var(--sidebar-primary))]">
                <Clock3 size={15} /> Today's focus
              </div>
              <h2 className="max-w-md text-3xl font-bold leading-[1.12] tracking-[-.04em] sm:text-[40px]">10분이면 충분해요.<br /><span className="text-[hsl(var(--sidebar-primary))]">{levelCopy[level].next}.</span></h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[hsl(var(--sidebar-foreground)/.6)]">{levelCopy[level].detail} 오늘은 하나의 단어와 문장을 내 것으로 만들어요.</p>
              <button type="button" onClick={onStart} data-testid="button-start-session" className="button-pop mt-7 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--sidebar))]">
                {learned ? '한 번 더 연습하기' : '오늘의 연습 시작'} <ArrowRight size={17} />
              </button>
            </div>
            <div className="flex shrink-0 justify-center sm:pr-5">
              <ProgressRing percent={learned ? 80 : 60} />
            </div>
          </div>
          <div className="relative mt-8 flex items-center gap-3 border-t border-[hsl(var(--sidebar-foreground)/.12)] pt-5 text-xs text-[hsl(var(--sidebar-foreground)/.55)]">
            <Flame size={16} className="text-[hsl(var(--sidebar-primary))]" />
            <span><strong className="text-[hsl(var(--sidebar-foreground))]" data-testid="text-streak">7일 연속</strong>으로 이어가는 중이에요</span>
            <span className="ml-auto font-mono text-[11px]" data-testid="status-session-progress">{completed} / 5 lessons</span>
          </div>
        </div>

        <div className="card-lift rounded-[28px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 sm:p-8">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Word of the day</span>
              <h2 className="mt-5 font-sans text-3xl font-bold tracking-[-.05em]" data-testid="text-word-serendipity">serendipity</h2>
              <p className="mt-1 text-base font-semibold text-[hsl(var(--accent))]" data-testid="text-meaning-serendipity">뜻밖의 행운</p>
            </div>
            <div className="float-soft flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><Lightbulb size={20} /></div>
          </div>
          <div className="mt-8 border-l-2 border-[hsl(var(--accent)/.55)] pl-4">
            <p className="text-sm font-medium leading-relaxed text-[hsl(var(--foreground)/.8)]" data-testid="text-phrase-cafe">“I stumbled upon a little café.”</p>
            <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">작은 카페를 우연히 발견했어.</p>
          </div>
          <Link href="/learn" data-testid="link-word-practice" className="mt-7 flex items-center justify-between border-t border-[hsl(var(--border))] pt-5 text-xs font-bold text-[hsl(var(--foreground))] hover:text-[hsl(var(--accent))]">
            <span className="flex items-center gap-2"><Volume2 size={15} /> 발음 듣고 연습하기</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <section className="rise-in stagger-2 grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-6">
          <div className="flex items-center justify-between">
            <div><p className="font-mono text-[10px] font-bold uppercase tracking-[.17em] text-[hsl(var(--muted-foreground))]">Daily path</p><h3 className="mt-2 text-lg font-bold" data-testid="text-lessons-complete">오늘의 학습 · {completed}/5 완료</h3></div>
            <Target size={20} className="text-[hsl(var(--accent))]" />
          </div>
          <div className="mt-6 space-y-4">
            {['Warm up · 오늘의 단어', 'Context · 문장 속에서', 'Check · 의미 확인', 'Speak · 내 문장 만들기', 'Wrap up · 오늘을 저장하기'].map((item, index) => {
              const done = index < completed;
              return <div key={item} className="flex items-center gap-3 text-sm">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border ${done ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]'}`}>{done ? <Check size={13} /> : <span className="text-[10px]">{index + 1}</span>}</span>
                <span className={done ? 'text-[hsl(var(--foreground)/.55)] line-through' : 'font-semibold'}>{item}</span>
                {index === completed && <span className="ml-auto rounded-full bg-[hsl(var(--secondary))] px-2 py-1 text-[9px] font-bold text-[hsl(var(--secondary-foreground))]">NEXT</span>}
              </div>;
            })}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-[24px] bg-[hsl(var(--secondary))] p-7 text-[hsl(var(--secondary-foreground))]">
          <div className="absolute -right-7 -top-8 h-36 w-36 rounded-full border-[20px] border-[hsl(var(--secondary-foreground)/.08)]" />
          <div className="relative flex h-full flex-col justify-between gap-7 sm:flex-row sm:items-end">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[.17em] opacity-55">A tiny note</span>
              <p className="mt-4 max-w-md text-2xl font-bold leading-tight tracking-[-.04em]">“유창함은 많이 아는 게 아니라,<br className="hidden sm:block" /> 아는 것을 꺼내 쓰는 일이에요.”</p>
              <p className="mt-3 text-xs opacity-65">오늘 배운 단어를 대화에서 한 번 꺼내보세요.</p>
            </div>
            <div className="hidden shrink-0 rounded-full border border-[hsl(var(--secondary-foreground)/.2)] p-3 sm:block"><CircleHelp size={22} /></div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Learn({ level, onLevelChange, cardFlipped, setCardFlipped, quizAnswer, setQuizAnswer, learned, onMarkLearned, listening, onListen }: {
  level: Level;
  onLevelChange: (level: Level) => void;
  cardFlipped: boolean;
  setCardFlipped: (flipped: boolean) => void;
  quizAnswer: string | null;
  setQuizAnswer: (answer: string) => void;
  learned: boolean;
  onMarkLearned: () => void;
  listening: boolean;
  onListen: () => void;
}) {
  const correct = quizAnswer === '뜻밖의 행운';
  return (
    <div className="mx-auto max-w-[1000px] space-y-8">
      <section className="rise-in flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Session 01 / 05</p><h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">오늘의 단어를<br className="sm:hidden" /> 만나볼까요<span className="text-[hsl(var(--accent))]">?</span></h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">{levelCopy[level].detail}</p></div>
        <div className="flex items-center gap-3"><span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">레벨</span><LevelPills level={level} onChange={onLevelChange} /></div>
      </section>
      <div className="h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]"><div className={`h-full rounded-full bg-[hsl(var(--accent))] transition-all duration-700 ${learned ? 'w-[80%]' : 'w-[20%]'}`} data-testid="progress-learn-session" /></div>

      <section className="rise-in stagger-1 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <button type="button" onClick={() => setCardFlipped(!cardFlipped)} data-testid="button-flip-word-card" className="group relative h-[360px] w-full [perspective:1200px] sm:h-[410px]">
            <div className={`relative h-full w-full duration-500 [transform-style:preserve-3d] ${cardFlipped ? '[transform:rotateY(180deg)]' : ''}`}>
              <div className="absolute inset-0 flex [backface-visibility:hidden] flex-col justify-between overflow-hidden rounded-[30px] bg-[hsl(var(--sidebar))] p-8 text-left text-[hsl(var(--sidebar-foreground))] shadow-[var(--shadow-md)] sm:p-10">
                <div className="flex items-center justify-between"><span className="rounded-full border border-[hsl(var(--sidebar-foreground)/.2)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-[hsl(var(--sidebar-foreground)/.6)]">noun</span><span className="text-xs text-[hsl(var(--sidebar-foreground)/.5)]">카드를 눌러 뒤집기</span></div>
                <div><p className="font-sans text-5xl font-bold tracking-[-.07em] sm:text-7xl" data-testid="text-learning-word">serendipity</p><p className="mt-3 text-sm text-[hsl(var(--sidebar-primary))]">/ˌserənˈdipitē/</p></div>
                <div className="flex items-center justify-between border-t border-[hsl(var(--sidebar-foreground)/.14)] pt-5 text-xs text-[hsl(var(--sidebar-foreground)/.55)]"><span>우연히 좋은 것을 발견하는 일</span><RotateCcw size={17} /></div>
              </div>
              <div className="absolute inset-0 flex [backface-visibility:hidden] [transform:rotateY(180deg)] flex-col justify-between rounded-[30px] bg-[hsl(var(--accent))] p-8 text-[hsl(var(--accent-foreground))] shadow-[var(--shadow-md)] sm:p-10">
                <div className="flex items-center justify-between"><span className="rounded-full border border-[hsl(var(--accent-foreground)/.3)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.16em]">meaning</span><CheckCircle2 size={20} /></div>
                <div><p className="text-4xl font-bold tracking-[-.06em]" data-testid="text-flipped-meaning">뜻밖의 행운</p><p className="mt-4 max-w-sm text-base leading-relaxed text-[hsl(var(--accent-foreground)/.75)]">준비하지 않았지만 우연히 좋은 것을 만나는 순간이에요.</p></div>
                <p className="border-t border-[hsl(var(--accent-foreground)/.25)] pt-5 text-xs text-[hsl(var(--accent-foreground)/.75)]">serendipity = a happy discovery by chance</p>
              </div>
            </div>
          </button>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] px-4 py-3">
            <span className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Headphones size={15} /> 발음을 귀로 먼저 익혀보세요</span>
            <button type="button" onClick={onListen} data-testid="button-listen-word" className="button-pop flex items-center gap-2 rounded-lg bg-[hsl(var(--secondary))] px-3 py-2 text-xs font-bold text-[hsl(var(--secondary-foreground))]">
              <Volume2 size={14} /> {listening ? '듣는 중...' : 'Listen'}
            </button>
          </div>
        </div>

        <div className="flex flex-col rounded-[30px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-7 sm:p-8">
          <div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Quick check</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-xs font-bold">01</span></div>
          <h2 className="mt-8 text-xl font-bold leading-snug tracking-[-.03em]" data-testid="text-quiz-question">“serendipity”는 어떤 뜻일까요?</h2>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">가장 가까운 의미를 골라보세요.</p>
          <div className="mt-7 space-y-2.5">
            {quizOptions.map((option, index) => {
              const selected = quizAnswer === option;
              const isCorrect = option === '뜻밖의 행운';
              return <button key={option} type="button" onClick={() => setQuizAnswer(option)} data-testid={`button-quiz-option-${index + 1}`} className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-sm transition-all ${selected ? (isCorrect ? 'border-[hsl(var(--secondary-foreground)/.45)] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'border-[hsl(var(--destructive)/.45)] bg-[hsl(var(--destructive)/.08)]') : 'border-[hsl(var(--border))] hover:border-[hsl(var(--accent)/.55)] hover:bg-[hsl(var(--muted)/.55)]'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] ${selected ? 'bg-[hsl(var(--card))]' : 'bg-[hsl(var(--muted))]'}`}>{String.fromCharCode(65 + index)}</span><span className="font-semibold">{option}</span>{selected && <span className="ml-auto">{isCorrect ? <Check size={16} /> : <X size={16} />}</span>}
              </button>;
            })}
          </div>
          {quizAnswer && <div className={`soft-pop mt-5 rounded-xl p-3.5 text-xs font-semibold ${correct ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]'}`} data-testid="status-quiz-feedback">{correct ? '정확해요. 좋은 발견을 뜻하는 단어예요.' : '거의 다 왔어요. 다시 한 번 뜻을 살펴볼까요?'}</div>}
          <button type="button" onClick={onMarkLearned} disabled={learned} data-testid="button-mark-learned" className={`button-pop mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold ${learned ? 'cursor-default bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'}`}>
            {learned ? <><CheckCircle2 size={17} /> 단어장에 저장했어요</> : <><BookOpen size={17} /> 배운 단어로 표시하기</>}
          </button>
        </div>
      </section>
      <div className="rise-in stagger-2 flex items-center gap-3 rounded-2xl bg-[hsl(var(--secondary)/.5)] px-5 py-4 text-xs text-[hsl(var(--secondary-foreground))]"><Lightbulb size={17} /><span><strong>팁:</strong> 카페에서 우연히 좋은 장소를 발견했을 때, “I stumbled upon...”으로 문장을 시작해보세요.</span></div>
    </div>
  );
}

function Vocabulary({ learned, onRemove }: { learned: boolean; onRemove: () => void }) {
  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      <section className="rise-in flex items-end justify-between"><div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Your collection</p><h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">나의 단어장<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">배운 단어는 다시 만날수록 내 것이 돼요.</p></div><span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-2 font-mono text-xs font-bold text-[hsl(var(--secondary-foreground))]" data-testid="text-vocabulary-count">{learned ? '1 word' : '0 words'}</span></section>
      {learned ? <section className="rise-in stagger-1 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <article className="card-lift relative overflow-hidden rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6" data-testid="card-vocabulary-serendipity">
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[hsl(var(--secondary)/.6)]" />
          <div className="relative flex items-start justify-between"><span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">noun</span><button type="button" onClick={onRemove} data-testid="button-remove-serendipity" className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--destructive))]" aria-label="단어장에서 삭제"><X size={16} /></button></div>
          <p className="relative mt-8 text-3xl font-bold tracking-[-.06em]" data-testid="text-saved-serendipity">serendipity</p><p className="relative mt-1 text-sm font-semibold text-[hsl(var(--accent))]">뜻밖의 행운</p><p className="relative mt-5 border-l-2 border-[hsl(var(--accent)/.6)] pl-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">I stumbled upon a little café.</p>
          <div className="mt-7 flex items-center gap-2 border-t border-[hsl(var(--border))] pt-4 text-[10px] font-bold text-[hsl(var(--secondary-foreground))]"><CheckCircle2 size={14} /> 오늘 배운 단어</div>
        </article>
        <div className="flex min-h-[250px] flex-col items-center justify-center rounded-[26px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.45)] p-6 text-center"><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><Sparkles size={19} /></span><p className="text-sm font-bold">더 많이 모아볼까요?</p><p className="mt-1 max-w-[220px] text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">매일 하나씩만 저장해도 한 달 뒤엔 30개의 이야기가 생겨요.</p><Link href="/learn" data-testid="link-vocabulary-keep-learning" className="mt-4 text-xs font-bold text-[hsl(var(--accent))] hover:underline">계속 배우기 <ArrowRight className="ml-1 inline" size={13} /></Link></div>
      </section> : <section className="rise-in stagger-1 flex min-h-[420px] flex-col items-center justify-center rounded-[30px] border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--card)/.48)] px-6 text-center"><span className="float-soft flex h-16 w-16 items-center justify-center rounded-[22px] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><Layers3 size={27} /></span><h2 className="mt-6 text-xl font-bold" data-testid="text-vocabulary-empty">아직 저장한 단어가 없어요</h2><p className="mt-2 max-w-sm text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">오늘의 단어를 배우고 단어장에 저장해보세요.<br />작은 기록이 오래 남는 실력이 돼요.</p><Link href="/learn" data-testid="link-vocabulary-empty-cta" className="button-pop mt-7 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))]">첫 단어 배우기 <ArrowRight size={16} /></Link></section>}
    </div>
  );
}

function Progress({ learned }: { learned: boolean }) {
  const totalMinutes = weekData.reduce((sum, day) => sum + day.minutes, 0) + (learned ? 10 : 0);
  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      <section className="rise-in"><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Keep the loop going</p><h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">나의 기록<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">완벽한 날보다, 다시 돌아온 날을 세어봐요.</p></section>
      <section className="rise-in stagger-1 grid gap-4 sm:grid-cols-3">
        {[{ label: '현재 스트릭', value: '7일', detail: '꾸준히 이어가는 중', icon: Flame, accent: true }, { label: '이번 주 학습', value: `${totalMinutes}분`, detail: '목표 70분 중', icon: Clock3, accent: false }, { label: '완료한 레슨', value: learned ? '4개' : '3개', detail: '오늘의 목표 5개', icon: CheckCircle2, accent: false }].map(({ label, value, detail, icon: Icon, accent }) => <div key={label} className={`card-lift rounded-[22px] border p-5 ${accent ? 'border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.1)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]'}`}><div className="flex items-center justify-between"><span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">{label}</span><Icon size={17} className={accent ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))]'} /></div><p className="mt-5 font-mono text-3xl font-bold tracking-[-.07em]" data-testid={`text-progress-${label}`}>{value}</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{detail}</p></div>)}
      </section>
      <section className="rise-in stagger-2 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6 sm:p-8"><div className="flex items-end justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">Weekly rhythm</p><h2 className="mt-2 text-lg font-bold">이번 주 학습 리듬</h2></div><span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">May 20 — 26</span></div><div className="mt-10 flex h-44 items-end justify-between gap-2 sm:gap-4">{weekData.map((day, index) => { const current = index === 4 && learned; const height = current ? 65 : day.minutes ? Math.max(35, day.minutes * 7) : 9; return <div key={day.day} className="flex h-full flex-1 flex-col items-center justify-end gap-3"><div className="relative flex h-full w-full items-end justify-center"><div className={`progress-grow w-full max-w-[40px] rounded-t-lg ${current ? 'bg-[hsl(var(--accent))]' : day.done ? 'bg-[hsl(var(--secondary-foreground)/.72)]' : 'bg-[hsl(var(--muted))]'}`} style={{ height: `${height}%` }} data-testid={`bar-progress-${day.day}`} />{current && <span className="absolute -top-6 font-mono text-[9px] font-bold text-[hsl(var(--accent))]">10m</span>}</div><span className={`text-xs font-bold ${current ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{day.day}</span></div>; })}</div></div>
        <div className="rounded-[26px] bg-[hsl(var(--sidebar))] p-7 text-[hsl(var(--sidebar-foreground))]"><div className="flex items-center justify-between"><span className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.5)]">Next milestone</span><Trophy size={18} className="text-[hsl(var(--sidebar-primary))]" /></div><div className="mt-10"><p className="text-4xl font-bold tracking-[-.07em]">10일</p><p className="mt-2 text-sm text-[hsl(var(--sidebar-foreground)/.6)]">연속 학습까지 3일 남았어요.</p></div><div className="mt-8 h-2 overflow-hidden rounded-full bg-[hsl(var(--sidebar-accent))]"><div className="progress-grow h-full w-[70%] rounded-full bg-[hsl(var(--sidebar-primary))]" /></div><p className="mt-3 text-right font-mono text-[10px] text-[hsl(var(--sidebar-foreground)/.45)]">7 / 10 DAYS</p></div>
      </section>
      <section className="rise-in stagger-3 flex flex-col items-start justify-between gap-4 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.45)] p-6 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><Sparkles size={20} className="mt-0.5 text-[hsl(var(--accent))]" /><div><p className="text-sm font-bold">민지님의 루프는 잘 돌아가고 있어요.</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">오늘 10분을 채우면 이번 주 목표의 57%를 달성해요.</p></div></div><Link href="/learn" data-testid="link-progress-practice" className="flex shrink-0 items-center gap-2 text-xs font-bold text-[hsl(var(--accent))]">오늘 연습하기 <ArrowRight size={14} /></Link></section>
    </div>
  );
}

function NotFound() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] p-6 text-center"><div><p className="font-mono text-xs font-bold uppercase tracking-[.2em] text-[hsl(var(--accent))]">404 / loop lost</p><h1 className="mt-4 text-4xl font-bold">이 페이지는 아직 없어요.</h1><Link href="/" data-testid="link-not-found-home" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent))]">오늘로 돌아가기 <ArrowRight size={16} /></Link></div></div>;
}

function RouterContent({ level, onLevelChange, learned, onStart, cardFlipped, setCardFlipped, quizAnswer, setQuizAnswer, onMarkLearned, listening, onListen, onRemove }: {
  level: Level; onLevelChange: (level: Level) => void; learned: boolean; onStart: () => void; cardFlipped: boolean; setCardFlipped: (flipped: boolean) => void; quizAnswer: string | null; setQuizAnswer: (answer: string) => void; onMarkLearned: () => void; listening: boolean; onListen: () => void; onRemove: () => void;
}) {
  return <Switch>
    <Route path="/"><Home level={level} onLevelChange={onLevelChange} learned={learned} onStart={onStart} /></Route>
    <Route path="/learn"><Learn level={level} onLevelChange={onLevelChange} cardFlipped={cardFlipped} setCardFlipped={setCardFlipped} quizAnswer={quizAnswer} setQuizAnswer={setQuizAnswer} learned={learned} onMarkLearned={onMarkLearned} listening={listening} onListen={onListen} /></Route>
    <Route path="/vocabulary"><Vocabulary learned={learned} onRemove={onRemove} /></Route>
    <Route path="/progress"><Progress learned={learned} /></Route>
    <Route component={NotFound} />
  </Switch>;
}

function App() {
  const [level, setLevel] = useState<Level>('Intermediate');
  const [learned, setLearned] = useState(false);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!listening) return;
    const timer = window.setTimeout(() => setListening(false), 1100);
    return () => window.clearTimeout(timer);
  }, [listening]);

  const startSession = () => {
    setLocation('/learn');
    setCardFlipped(false);
    setQuizAnswer(null);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <ErrorBoundary>
            <Shell level={level} onLevelChange={setLevel}>
              <RouterContent level={level} onLevelChange={setLevel} learned={learned} onStart={startSession} cardFlipped={cardFlipped} setCardFlipped={setCardFlipped} quizAnswer={quizAnswer} setQuizAnswer={setQuizAnswer} onMarkLearned={() => { setLearned(true); setCardFlipped(true); }} listening={listening} onListen={() => setListening(true)} onRemove={() => setLearned(false)} />
            </Shell>
          </ErrorBoundary>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;