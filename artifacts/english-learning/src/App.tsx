import { type ReactNode, useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ClerkProvider,
  Show,
  SignIn,
  SignUp,
  useAuth,
  useClerk,
  useUser,
} from '@clerk/react';
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flame,
  Headphones,
  Home as HomeIcon,
  Layers3,
  Lightbulb,
  MessageCircle,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  Volume2,
  X,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Redirect, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import PassagePractice, { type PassageEvaluation } from '@/components/passage-practice';
import AdminUpload from '@/components/admin-upload';
import HomeVideoPlayer from '@/components/home-video-player';
import LearningReport, { type LearningMetrics } from '@/components/learning-report';
import { useAdminAccess } from '@/hooks/use-admin-access';
import LevelAssignments from '@/components/level-assignments';
import type { Assignment, LearningContent } from '@workspace/api-client-react';
import { prepareAssignmentPractice } from '@/lib/practice-material';
import { apiFetch, setApiAuthTokenGetter } from '@/lib/api-fetch';
import {
  getDefaultLearningContent,
  LEARNING_CONTENT_UPDATED_EVENT,
  type LearnContent,
} from '@/lib/learning-content';

type Level = 'Beginner' | 'Intermediate' | 'Advanced';

const levelCopy: Record<Level, { korean: string; detail: string; next: string }> = {
  Beginner: {
    korean: '기초부터 천천히, 입에 붙는 표현을 배워요.',
    detail: '짧고 쉬운 문장으로 자신감을 쌓는 중이에요.',
    next: '오늘은 생활 속 단어부터',
  },
  Intermediate: {
    korean: 'Practice Makes Perfect!',
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

const emptyPassageEvaluation: PassageEvaluation = {
  completedSteps: 0,
  totalSteps: 12,
  dictationCompleted: 0,
  writingCompleted: 0,
  shadowingCompleted: 0,
  wrongAttempts: 0,
};

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

function stripBase(path: string) {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || '/'
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: 'clerk',
  options: {
    logoPlacement: 'inside' as const,
    logoLinkUrl: basePath || '/',
    logoImageUrl: `${window.location.origin}${basePath}/logo-cat.png`,
  },
  variables: {
    colorPrimary: '#e88942',
    colorForeground: '#252d40',
    colorMutedForeground: '#6f756f',
    colorDanger: '#b9534e',
    colorBackground: '#fffaf2',
    colorInput: '#fffdf8',
    colorInputForeground: '#252d40',
    colorNeutral: '#ded8cc',
    fontFamily: 'DM Sans, Noto Sans KR, sans-serif',
    borderRadius: '0.75rem',
  },
  elements: {
    rootBox: 'w-full flex justify-center',
    cardBox: 'bg-[#fffaf2] rounded-[24px] w-[440px] max-w-full overflow-hidden shadow-xl',
    card: '!shadow-none !border-0 !bg-transparent !rounded-none',
    footer: '!shadow-none !border-0 !bg-transparent !rounded-none',
    headerTitle: 'text-[#252d40] font-bold',
    headerSubtitle: 'text-[#6f756f]',
    socialButtonsBlockButtonText: 'text-[#252d40] font-semibold',
    formFieldLabel: 'text-[#252d40] font-semibold',
    footerActionLink: 'text-[#d36e32] font-semibold',
    footerActionText: 'text-[#6f756f]',
    dividerText: 'text-[#6f756f]',
    formFieldSuccessText: 'text-[#497b6b]',
    alertText: 'text-[#b9534e]',
    logoBox: 'rounded-xl overflow-hidden',
    logoImage: 'object-contain',
    socialButtonsBlockButton: 'border-[#ded8cc] bg-[#fffdf8] hover:bg-[#f6efe3]',
    formButtonPrimary: 'bg-[#252d40] hover:bg-[#313b52] text-white',
    formFieldInput: 'border-[#ded8cc] bg-[#fffdf8] text-[#252d40]',
    footerAction: 'border-t border-[#ded8cc]',
    dividerLine: 'bg-[#ded8cc]',
    alert: 'bg-[#fff0ec] border-[#f2c8bd]',
    otpCodeFieldInput: 'border-[#ded8cc] bg-[#fffdf8] text-[#252d40]',
    formFieldRow: 'gap-1',
    main: 'bg-transparent',
  },
};

function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <Link href="/" className="group flex items-center gap-3" data-testid="link-logo">
      <img
        src={`${basePath}/logo-cat.png`}
        alt="토스일곡아이들 페르시안 고양이 로고"
        className="h-11 w-11 object-contain transition-transform duration-300 group-hover:scale-105"
      />
      <span className={`font-mono text-[15px] font-bold tracking-[-0.04em] ${
        inverse
          ? 'text-[hsl(var(--sidebar-foreground))]'
          : 'text-[hsl(var(--foreground))]'
      }`}>
        토스일곡아이들<span className="text-[hsl(var(--sidebar-primary))]">.</span>
      </span>
    </Link>
  );
}

function PublicLanding() {
  return (
    <main className="grain flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-5 py-12">
      <div className="w-full max-w-[1060px]">
        <div className="flex items-center justify-between">
          <Logo />
          <Link
            href="/sign-in"
            data-testid="link-landing-sign-in-top"
            className="text-sm font-bold text-[hsl(var(--foreground))] transition-colors hover:text-[hsl(var(--accent))]"
          >
            로그인
          </Link>
        </div>
        <section className="mt-20 grid items-center gap-12 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rise-in">
            <p className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[.17em] text-[hsl(var(--accent))]">
              <Sparkles size={14} /> 토스일곡아이들
            </p>
            <h1 className="max-w-2xl text-5xl font-bold leading-[1.08] tracking-[-.06em] text-[hsl(var(--foreground))] sm:text-6xl">
              매일 10분,<br />
              <span className="text-[hsl(var(--accent))]">영어가 내 것이 되는</span> 시간.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-[hsl(var(--muted-foreground))]">
              단어를 보고 끝내지 않아요. 지문의 모든 문장을 듣고, 적고, 직접 말하면서 진짜로 꺼내 쓸 수 있는 영어를 연습해요.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/sign-up"
                data-testid="link-landing-sign-up"
                className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--primary-foreground))]"
              >
                무료로 시작하기 <ArrowRight size={17} />
              </Link>
              <Link
                href="/sign-in"
                data-testid="link-landing-sign-in"
                className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--accent)/.5)]"
              >
                로그인
              </Link>
            </div>
          </div>
          <div className="rise-in stagger-1 relative overflow-hidden rounded-[30px] bg-[hsl(var(--sidebar))] p-7 text-[hsl(var(--sidebar-foreground))] shadow-[var(--shadow-md)] sm:p-9">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full border-[30px] border-[hsl(var(--sidebar-primary)/.15)]" />
            <div className="relative">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">A small daily loop</span>
                <CheckCircle2 size={19} className="text-[hsl(var(--sidebar-primary))]" />
              </div>
              <p className="mt-16 text-4xl font-bold tracking-[-.06em]">serendipity</p>
              <p className="mt-2 font-semibold text-[hsl(var(--sidebar-primary))]">뜻밖의 행운</p>
              <p className="mt-8 border-l-2 border-[hsl(var(--accent))] pl-4 text-sm leading-relaxed text-[hsl(var(--sidebar-foreground)/.7)]">
                “I stumbled upon a little café.”
              </p>
              <div className="mt-10 flex items-center justify-between border-t border-[hsl(var(--sidebar-foreground)/.14)] pt-5 text-xs text-[hsl(var(--sidebar-foreground)/.55)]">
                <span className="flex items-center gap-2"><Headphones size={15} /> 듣고 따라 말하기</span>
                <ArrowRight size={15} />
              </div>
            </div>
          </div>
        </section>
        <div className="mt-16 flex flex-wrap gap-x-8 gap-y-3 border-t border-[hsl(var(--border))] pt-5 text-xs text-[hsl(var(--muted-foreground))]">
          <span>받아쓰기</span>
          <span>영작</span>
          <span>따라 말하기</span>
          <span>나만의 단어장</span>
        </div>
      </div>
    </main>
  );
}

function SignInPage() {
  return (
    <div className="grain flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-4 py-10">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="grain flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] px-4 py-10">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function AccountControl() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { isAdmin } = useAdminAccess();
  const name = user?.firstName || user?.emailAddresses[0]?.emailAddress?.split('@')[0] || '학습자';

  return (
    <div className="flex items-center gap-2">
      {isAdmin && (
        <Link
          href="/admin"
          data-testid="link-admin-upload"
          className="rounded-lg px-2.5 py-2 text-xs font-bold text-[hsl(var(--accent))] transition-colors hover:bg-[hsl(var(--muted))]"
        >
          관리자
        </Link>
      )}
      <span className="hidden text-xs font-semibold text-[hsl(var(--muted-foreground))] sm:inline" data-testid="text-account-name">
        {name}
      </span>
      <button
        type="button"
        onClick={() => signOut({ redirectUrl: basePath || '/' })}
        data-testid="button-sign-out"
        className="rounded-lg px-2.5 py-2 text-xs font-bold text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
      >
        로그아웃
      </button>
    </div>
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
      <Logo inverse />
      <div className="mt-14">
        <p className="mb-3 px-3 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-foreground)/.38)]">My practice</p>
        <nav className="space-y-1.5">
          <NavItem href="/dashboard" label="오늘의 연습" icon={HomeIcon} active={location === '/dashboard'} />
          <NavItem href="/learn" label="배우기" icon={BookOpen} active={location === '/learn'} />
          <NavItem href="/passage" label="지문 연습" icon={MessageCircle} active={location === '/passage'} />
          <NavItem href="/vocabulary" label="단어장" icon={Layers3} active={location === '/vocabulary'} />
          <NavItem href="/progress" label="나의 기록" icon={BarChart3} active={location === '/progress'} />
          <NavItem href="/report" label="학습 평가" icon={Target} active={location === '/report'} />
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
        { href: '/dashboard', label: '오늘', icon: HomeIcon },
        { href: '/learn', label: '배우기', icon: BookOpen },
          { href: '/passage', label: '지문', icon: MessageCircle },
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
            해봐~ 된다니깐!
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
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
            <AccountControl />
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

function Home({ level, onLevelChange, learned, onStart, content }: { level: Level; onLevelChange: (level: Level) => void; learned: boolean; onStart: (assignment?: Assignment) => Promise<void>; content: LearnContent }) {
  const completed = learned ? 4 : 3;
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [startError, setStartError] = useState('');

  const startPractice = async (assignment?: Assignment) => {
    setStartError('');
    try {
      await onStart(assignment);
    } catch (error) {
      setStartError(error instanceof Error ? error.message : '자료를 연습으로 불러오지 못했습니다.');
    }
  };
  return (
    <div className="space-y-8">
      <section className="rise-in flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[.16em] text-[hsl(var(--accent))]" data-testid="text-greeting-label">
            <Sparkles size={14} /> Friday, May 24
          </p>
          <h1 className="font-sans text-3xl font-bold tracking-[-.04em] text-[hsl(var(--foreground))] sm:text-4xl" data-testid="text-welcome">다시 만나서 반가워요, 회원님<span className="text-[hsl(var(--accent))]">.</span></h1>
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
              <h2 className="max-w-md text-3xl font-bold leading-[1.12] tracking-[-.04em] text-[hsl(var(--sidebar-primary))] sm:text-[40px]">{levelCopy[level].next}.</h2>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[hsl(var(--sidebar-foreground)/.6)]">{levelCopy[level].detail} Let&apos;s do it.</p>
              <button type="button" onClick={() => void startPractice(assignments[0])} data-testid="button-start-session" className="button-pop mt-7 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-5 py-3.5 text-sm font-bold text-[hsl(var(--sidebar))]">
                {learned ? '한 번 더 연습하기' : '오늘의 연습 시작'} <ArrowRight size={17} />
              </button>
              {startError && <p className="mt-3 max-w-sm text-xs font-semibold text-[hsl(var(--sidebar-primary))]">{startError}</p>}
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
               <h2 className="mt-5 font-sans text-3xl font-bold tracking-[-.05em]" data-testid="text-word-serendipity">{content.word}</h2>
               <p className="mt-1 text-base font-semibold text-[hsl(var(--accent))]" data-testid="text-meaning-serendipity">{content.shortMeaning}</p>
            </div>
            <div className="float-soft flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]"><Lightbulb size={20} /></div>
          </div>
          <div className="mt-8 border-l-2 border-[hsl(var(--accent)/.55)] pl-4">
             <p className="text-sm font-medium leading-relaxed text-[hsl(var(--foreground)/.8)]" data-testid="text-phrase-cafe">“{content.exampleSentence}”</p>
             <p className="mt-1.5 text-xs text-[hsl(var(--muted-foreground))]">{content.exampleKorean}</p>
          </div>
          <Link href="/learn" data-testid="link-word-practice" className="mt-7 flex items-center justify-between border-t border-[hsl(var(--border))] pt-5 text-xs font-bold text-[hsl(var(--foreground))] hover:text-[hsl(var(--accent))]">
            <span className="flex items-center gap-2"><Volume2 size={15} /> 발음 듣고 연습하기</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <LevelAssignments
        level={level}
        onAssignmentsChange={setAssignments}
        onStartPractice={(assignment) => void startPractice(assignment)}
      />

      <HomeVideoPlayer />
    </div>
  );
}

function Learn({ level, onLevelChange, cardFlipped, setCardFlipped, quizAnswer, setQuizAnswer, learned, onMarkLearned, listening, onListen, content }: {
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
  content: LearnContent;
}) {
  const correct = quizAnswer === content.correctMeaning;
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
                <div className="flex items-center justify-end"><span className="text-xs text-[hsl(var(--sidebar-foreground)/.5)]">카드를 눌러 뒤집기</span></div>
                <div><p className="font-sans text-5xl font-bold tracking-[-.07em] sm:text-7xl" data-testid="text-learning-word">{content.word}</p></div>
                <div className="flex items-center justify-between border-t border-[hsl(var(--sidebar-foreground)/.14)] pt-5 text-xs text-[hsl(var(--sidebar-foreground)/.55)]"><span>{content.meaningDetail}</span><RotateCcw size={17} /></div>
              </div>
              <div className="absolute inset-0 flex [backface-visibility:hidden] [transform:rotateY(180deg)] flex-col justify-between rounded-[30px] bg-[hsl(var(--accent))] p-8 text-[hsl(var(--accent-foreground))] shadow-[var(--shadow-md)] sm:p-10">
                <div className="flex items-center justify-between"><span className="rounded-full border border-[hsl(var(--accent-foreground)/.3)] px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.16em]">meaning</span><CheckCircle2 size={20} /></div>
                <div><p className="text-4xl font-bold tracking-[-.06em]" data-testid="text-flipped-meaning">{content.shortMeaning}</p><p className="mt-4 max-w-sm text-base leading-relaxed text-[hsl(var(--accent-foreground)/.75)]">{content.meaningDetail}</p></div>
                <p className="border-t border-[hsl(var(--accent-foreground)/.25)] pt-5 text-xs text-[hsl(var(--accent-foreground)/.75)]">{content.word} = {content.englishDefinition}</p>
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
          <h2 className="mt-8 text-xl font-bold leading-snug tracking-[-.03em]" data-testid="text-quiz-question">“{content.word}”는 어떤 뜻일까요?</h2>
          <p className="mt-2 text-xs text-[hsl(var(--muted-foreground))]">가장 가까운 의미를 골라보세요.</p>
          <div className="mt-7 space-y-2.5">
            {content.quizOptions.map((option, index) => {
              const selected = quizAnswer === option;
              const isCorrect = option === content.correctMeaning;
              return <button key={option} type="button" onClick={() => setQuizAnswer(option)} data-testid={`button-quiz-option-${index + 1}`} className={`flex w-full items-center gap-3 rounded-xl border p-3.5 text-left text-sm transition-all ${selected ? (isCorrect ? 'border-[hsl(var(--secondary-foreground)/.45)] bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'border-[hsl(var(--destructive)/.45)] bg-[hsl(var(--destructive)/.08)]') : 'border-[hsl(var(--border))] hover:border-[hsl(var(--accent)/.55)] hover:bg-[hsl(var(--muted)/.55)]'}`}>
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono text-[10px] ${selected ? 'bg-[hsl(var(--card))]' : 'bg-[hsl(var(--muted))]'}`}>{String.fromCharCode(65 + index)}</span><span className="font-semibold">{option}</span>{selected && <span className="ml-auto">{isCorrect ? <Check size={16} /> : <X size={16} />}</span>}
              </button>;
            })}
          </div>
           {quizAnswer && <div className={`soft-pop mt-5 rounded-xl p-3.5 text-xs font-semibold ${correct ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'bg-[hsl(var(--destructive)/.1)] text-[hsl(var(--destructive))]'}`} data-testid="status-quiz-feedback">{correct ? `정확해요. ${content.shortMeaning}을 뜻하는 단어예요.` : '거의 다 왔어요. 다시 한 번 뜻을 살펴볼까요?'}</div>}
          <button type="button" onClick={onMarkLearned} disabled={learned} data-testid="button-mark-learned" className={`button-pop mt-auto flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3.5 text-sm font-bold ${learned ? 'cursor-default bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]' : 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'}`}>
            {learned ? <><CheckCircle2 size={17} /> 단어장에 저장했어요</> : <><BookOpen size={17} /> 배운 단어로 표시하기</>}
          </button>
        </div>
      </section>
       <div className="rise-in stagger-2 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[hsl(var(--secondary)/.5)] px-5 py-4 text-xs text-[hsl(var(--secondary-foreground))] sm:flex-row sm:items-center">
         <div className="flex items-start gap-3"><Lightbulb className="mt-0.5 shrink-0" size={17} /><span><strong>팁:</strong> {content.tip}<span className="mt-1 block opacity-75">예문: {content.exampleSentence} · {content.exampleKorean}</span></span></div>
        <Link href="/passage" data-testid="link-passage-practice" className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[hsl(var(--card)/.55)] px-3 py-2 font-bold text-[hsl(var(--secondary-foreground))] hover:bg-[hsl(var(--card))]">지문 전체 연습 <ArrowRight size={14} /></Link>
      </div>
    </div>
  );
}

function Vocabulary({ learned, onRemove, content }: { learned: boolean; onRemove: () => void; content: LearnContent }) {
  return (
    <div className="mx-auto max-w-[1080px] space-y-8">
      <section className="rise-in flex items-end justify-between"><div><p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Your collection</p><h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl">나의 단어장<span className="text-[hsl(var(--accent))]">.</span></h1><p className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">배운 단어는 다시 만날수록 내 것이 돼요.</p></div><span className="rounded-full bg-[hsl(var(--secondary))] px-3 py-2 font-mono text-xs font-bold text-[hsl(var(--secondary-foreground))]" data-testid="text-vocabulary-count">{learned ? '1 word' : '0 words'}</span></section>
      {learned ? <section className="rise-in stagger-1 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        <article className="card-lift relative overflow-hidden rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-6" data-testid="card-vocabulary-serendipity">
          <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-[hsl(var(--secondary)/.6)]" />
          <div className="relative flex items-start justify-between"><span className="rounded-full bg-[hsl(var(--muted))] px-2.5 py-1 font-mono text-[9px] font-bold uppercase tracking-[.13em] text-[hsl(var(--muted-foreground))]">noun</span><button type="button" onClick={onRemove} data-testid="button-remove-serendipity" className="rounded-lg p-1.5 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--destructive))]" aria-label="단어장에서 삭제"><X size={16} /></button></div>
           <p className="relative mt-8 text-3xl font-bold tracking-[-.06em]" data-testid="text-saved-serendipity">{content.word}</p><p className="relative mt-1 text-sm font-semibold text-[hsl(var(--accent))]">{content.shortMeaning}</p><p className="relative mt-5 border-l-2 border-[hsl(var(--accent)/.6)] pl-3 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{content.exampleSentence}</p>
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
      <section className="rise-in stagger-3 flex flex-col items-start justify-between gap-4 rounded-[24px] border border-[hsl(var(--border))] bg-[hsl(var(--secondary)/.45)] p-6 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><Sparkles size={20} className="mt-0.5 text-[hsl(var(--accent))]" /><div><p className="text-sm font-bold">회원님의 루프는 잘 돌아가고 있어요.</p><p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">오늘 10분을 채우면 이번 주 목표의 57%를 달성해요.</p></div></div><div className="flex flex-wrap items-center gap-4"><Link href="/report" data-testid="link-progress-report" className="flex shrink-0 items-center gap-2 text-xs font-bold text-[hsl(var(--accent))]">평가 리포트 <BarChart3 size={14} /></Link><Link href="/learn" data-testid="link-progress-practice" className="flex shrink-0 items-center gap-2 text-xs font-bold text-[hsl(var(--accent))]">오늘 연습하기 <ArrowRight size={14} /></Link></div></section>
    </div>
  );
}

function NotFound() {
  return <div className="flex min-h-[100dvh] items-center justify-center bg-[hsl(var(--background))] p-6 text-center"><div><p className="font-mono text-xs font-bold uppercase tracking-[.2em] text-[hsl(var(--accent))]">404 / loop lost</p><h1 className="mt-4 text-4xl font-bold">이 페이지는 아직 없어요.</h1><Link href="/" data-testid="link-not-found-home" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[hsl(var(--accent))]">오늘로 돌아가기 <ArrowRight size={16} /></Link></div></div>;
}

function RouterContent({ level, onLevelChange, learned, onStart, cardFlipped, setCardFlipped, quizAnswer, setQuizAnswer, onMarkLearned, listening, onListen, onRemove, metrics, onPassageProgress, content }: {
  level: Level; onLevelChange: (level: Level) => void; learned: boolean; onStart: (assignment?: Assignment) => Promise<void>; cardFlipped: boolean; setCardFlipped: (flipped: boolean) => void; quizAnswer: string | null; setQuizAnswer: (answer: string) => void; onMarkLearned: () => void; listening: boolean; onListen: () => void; onRemove: () => void; metrics: LearningMetrics; onPassageProgress: (evaluation: PassageEvaluation) => void; content: LearnContent;
}) {
  return <Switch>
    <Route path="/dashboard"><Home level={level} onLevelChange={onLevelChange} learned={learned} onStart={onStart} content={content} /></Route>
    <Route path="/learn"><Learn level={level} onLevelChange={onLevelChange} cardFlipped={cardFlipped} setCardFlipped={setCardFlipped} quizAnswer={quizAnswer} setQuizAnswer={setQuizAnswer} learned={learned} onMarkLearned={onMarkLearned} listening={listening} onListen={onListen} content={content} /></Route>
    <Route path="/passage"><PassagePractice onProgressChange={onPassageProgress} /></Route>
    <Route path="/vocabulary"><Vocabulary learned={learned} onRemove={onRemove} content={content} /></Route>
    <Route path="/progress"><Progress learned={learned} /></Route>
    <Route path="/report"><LearningReport level={level} metrics={metrics} /></Route>
    <Route path="/admin"><AdminUpload /></Route>
    <Route component={NotFound} />
  </Switch>;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <PublicLanding />
      </Show>
    </>
  );
}

function LearningPortal() {
  const [level, setLevel] = useState<Level>('Intermediate');
  const [learningContent, setLearningContent] = useState<LearnContent>(getDefaultLearningContent('Intermediate'));
  const [learned, setLearned] = useState(false);
  const [cardFlipped, setCardFlipped] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null);
  const [quizAttempts, setQuizAttempts] = useState(0);
  const [listening, setListening] = useState(false);
  const [hasListened, setHasListened] = useState(false);
  const [passageEvaluation, setPassageEvaluation] = useState<PassageEvaluation>(emptyPassageEvaluation);
  const [, setLocation] = useLocation();
  const handlePassageProgress = useCallback((evaluation: PassageEvaluation) => {
    setPassageEvaluation(evaluation);
  }, []);

  useEffect(() => {
    let controller: AbortController | null = null;
    setLearningContent(getDefaultLearningContent(level));

    const loadContent = () => {
      controller?.abort();
      controller = new AbortController();
      apiFetch(`/api/learning-content?level=${encodeURIComponent(level)}`, {
        credentials: 'include',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) return null;
          return response.json() as Promise<LearnContent>;
        })
        .then((content) => {
          if (content) setLearningContent(content);
        })
        .catch((error) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) {
            setLearningContent(getDefaultLearningContent(level));
          }
        });
    };

    const handleContentUpdate = (event: Event) => {
      const updated = (event as CustomEvent<LearningContent[]>).detail
        ?.find((item) => item.level === level);
      if (!updated) return;
      controller?.abort();
      setLearningContent(updated);
      setCardFlipped(false);
      setQuizAnswer(null);
      setQuizAttempts(0);
    };

    loadContent();
    window.addEventListener('focus', loadContent);
    window.addEventListener(LEARNING_CONTENT_UPDATED_EVENT, handleContentUpdate);

    return () => {
      controller?.abort();
      window.removeEventListener('focus', loadContent);
      window.removeEventListener(LEARNING_CONTENT_UPDATED_EVENT, handleContentUpdate);
    };
  }, [level]);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setTimeout(() => setListening(false), 1100);
    return () => window.clearTimeout(timer);
  }, [listening]);

  const startSession = async (assignment?: Assignment) => {
    if (assignment) {
      await prepareAssignmentPractice(assignment);
      setLocation('/passage');
      return;
    }

    setLocation('/learn');
    setCardFlipped(false);
    setQuizAnswer(null);
    setQuizAttempts(0);
  };

  const metrics: LearningMetrics = {
    cardFlipped,
    hasListened,
    learned,
    quizAnswer,
    quizAttempts,
    passage: passageEvaluation,
  };

  return (
    <>
      <Show when="signed-in">
        <ErrorBoundary>
          <Shell level={level} onLevelChange={setLevel}>
            <RouterContent
              level={level}
              onLevelChange={setLevel}
              learned={learned}
              onStart={startSession}
              cardFlipped={cardFlipped}
              setCardFlipped={setCardFlipped}
              quizAnswer={quizAnswer}
              setQuizAnswer={(answer) => {
                setQuizAnswer(answer);
                setQuizAttempts((attempts) => attempts + 1);
              }}
              onMarkLearned={() => { setLearned(true); setCardFlipped(true); }}
              listening={listening}
              onListen={() => {
                setListening(true);
                setHasListened(true);
              }}
              onRemove={() => setLearned(false)}
              metrics={metrics}
              onPassageProgress={handlePassageProgress}
               content={learningContent}
            />
          </Shell>
        </ErrorBoundary>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkApiAuthBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();

  useLayoutEffect(() => {
    setApiAuthTokenGetter(getToken);
    return () => setApiAuthTokenGetter(null);
  }, [getToken]);

  return children;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: '다시 만나서 반가워요',
            subtitle: '계정에 로그인하고 오늘의 학습을 이어가세요',
          },
        },
        signUp: {
          start: {
            title: '토스일곡아이들 시작하기',
            subtitle: '매일 10분의 영어 루프를 만들어보세요',
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <ClerkApiAuthBridge>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Switch>
              <Route path="/" component={HomeRedirect} />
              <Route path="/sign-in/*?" component={SignInPage} />
              <Route path="/sign-up/*?" component={SignUpPage} />
              <Route component={LearningPortal} />
            </Switch>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </ClerkApiAuthBridge>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;