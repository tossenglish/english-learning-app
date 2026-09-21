import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Headphones,
  Lightbulb,
  MessageCircle,
  Mic,
  PenLine,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { Link } from 'wouter';
import { readActivePracticeMaterial, type PracticeSentence } from '@/lib/practice-material';

type ExerciseMode = 'dictation' | 'writing' | 'shadowing';

type Completion = Record<ExerciseMode, boolean>;
type AttemptCounts = Record<ExerciseMode, number>;

export type PassageEvaluation = {
  completedSteps: number;
  totalSteps: number;
  dictationCompleted: number;
  writingCompleted: number;
  shadowingCompleted: number;
  wrongAttempts: number;
};

const defaultPassageSentences: PracticeSentence[] = [
  {
    id: 1,
    english: 'I stumbled upon a little café.',
    korean: '나는 작은 카페를 우연히 발견했어.',
    hint: '우연히 발견하다 = stumble upon',
  },
  {
    id: 2,
    english: 'It was tucked away on a quiet street.',
    korean: '그곳은 조용한 거리에 자리 잡고 있었어.',
    hint: '한적한 곳에 숨어 있다 = be tucked away',
  },
  {
    id: 3,
    english: 'The smell of fresh bread drew me inside.',
    korean: '갓 구운 빵 냄새가 나를 안으로 이끌었어.',
    hint: '누군가를 끌어들이다 = draw someone inside',
  },
  {
    id: 4,
    english: 'I ended up staying there all afternoon.',
    korean: '나는 결국 그곳에서 오후 내내 머물렀어.',
    hint: '결국 ~하게 되다 = end up -ing',
  },
];

const modes: Array<{
  id: ExerciseMode;
  label: string;
  description: string;
  icon: typeof Headphones;
}> = [
  {
    id: 'dictation',
    label: '받아쓰기',
    description: '소리를 듣고 적어요',
    icon: Headphones,
  },
  {
    id: 'writing',
    label: '영작',
    description: '뜻을 보고 문장을 만들어요',
    icon: PenLine,
  },
  {
    id: 'shadowing',
    label: '따라 말하기',
    description: '듣고 바로 따라 해요',
    icon: Mic,
  },
];

const blankCompletion = (): Completion => ({
  dictation: false,
  writing: false,
  shadowing: false,
});

const blankAnswers = (): Record<ExerciseMode, string> => ({
  dictation: '',
  writing: '',
  shadowing: '',
});

const blankAttempts = (): AttemptCounts => ({
  dictation: 0,
  writing: 0,
  shadowing: 0,
});

const DEFAULT_PASSAGE_TEXT = defaultPassageSentences.map((sentence) => sentence.english).join(' ');
const PASSAGE_STORAGE_KEY = 'lingoloop-passage-practice-v1';

type PersistedPassageState = {
  draftText: string;
  passageText: string;
  answers: Record<number, Record<ExerciseMode, string>>;
  completed: Record<number, Completion>;
  attempts: Record<number, AttemptCounts>;
  currentIndex: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStoredMap<T extends Record<string, string | number | boolean>>(
  value: unknown,
  createValue: () => T,
): Record<number, T> {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<number, T>>((result, [key, item]) => {
    const id = Number(key);
    if (Number.isInteger(id) && id > 0 && isRecord(item)) {
      result[id] = createValue();
      Object.keys(result[id]).forEach((field) => {
        if (field in item) {
          const storedValue = item[field];
          if (typeof storedValue === 'string' || typeof storedValue === 'number' || typeof storedValue === 'boolean') {
            (result[id] as Record<string, string | number | boolean>)[field] = storedValue;
          }
        }
      });
    }
    return result;
  }, {});
}

function readStoredPassageState(): PersistedPassageState {
  const fallback: PersistedPassageState = {
    draftText: DEFAULT_PASSAGE_TEXT,
    passageText: DEFAULT_PASSAGE_TEXT,
    answers: {},
    completed: {},
    attempts: {},
    currentIndex: 0,
  };

  if (typeof window === 'undefined') return fallback;

  try {
    const stored = window.localStorage.getItem(PASSAGE_STORAGE_KEY);
    if (!stored) return fallback;

    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed)) return fallback;

    const passageText = typeof parsed.passageText === 'string' && parsed.passageText.trim()
      ? parsed.passageText
      : fallback.passageText;
    const draftText = typeof parsed.draftText === 'string' ? parsed.draftText : passageText;
    const storedIndex = typeof parsed.currentIndex === 'number' && Number.isInteger(parsed.currentIndex)
      ? Math.max(0, parsed.currentIndex)
      : 0;

    return {
      draftText,
      passageText,
      answers: readStoredMap(parsed.answers, blankAnswers),
      completed: readStoredMap(parsed.completed, blankCompletion),
      attempts: readStoredMap(parsed.attempts, blankAttempts),
      currentIndex: storedIndex,
    };
  } catch {
    return fallback;
  }
}

function normalizePassage(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

const sentenceLeadingAbbreviation = /^(?:mr|mrs|ms|dr|prof|rev|gen|st|sr|jr|mt)\.$/i;

function splitIntoSentences(value: string) {
  const passage = value.replace(/\r\n?/g, '\n').trim();
  if (!passage) return [];

  let segments: string[] = [];
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    segments = Array.from(segmenter.segment(passage), ({ segment }) => segment.trim());
  } else {
    segments = passage.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g)?.map((segment) => segment.trim()) ?? [passage];
  }

  const mergedSegments = segments.reduce<string[]>((result, segment) => {
    const previous = result[result.length - 1];
    if (previous && sentenceLeadingAbbreviation.test(previous)) {
      result[result.length - 1] = `${previous} ${segment}`;
    } else {
      result.push(segment);
    }
    return result;
  }, []);

  return mergedSegments
    .flatMap((segment) => segment.split(/\n+/).map((line) => line.trim()))
    .filter(Boolean);
}

function buildPassageSentences(value: string): PracticeSentence[] {
  if (normalizePassage(value) === normalizePassage(DEFAULT_PASSAGE_TEXT)) {
    return defaultPassageSentences;
  }

  return splitIntoSentences(value).map((english, index) => ({
    id: index + 1,
    english,
    korean: '이 문장의 뜻을 떠올리며 영어로 다시 써보세요.',
    hint: '원문을 보지 않고 문장 구조를 떠올려보세요.',
  }));
}

function normalizeAnswer(value: string) {
  return value
    .toLowerCase()
    .replace(/[“”"'.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakSentence(sentence: string, onStart: () => void, onEnd: () => void) {
  if (!('speechSynthesis' in window)) {
    onEnd();
    return false;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(sentence);
  utterance.lang = 'en-US';
  utterance.rate = 0.82;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}

export default function PassagePractice({
  onProgressChange,
}: {
  onProgressChange?: (evaluation: PassageEvaluation) => void;
}) {
  const [initialState] = useState(readStoredPassageState);
  const activeMaterial = useMemo(() => readActivePracticeMaterial(), []);
  const hasSavedCustomPassage = normalizePassage(initialState.passageText) !== normalizePassage(DEFAULT_PASSAGE_TEXT);
  const [usingActiveMaterial, setUsingActiveMaterial] = useState(
    () => Boolean(activeMaterial),
  );
  const [draftText, setDraftText] = useState(
    () => activeMaterial?.sentences.map((sentence) => sentence.english).join(' ')
      ?? (hasSavedCustomPassage ? initialState.draftText : DEFAULT_PASSAGE_TEXT),
  );
  const [passageText, setPassageText] = useState(
    () => activeMaterial
      ? activeMaterial.sentences.map((sentence) => sentence.english).join(' ')
      : (hasSavedCustomPassage ? initialState.passageText : DEFAULT_PASSAGE_TEXT),
  );
  const [currentIndex, setCurrentIndex] = useState(
    () => activeMaterial ? 0 : (hasSavedCustomPassage ? initialState.currentIndex : 0),
  );
  const [mode, setMode] = useState<ExerciseMode>('dictation');
  const [answers, setAnswers] = useState<Record<number, Record<ExerciseMode, string>>>(
    () => activeMaterial ? {} : (hasSavedCustomPassage ? initialState.answers : {}),
  );
  const [completed, setCompleted] = useState<Record<number, Completion>>(
    () => activeMaterial ? {} : (hasSavedCustomPassage ? initialState.completed : {}),
  );
  const [attempts, setAttempts] = useState<Record<number, AttemptCounts>>(
    () => activeMaterial ? {} : (hasSavedCustomPassage ? initialState.attempts : {}),
  );
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'hint' | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const parsedPassageSentences = useMemo(() => buildPassageSentences(passageText), [passageText]);
  const passageSentences = usingActiveMaterial && activeMaterial
    ? activeMaterial.sentences
    : parsedPassageSentences;

  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, passageSentences.length - 1));
  const current = passageSentences[safeCurrentIndex] ?? passageSentences[0];
  const currentAnswers = answers[current.id] ?? blankAnswers();
  const currentCompletion = completed[current.id] ?? blankCompletion();
  const completedSteps = passageSentences.reduce(
    (total, sentence) => total + Object.values(completed[sentence.id] ?? blankCompletion()).filter(Boolean).length,
    0,
  );
  const allCompleted = passageSentences.length > 0 && completedSteps === passageSentences.length * modes.length;
  const sentenceCompleted = modes.every((item) => currentCompletion[item.id]);
  const isDefaultPassage = !usingActiveMaterial && normalizePassage(passageText) === normalizePassage(DEFAULT_PASSAGE_TEXT);

  const currentMode = useMemo(
    () => modes.find((item) => item.id === mode) ?? modes[0],
    [mode],
  );

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  useEffect(() => {
    const byMode = {
      dictation: 0,
      writing: 0,
      shadowing: 0,
    };
    let totalAnswerAttempts = 0;

    for (const sentence of passageSentences) {
      const progress = completed[sentence.id] ?? blankCompletion();
      const sentenceAttempts = attempts[sentence.id] ?? blankAttempts();
      for (const exerciseMode of modes) {
        if (progress[exerciseMode.id]) byMode[exerciseMode.id] += 1;
      }
      totalAnswerAttempts += sentenceAttempts.dictation + sentenceAttempts.writing;
    }

    onProgressChange?.({
      completedSteps,
      totalSteps: passageSentences.length * modes.length,
      dictationCompleted: byMode.dictation,
      writingCompleted: byMode.writing,
      shadowingCompleted: byMode.shadowing,
      wrongAttempts: Math.max(
        0,
        totalAnswerAttempts - byMode.dictation - byMode.writing,
      ),
    });
  }, [attempts, completed, completedSteps, onProgressChange, passageSentences]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PASSAGE_STORAGE_KEY, JSON.stringify({
        draftText,
        passageText,
        answers,
        completed,
        attempts,
        currentIndex: safeCurrentIndex,
      }));
    } catch {
      // Learning still works if browser storage is unavailable.
    }
  }, [answers, attempts, completed, draftText, passageText, safeCurrentIndex]);

  const updateAnswer = (value: string) => {
    setAnswers((previous) => ({
      ...previous,
      [current.id]: {
        ...(previous[current.id] ?? blankAnswers()),
        [mode]: value,
      },
    }));
    setFeedback(null);
    setShowAnswer(false);
  };

  const applyPassage = (value: string) => {
    const nextText = value.trim();
    if (!nextText) {
      setEditorError('연습할 영어 지문을 먼저 붙여 넣어주세요.');
      return;
    }

    if (splitIntoSentences(nextText).length === 0) {
      setEditorError('문장으로 나눌 수 있는 지문을 입력해주세요.');
      return;
    }

    const passageChanged = normalizePassage(nextText) !== normalizePassage(passageText)
      || usingActiveMaterial;
    setUsingActiveMaterial(false);
    setDraftText(nextText);
    setPassageText(nextText);
    setEditorError(null);
    setFeedback(null);
    setShowAnswer(false);
    setMode('dictation');

    if (passageChanged) {
      setAnswers({});
      setCompleted({});
      setAttempts({});
      setCurrentIndex(0);
    } else {
      setCurrentIndex((index) => Math.min(index, Math.max(0, buildPassageSentences(nextText).length - 1)));
    }
  };

  const markComplete = () => {
    setCompleted((previous) => ({
      ...previous,
      [current.id]: {
        ...(previous[current.id] ?? blankCompletion()),
        [mode]: true,
      },
    }));
    setFeedback('correct');
  };

  const checkAnswer = () => {
    setAttempts((previous) => ({
      ...previous,
      [current.id]: {
        ...(previous[current.id] ?? blankAttempts()),
        [mode]: (previous[current.id]?.[mode] ?? 0) + 1,
      },
    }));

    if (mode === 'shadowing') {
      markComplete();
      return;
    }

    if (normalizeAnswer(currentAnswers[mode]) === normalizeAnswer(current.english)) {
      markComplete();
    } else {
      setFeedback('wrong');
      setShowAnswer(true);
    }
  };

  const listen = () => {
    if (!('speechSynthesis' in window)) {
      setFeedback('hint');
      return;
    }
    speakSentence(current.english, () => setSpeaking(true), () => setSpeaking(false));
  };

  const selectMode = (nextMode: ExerciseMode) => {
    setMode(nextMode);
    setFeedback(null);
    setShowAnswer(false);
  };

  const selectSentence = (index: number) => {
    setCurrentIndex(index);
    setFeedback(null);
    setShowAnswer(false);
  };

  const nextSentence = () => {
    if (!sentenceCompleted) {
      setFeedback('hint');
      return;
    }
    if (safeCurrentIndex < passageSentences.length - 1) {
      setCurrentIndex((index) => index + 1);
      setMode('dictation');
      setFeedback(null);
      setShowAnswer(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1120px] space-y-8">
      <section className="rise-in flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Link
            href="/learn"
            data-testid="link-back-to-learn"
            className="mb-5 inline-flex items-center gap-2 text-xs font-bold text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--accent))]"
          >
            <ArrowLeft size={14} /> 오늘의 단어로 돌아가기
          </Link>
          <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">
            Sentence studio
          </p>
          <h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl" data-testid="text-passage-title">
            {usingActiveMaterial && activeMaterial ? activeMaterial.title : '지문의 모든 문장을'}<br className="sm:hidden" /> Let&apos;s do it.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            한 문장씩 듣고, 적고, 말해보세요. 세 가지 연습을 모두 끝내면 다음 문장이 열려요.
          </p>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] px-4 py-3">
          <div className="flex items-center justify-between gap-8">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">전체 진행률</span>
            <span className="font-mono text-sm font-bold text-[hsl(var(--foreground))]" data-testid="text-passage-progress">
              {completedSteps}/{passageSentences.length * modes.length}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
            <div
              className="h-full rounded-full bg-[hsl(var(--accent))] transition-all duration-500"
              style={{ width: `${(completedSteps / (passageSentences.length * modes.length)) * 100}%` }}
              data-testid="progress-passage"
            />
          </div>
        </div>
      </section>

      <section className="rise-in stagger-1 rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.78)] p-5 sm:p-7" data-testid="section-passage-input">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
              <ClipboardPaste size={19} />
            </span>
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--accent))]">Make it yours</p>
              <h2 className="mt-1 text-lg font-bold">연습할 영어 지문을 붙여 넣어보세요.</h2>
              <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                학원 자료나 뉴스처럼 원하는 글을 넣으면 문장별 연습으로 바꿔드려요.
              </p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[hsl(var(--muted))] px-3 py-1.5 text-[10px] font-bold text-[hsl(var(--muted-foreground))]">
            {passageSentences.length}문장으로 연습 중
          </span>
        </div>

        <label htmlFor="passage-text-input" className="sr-only">영어 지문</label>
        <textarea
          id="passage-text-input"
          value={draftText}
          onChange={(event) => {
            setDraftText(event.target.value);
            setEditorError(null);
          }}
          data-testid="textarea-passage-input"
          className="mt-5 min-h-[150px] w-full resize-y rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--background)/.65)] px-4 py-3.5 text-sm leading-relaxed text-[hsl(var(--foreground))] outline-none transition-colors placeholder:text-[hsl(var(--muted-foreground)/.7)] focus:border-[hsl(var(--accent))] focus:ring-2 focus:ring-[hsl(var(--accent)/.15)]"
          placeholder="예: I started my day with a quiet walk. The fresh air helped me think."
          spellCheck="true"
        />
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[11px] text-[hsl(var(--muted-foreground))]">
            <Sparkles size={13} className="text-[hsl(var(--accent))]" />
            마침표, 물음표, 느낌표를 기준으로 문장을 나눠요.
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <span className="mr-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{draftText.length.toLocaleString()}자</span>
            <button
              type="button"
              onClick={() => {
                setDraftText(DEFAULT_PASSAGE_TEXT);
                setEditorError(null);
              }}
              data-testid="button-load-example-passage"
              className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2.5 text-xs font-bold text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--accent)/.6)]"
            >
              예시 지문
            </button>
            <button
              type="button"
              onClick={() => applyPassage(draftText)}
              data-testid="button-apply-passage"
              className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))]"
            >
              이 지문으로 연습하기 <ArrowRight size={14} />
            </button>
          </div>
        </div>
        {editorError && (
          <p className="mt-3 rounded-xl bg-[hsl(var(--destructive)/.1)] px-3.5 py-3 text-xs font-semibold text-[hsl(var(--destructive))]" data-testid="status-passage-input-error">
            {editorError}
          </p>
        )}
      </section>

      <section className="rise-in stagger-1 grid gap-6 lg:grid-cols-[.72fr_1.28fr]">
        <aside className="rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.75)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">
                Today's passage
              </p>
              <h2 className="mt-2 text-lg font-bold">{usingActiveMaterial && activeMaterial ? activeMaterial.title : isDefaultPassage ? '작은 발견' : '내 지문'}</h2>
            </div>
            <MessageCircle size={19} className="text-[hsl(var(--accent))]" />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            {usingActiveMaterial && activeMaterial
              ? `업로드한 자료에서 ${passageSentences.length}개의 연습 문장을 불러왔어요.`
              : isDefaultPassage
                ? '작은 카페를 발견한 오후의 이야기예요.'
                : '내가 고른 지문을 문장별로 반복해서 연습해요.'}
          </p>

          <div className="mt-7 space-y-2">
            {passageSentences.map((sentence, index) => {
              const progress = completed[sentence.id] ?? blankCompletion();
              const count = Object.values(progress).filter(Boolean).length;
              const active = index === safeCurrentIndex;
              return (
                <button
                  key={sentence.id}
                  type="button"
                  onClick={() => selectSentence(index)}
                  data-testid={`button-passage-sentence-${sentence.id}`}
                  className={`w-full rounded-2xl border p-3 text-left transition-all ${
                    active
                      ? 'border-[hsl(var(--accent)/.55)] bg-[hsl(var(--secondary)/.7)]'
                      : 'border-transparent hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/.5)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      count === modes.length
                        ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                        : active
                          ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                          : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                    }`}>
                      {count === modes.length ? <Check size={14} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs font-semibold ${active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                        {sentence.english}
                      </span>
                      <span className="mt-1.5 block line-clamp-2 text-[11px] leading-relaxed text-[hsl(var(--foreground)/.72)]">
                        {sentence.korean}
                      </span>
                      <span className="mt-1 block text-[10px] text-[hsl(var(--muted-foreground))]">
                        {count}/{modes.length} 완료
                      </span>
                    </span>
                    {active && <ArrowRight size={14} className="shrink-0 text-[hsl(var(--accent))]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-2">
            {modes.map(({ id, label, description, icon: Icon }) => {
              const done = currentCompletion[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectMode(id)}
                  data-testid={`button-passage-mode-${id}`}
                  className={`flex min-w-[145px] flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all ${
                    mode === id
                      ? 'bg-[hsl(var(--sidebar))] text-[hsl(var(--sidebar-foreground))] shadow-sm'
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/.7)]'
                  }`}
                >
                  <Icon size={16} className={mode === id ? 'text-[hsl(var(--sidebar-primary))]' : ''} />
                  <span className="min-w-0">
                    <span className="block text-xs font-bold">{label}</span>
                    <span className={`mt-0.5 block text-[10px] ${mode === id ? 'text-[hsl(var(--sidebar-foreground)/.55)]' : 'text-[hsl(var(--muted-foreground)/.7)]'}`}>
                      {done ? '완료했어요' : description}
                    </span>
                  </span>
                  {done && <CheckCircle2 size={14} className="ml-auto shrink-0 text-[hsl(var(--accent))]" />}
                </button>
              );
            })}
          </div>

          <article className="rounded-[30px] bg-[hsl(var(--sidebar))] p-7 text-[hsl(var(--sidebar-foreground))] shadow-[var(--shadow-md)] sm:p-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">
                  Sentence {current.id} / {passageSentences.length}
                </p>
                <h2 className="mt-4 max-w-2xl text-2xl font-bold leading-tight tracking-[-.04em] sm:text-3xl" data-testid="text-current-passage-sentence">
                  {current.english}
                </h2>
                <div className="mt-4 border-l-2 border-[hsl(var(--sidebar-primary))] pl-3" data-testid="text-current-passage-meaning">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[hsl(var(--sidebar-primary))]">한글 해석</p>
                  <p className="mt-1.5 text-base font-semibold leading-relaxed text-[hsl(var(--sidebar-foreground)/.9)]">
                    {current.korean}
                  </p>
                </div>
              </div>
              <span className="rounded-full border border-[hsl(var(--sidebar-foreground)/.15)] px-3 py-1.5 font-mono text-[10px] text-[hsl(var(--sidebar-foreground)/.6)]">
                {currentMode.label}
              </span>
            </div>

            <div className="mt-8 rounded-2xl border border-[hsl(var(--sidebar-foreground)/.12)] bg-[hsl(var(--sidebar-accent)/.5)] p-4">
              {mode === 'dictation' && (
                <div>
                  <p className="text-xs text-[hsl(var(--sidebar-foreground)/.65)]">먼저 소리를 여러 번 들어보세요.</p>
                  <button
                    type="button"
                    onClick={listen}
                    data-testid="button-passage-listen-dictation"
                    className="button-pop mt-3 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--sidebar))]"
                  >
                    <Play size={14} fill="currentColor" /> {speaking ? '재생 중...' : '문장 듣기'}
                  </button>
                </div>
              )}
              {mode === 'writing' && (
                <div>
                  <p className="text-xs text-[hsl(var(--sidebar-foreground)/.65)]">
                    {isDefaultPassage
                      ? '한국어 뜻을 보고 영어 문장을 직접 만들어보세요.'
                      : '원문을 잠시 가리고 영어 문장을 직접 다시 만들어보세요.'}
                  </p>
                  <p className="mt-3 text-lg font-semibold text-[hsl(var(--sidebar-primary))]">{current.korean}</p>
                  <p className="mt-2 flex items-center gap-2 text-[11px] text-[hsl(var(--sidebar-foreground)/.45)]"><Lightbulb size={13} /> {current.hint}</p>
                </div>
              )}
              {mode === 'shadowing' && (
                <div>
                  <p className="text-xs text-[hsl(var(--sidebar-foreground)/.65)]">문장을 들은 뒤, 리듬을 따라 3번 소리 내어 읽어보세요.</p>
                  <button
                    type="button"
                    onClick={listen}
                    data-testid="button-passage-listen-shadowing"
                    className="button-pop mt-3 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--sidebar))]"
                  >
                    <Headphones size={14} /> {speaking ? '재생 중...' : '먼저 들어보기'}
                  </button>
                </div>
              )}
            </div>

            {mode !== 'shadowing' && (
              <div className="mt-5">
                <label htmlFor={`passage-answer-${current.id}`} className="sr-only">{currentMode.label} 답안</label>
                <input
                  id={`passage-answer-${current.id}`}
                  value={currentAnswers[mode]}
                  onChange={(event) => updateAnswer(event.target.value)}
                  onKeyDown={(event) => { if (event.key === 'Enter') checkAnswer(); }}
                  data-testid={`input-passage-${mode}`}
                  className="w-full rounded-2xl border border-[hsl(var(--sidebar-foreground)/.18)] bg-[hsl(var(--sidebar-accent)/.55)] px-4 py-4 text-sm text-[hsl(var(--sidebar-foreground))] outline-none transition-colors placeholder:text-[hsl(var(--sidebar-foreground)/.35)] focus:border-[hsl(var(--sidebar-primary))]"
                  placeholder={mode === 'dictation' ? '들은 문장을 영어로 적어보세요' : '영어 문장을 입력해보세요'}
                  autoComplete="off"
                />
              </div>
            )}

            {feedback && (
              <div className={`mt-4 flex items-start gap-2 rounded-xl px-3.5 py-3 text-xs font-semibold ${
                feedback === 'correct'
                  ? 'bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]'
                  : feedback === 'wrong'
                    ? 'bg-[hsl(var(--destructive)/.15)] text-[hsl(var(--sidebar-primary))]'
                    : 'bg-[hsl(var(--sidebar-foreground)/.08)] text-[hsl(var(--sidebar-foreground)/.75)]'
              }`} data-testid="status-passage-feedback">
                {feedback === 'correct' && <CheckCircle2 size={15} className="shrink-0" />}
                {feedback === 'wrong' && <RotateCcw size={15} className="shrink-0" />}
                <span>
                  {feedback === 'correct' && (mode === 'shadowing' ? '좋아요. 입으로 직접 말해본 문장이에요.' : '정확해요. 이 문장은 이제 내 것이 됐어요.')}
                  {feedback === 'wrong' && `조금 달라요. 정답을 확인하고 다시 한 번 써볼까요? ${showAnswer ? current.english : ''}`}
                  {feedback === 'hint' && (sentenceCompleted ? '세 가지 연습을 모두 끝냈어요. 다음 문장으로 가볼까요?' : '이 문장의 받아쓰기, 영작, 따라 말하기를 모두 끝내면 다음으로 갈 수 있어요.')}
                </span>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-[11px] text-[hsl(var(--sidebar-foreground)/.45)]">
                <Lightbulb size={13} /> 막히면 문장을 소리 내어 천천히 읽어보세요.
              </p>
              <div className="flex gap-2">
                {mode !== 'shadowing' && (
                  <button
                    type="button"
                    onClick={checkAnswer}
                    data-testid={`button-check-passage-${mode}`}
                    className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--sidebar))]"
                  >
                    <Check size={14} /> 확인하기
                  </button>
                )}
                {mode === 'shadowing' && (
                  <button
                    type="button"
                    onClick={checkAnswer}
                    data-testid="button-complete-shadowing"
                    className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--sidebar))]"
                  >
                    <Mic size={14} /> 따라 말했어요
                  </button>
                )}
              </div>
            </div>
          </article>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-[hsl(var(--muted-foreground))]">
              {sentenceCompleted ? '이 문장의 모든 연습을 완료했어요.' : `${currentMode.label}을 완료해보세요.`}
            </p>
            <button
              type="button"
              onClick={nextSentence}
              disabled={safeCurrentIndex === passageSentences.length - 1 && !allCompleted}
              data-testid="button-next-passage-sentence"
              className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {allCompleted ? '지문 연습 완료' : currentIndex === passageSentences.length - 1 ? '마지막 문장' : '다음 문장'} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {allCompleted && (
        <section className="rise-in rounded-[26px] border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--secondary)/.65)] p-6 text-center" data-testid="status-passage-complete">
          <CheckCircle2 className="mx-auto text-[hsl(var(--accent))]" size={28} />
          <h2 className="mt-3 text-xl font-bold">지문의 모든 문장을 완주했어요.</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">이제 문장들이 눈으로만 아는 영어가 아니라, 꺼내 쓸 수 있는 영어가 됐어요.</p>
        </section>
      )}
    </div>
  );
}