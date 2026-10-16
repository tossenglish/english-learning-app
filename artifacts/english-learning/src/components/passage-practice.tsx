import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardPaste,
  EyeOff,
  Headphones,
  Lightbulb,
  MessageCircle,
  Mic,
  PenLine,
  RotateCcw,
  Repeat2,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import { Link } from 'wouter';
import { apiFetch } from '@/lib/api-fetch';
import { playAnswerFeedbackSound } from '@/lib/feedback-sound';
import { readActivePracticeMaterial, type PracticeSentence } from '@/lib/practice-material';
import PersianCatFriends from '@/components/persian-cat-friends';

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

const wordModes: Array<{
  id: ExerciseMode;
  label: string;
  description: string;
  icon: typeof Headphones;
}> = [
  { id: 'dictation', label: '영어 퀴즈', description: '영어 단어의 뜻을 맞혀요', icon: CheckCircle2 },
  { id: 'writing', label: '단어 쓰기', description: '뜻을 보고 답하기', icon: PenLine },
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

const clozeStopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for',
  'from', 'had', 'has', 'have', 'he', 'her', 'him', 'his', 'i', 'in', 'is',
  'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'she', 'that', 'the',
  'their', 'them', 'they', 'this', 'to', 'us', 'was', 'we', 'were', 'will',
  'with', 'you', 'your',
]);

function buildCloze(english: string) {
  const matches = [...english.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*/g)];
  const contentWords = matches
    .map((match, index) => ({ word: match[0], index }))
    .filter(({ word }) => !clozeStopWords.has(word.toLowerCase()));
  const candidates = contentWords.length > 0
    ? contentWords
    : matches.map((match, index) => ({ word: match[0], index }));
  const blankCount = candidates.length > 1
    ? Math.min(candidates.length - 1, Math.ceil(candidates.length / 3))
    : candidates.length;
  const blankMatches = Array.from({ length: blankCount }, (_, index) => {
    const candidateIndex = Math.floor(((index + 1) * candidates.length) / (blankCount + 1));
    return candidates[candidateIndex];
  });
  const blankPositions = new Set(blankMatches.map(({ index }) => index));
  let wordIndex = 0;
  const prompt = english.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (word) => {
    const isBlank = blankPositions.has(wordIndex);
    wordIndex += 1;
    return isBlank ? '＿＿＿＿' : word;
  });

  return {
    prompt,
    answer: blankMatches.map(({ word }) => word).join(' '),
  };
}

function scrambleSentenceWords(sentence: string, sentenceId: number): string {
  const words = sentence.trim().split(/\s+/).filter(Boolean).map((word, id) => ({ word, id }));
  let seed = 2166136261;
  for (const character of `${sentenceId}:${sentence}`) {
    seed = Math.imul(seed ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  for (let index = words.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swapIndex = seed % (index + 1);
    [words[index], words[swapIndex]] = [words[swapIndex], words[index]];
  }
  if (words.length > 1 && words.every((word, index) => word.id === index)) {
    words.unshift(words.pop()!);
  }
  return words.map(({ word }) => word).join(' ');
}

function LetterBoxAnswer({
  answerTemplate,
  value,
  onChange,
  onSubmit,
  disabled,
  inputId,
}: {
  answerTemplate: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  inputId: string;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const templateChars = Array.from(answerTemplate);
  const valueChars = Array.from(value);
  const letterIndexes = templateChars.flatMap((character, index) => (
    /[a-z]/i.test(character) ? [index] : []
  ));
  const readLetters = () => letterIndexes.map((index) => (
    valueChars[index] && valueChars[index] !== '_' ? valueChars[index].toLowerCase() : ''
  ));
  const serializeLetters = (letters: string[]) => templateChars.map((character, index) => {
    if (!/[a-z]/i.test(character)) return character;
    const letterIndex = letterIndexes.indexOf(index);
    return letters[letterIndex] || '_';
  }).join('');

  const setLetter = (letterIndex: number, rawValue: string) => {
    const letter = rawValue.match(/[a-z]/i)?.[0]?.toLowerCase() ?? '';
    const letters = readLetters();
    letters[letterIndex] = letter;
    onChange(serializeLetters(letters));
    if (letter && letterIndex < letterIndexes.length - 1) {
      inputRefs.current[letterIndex + 1]?.focus();
    }
  };

  const pasteLetters = (letterIndex: number, pastedText: string) => {
    const pastedLetters = (pastedText.match(/[a-z]/gi) ?? []).map((letter) => letter.toLowerCase());
    if (!pastedLetters.length) return;
    const letters = readLetters();
    pastedLetters.forEach((letter, offset) => {
      if (letterIndex + offset < letters.length) letters[letterIndex + offset] = letter;
    });
    onChange(serializeLetters(letters));
    inputRefs.current[Math.min(letterIndex + pastedLetters.length, letters.length - 1)]?.focus();
  };

  if (letterIndexes.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="받아쓰기 철자 입력"
      data-testid="group-passage-dictation-letter-boxes"
      className="flex flex-wrap items-center gap-x-1.5 gap-y-2 rounded-2xl border border-[hsl(var(--sidebar-foreground)/.18)] bg-[hsl(var(--sidebar-accent)/.55)] p-4 sm:gap-x-2 sm:p-5"
    >
      {templateChars.map((character, index) => {
        if (/\s/.test(character)) {
          return <span key={`space-${index}`} aria-hidden="true" className="w-2 sm:w-3" />;
        }
        const letterIndex = letterIndexes.indexOf(index);
        if (letterIndex < 0) {
          return <span key={`punctuation-${index}`} aria-hidden="true" className="px-0.5 text-lg font-semibold text-[hsl(var(--sidebar-foreground)/.7)]">{character}</span>;
        }
        const typedLetter = readLetters()[letterIndex] ?? '';
        return (
          <input
            key={`letter-${index}`}
            ref={(element) => { inputRefs.current[letterIndex] = element; }}
            id={letterIndex === 0 ? inputId : `${inputId}-${letterIndex + 1}`}
            type="text"
            value={typedLetter}
            onChange={(event) => setLetter(letterIndex, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                onSubmit();
              } else if (event.key === 'Backspace' && !typedLetter && letterIndex > 0) {
                event.preventDefault();
                inputRefs.current[letterIndex - 1]?.focus();
              } else if (event.key === 'ArrowLeft' && letterIndex > 0) {
                event.preventDefault();
                inputRefs.current[letterIndex - 1]?.focus();
              } else if (event.key === 'ArrowRight' && letterIndex < letterIndexes.length - 1) {
                event.preventDefault();
                inputRefs.current[letterIndex + 1]?.focus();
              }
            }}
            onPaste={(event) => {
              event.preventDefault();
              pasteLetters(letterIndex, event.clipboardData.getData('text'));
            }}
            disabled={disabled}
            maxLength={1}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-label={`철자 ${letterIndex + 1}`}
            data-testid={letterIndex === 0 ? 'input-passage-dictation' : `input-dictation-letter-${letterIndex + 1}`}
            className="h-11 w-9 rounded-lg border border-[hsl(var(--sidebar-foreground)/.22)] bg-[hsl(var(--sidebar))] text-center font-mono text-lg font-bold text-[hsl(var(--sidebar-foreground))] outline-none transition-colors focus:border-[hsl(var(--sidebar-primary))] focus:ring-2 focus:ring-[hsl(var(--sidebar-primary)/.25)] disabled:opacity-50 sm:h-12 sm:w-10"
          />
        );
      })}
    </div>
  );
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
  const displayedActiveMaterialTitle = activeMaterial?.title
    .replace(/^\s*1(?:\s*[.):\-]\s*|\s+|$)/, '')
    .trim() ?? '';
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
  const [showPassageEditor, setShowPassageEditor] = useState(false);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | 'hint' | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [dictationRepeating, setDictationRepeating] = useState(false);
  const [isWordAutoAdvancing, setIsWordAutoAdvancing] = useState(false);
  const [passageListening, setPassageListening] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [assignmentProgressSaveError, setAssignmentProgressSaveError] = useState('');
  const passageFileInputRef = useRef<HTMLInputElement>(null);
  const wordAnswerInputRef = useRef<HTMLInputElement>(null);
  const focusWordAnswerAfterAdvanceRef = useRef(false);
  const speechLoopRef = useRef(false);
  const speechGenerationRef = useRef(0);
  const speechTimerRef = useRef<number | null>(null);
  const wordAdvanceTimerRef = useRef<number | null>(null);
  const modeAdvanceTimerRef = useRef<number | null>(null);
  const parsedPassageSentences = useMemo(() => buildPassageSentences(passageText), [passageText]);
  const passageSentences = usingActiveMaterial && activeMaterial
    ? activeMaterial.sentences
    : parsedPassageSentences;
  const isWordMaterial = usingActiveMaterial && activeMaterial?.materialType === 'word';
  const availableModes = isWordMaterial ? wordModes : modes;

  const safeCurrentIndex = Math.min(currentIndex, Math.max(0, passageSentences.length - 1));
  const hasNextWord = passageSentences.length > 0 && safeCurrentIndex < passageSentences.length - 1;
  const current = passageSentences[safeCurrentIndex] ?? passageSentences[0];
  const currentCloze = useMemo(
    () => buildCloze(current?.english ?? ''),
    [current?.english],
  );
  const scrambledSentence = useMemo(
    () => scrambleSentenceWords(current?.english ?? '', current?.id ?? 0),
    [current?.english, current?.id],
  );
  const currentAnswers = answers[current.id] ?? blankAnswers();
  const currentCompletion = completed[current.id] ?? blankCompletion();
  const wordQuizOptions = useMemo(() => {
    const meanings = [...new Set(passageSentences.map((sentence) => sentence.korean.trim()).filter(Boolean))];
    const options = [current?.korean, ...meanings.filter((meaning) => meaning !== current?.korean)]
      .filter((meaning): meaning is string => Boolean(meaning))
      .slice(0, 4);
    if (options.length > 1 && current?.id) {
      const correctIndex = current.id % options.length;
      const answerIndex = options.indexOf(current.korean);
      if (answerIndex !== correctIndex) {
        [options[answerIndex], options[correctIndex]] = [options[correctIndex], options[answerIndex]];
      }
    }
    return options;
  }, [current?.id, current?.korean, passageSentences]);
  const totalProgressSteps = passageSentences.length * (isWordMaterial ? wordModes.length : modes.length);
  const completedSteps = passageSentences.reduce((total, sentence) => {
    const sentenceProgress = completed[sentence.id] ?? blankCompletion();
    return total + (isWordMaterial
      ? wordModes.filter(({ id }) => sentenceProgress[id]).length
      : Object.values(sentenceProgress).filter(Boolean).length);
  }, 0);
  const allCompleted = passageSentences.length > 0 && completedSteps === totalProgressSteps;
  const sentenceCompleted = isWordMaterial
    ? wordModes.every(({ id }) => currentCompletion[id])
    : modes.every((item) => currentCompletion[item.id]);
  const canAdvance = sentenceCompleted || (isWordMaterial && feedback === 'correct');
  const isDefaultPassage = !usingActiveMaterial && normalizePassage(passageText) === normalizePassage(DEFAULT_PASSAGE_TEXT);
  const isAnswerMode = mode === 'dictation' || mode === 'writing';

  const currentMode = useMemo(
    () => availableModes.find((item) => item.id === mode) ?? availableModes[0],
    [availableModes, mode],
  );
  const currentModeFinished = isWordMaterial
    && passageSentences.length > 0
    && passageSentences.every((sentence) => completed[sentence.id]?.[mode]);
  const nextUnfinishedWordMode = wordModes.find(({ id }) =>
    !passageSentences.every((sentence) => completed[sentence.id]?.[id]),
  );
  const expectedAnswer = isWordMaterial
    ? mode === 'writing' ? current.english : current.korean
    : mode === 'writing' ? current.english : currentCloze.answer;
  const hidePassageText = isWordMaterial
    ? mode === 'writing' && !showAnswer
    : isAnswerMode && !showPassageEditor;
  const shouldShowMeaning = !isWordMaterial || mode === 'writing' || feedback === 'correct' || showAnswer;

  useEffect(() => {
    if (
      isWordAutoAdvancing
      || !focusWordAnswerAfterAdvanceRef.current
      || !isWordMaterial
      || mode !== 'writing'
    ) return;
    focusWordAnswerAfterAdvanceRef.current = false;
    wordAnswerInputRef.current?.focus({ preventScroll: true });
  }, [currentIndex, isWordAutoAdvancing, isWordMaterial, mode]);

  const stopSpeech = () => {
    speechLoopRef.current = false;
    speechGenerationRef.current += 1;
    if (speechTimerRef.current !== null) {
      window.clearTimeout(speechTimerRef.current);
      speechTimerRef.current = null;
    }
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setDictationRepeating(false);
    setPassageListening(false);
  };

  const startDictationRepeat = (sentence: string) => {
    speechLoopRef.current = true;
    const generation = speechGenerationRef.current + 1;
    speechGenerationRef.current = generation;
    setDictationRepeating(true);

    const playNext = () => {
      if (!speechLoopRef.current || speechGenerationRef.current !== generation) return;

      speakSentence(
        sentence,
        () => setSpeaking(true),
        () => {
          setSpeaking(false);
          if (!speechLoopRef.current || speechGenerationRef.current !== generation) return;
          speechTimerRef.current = window.setTimeout(() => {
            speechTimerRef.current = null;
            playNext();
          }, 350);
        },
      );
    };

    playNext();
  };

  useEffect(() => () => {
    speechLoopRef.current = false;
    speechGenerationRef.current += 1;
    if (speechTimerRef.current !== null) window.clearTimeout(speechTimerRef.current);
    if (wordAdvanceTimerRef.current !== null) window.clearTimeout(wordAdvanceTimerRef.current);
    if (modeAdvanceTimerRef.current !== null) window.clearTimeout(modeAdvanceTimerRef.current);
    window.speechSynthesis?.cancel();
  }, []);

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
      totalSteps: totalProgressSteps,
      dictationCompleted: byMode.dictation,
      writingCompleted: byMode.writing,
      shadowingCompleted: byMode.shadowing,
      wrongAttempts: Math.max(
        0,
        totalAnswerAttempts - byMode.dictation - byMode.writing,
      ),
    });
  }, [attempts, completed, completedSteps, onProgressChange, passageSentences, totalProgressSteps]);

  useEffect(() => {
    if (!activeMaterial) return;
    apiFetch(`/api/assignments/${activeMaterial.assignmentId}/progress`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completedSteps, totalSteps: totalProgressSteps }),
    })
      .then((response) => {
        if (!response.ok) throw new Error('과제 진행률 저장에 실패했습니다.');
        setAssignmentProgressSaveError('');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAssignmentProgressSaveError('과제 수행률을 저장하지 못했어요. 연결 상태를 확인해 주세요.');
      });
  }, [activeMaterial, completedSteps, totalProgressSteps]);

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
    if (modeAdvanceTimerRef.current !== null) {
      window.clearTimeout(modeAdvanceTimerRef.current);
      modeAdvanceTimerRef.current = null;
    }
    setAnswers((previous) => ({
      ...previous,
      [current.id]: {
        ...(previous[current.id] ?? blankAnswers()),
        [mode]: value,
      },
    }));
    if (currentCompletion[mode] && currentAnswers[mode] !== value) {
      setCompleted((previous) => ({
        ...previous,
        [current.id]: {
          ...(previous[current.id] ?? blankCompletion()),
          [mode]: false,
        },
      }));
    }
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
    if (modeAdvanceTimerRef.current !== null) {
      window.clearTimeout(modeAdvanceTimerRef.current);
      modeAdvanceTimerRef.current = null;
    }
    stopSpeech();
    setUsingActiveMaterial(false);
    setDraftText(nextText);
    setPassageText(nextText);
    setEditorError(null);
    setFeedback(null);
    setShowAnswer(false);
    setShowPassageEditor(false);
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

  const importPassageFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name)) {
      setEditorError('TXT, Markdown 또는 CSV 지문 파일을 선택해주세요.');
      return;
    }

    try {
      const contents = await file.text();
      if (!contents.trim()) {
        setEditorError('선택한 파일에 지문 내용이 없습니다.');
        return;
      }
      setDraftText(contents);
      applyPassage(contents);
    } catch {
      setEditorError('파일을 읽지 못했습니다. 파일을 다시 선택해주세요.');
    }
  };

  const markComplete = () => {
    stopSpeech();
    setCompleted((previous) => ({
      ...previous,
      [current.id]: {
        ...(previous[current.id] ?? blankCompletion()),
        [mode]: true,
      },
    }));
    setFeedback('correct');
  };

  const advanceToNextSentenceMode = () => {
    if (isWordMaterial || (mode !== 'dictation' && mode !== 'writing')) return;
    const nextMode: ExerciseMode = mode === 'dictation' ? 'writing' : 'shadowing';
    if (modeAdvanceTimerRef.current !== null) window.clearTimeout(modeAdvanceTimerRef.current);
    modeAdvanceTimerRef.current = window.setTimeout(() => {
      modeAdvanceTimerRef.current = null;
      setMode(nextMode);
      setFeedback(null);
      setShowAnswer(false);
    }, 750);
  };

  const advanceToNextWordAutomatically = () => {
    if (!isWordMaterial) return;
    focusWordAnswerAfterAdvanceRef.current = mode === 'writing' && hasNextWord;
    setIsWordAutoAdvancing(true);
    const advance = () => {
      wordAdvanceTimerRef.current = null;
      if (hasNextWord) {
        setCurrentIndex((index) => Math.min(index + 1, passageSentences.length - 1));
        setFeedback(null);
        setShowAnswer(false);
      }
      setIsWordAutoAdvancing(false);
    };
    const scheduleAdvance = (delay: number) => {
      if (wordAdvanceTimerRef.current !== null) return;
      wordAdvanceTimerRef.current = window.setTimeout(advance, delay);
    };

    const pronunciationGeneration = speechGenerationRef.current;
    let pronunciationEnded = false;
    const finishPronunciation = () => {
      if (pronunciationEnded || speechGenerationRef.current !== pronunciationGeneration) return;
      pronunciationEnded = true;
      setSpeaking(false);
      if (hasNextWord) scheduleAdvance(250);
      else setIsWordAutoAdvancing(false);
    };
    try {
      speakSentence(
        current.english,
        () => {
          if (speechGenerationRef.current === pronunciationGeneration) setSpeaking(true);
        },
        finishPronunciation,
      );
    } catch {
      finishPronunciation();
    }
  };

  const checkAnswer = (answerOverride?: string) => {
    if (isWordAutoAdvancing) return;
    setAttempts((previous) => ({
      ...previous,
      [current.id]: {
        ...(previous[current.id] ?? blankAttempts()),
        [mode]: (previous[current.id]?.[mode] ?? 0) + 1,
      },
    }));

    if (mode === 'shadowing') {
      markComplete();
      void playAnswerFeedbackSound(true);
      return;
    }

    if (normalizeAnswer(answerOverride ?? currentAnswers[mode]) === normalizeAnswer(expectedAnswer)) {
      markComplete();
      if (isWordMaterial) {
        setIsWordAutoAdvancing(true);
        void playAnswerFeedbackSound(true).then(advanceToNextWordAutomatically);
      } else {
        void playAnswerFeedbackSound(true);
        advanceToNextSentenceMode();
      }
    } else {
      void playAnswerFeedbackSound(false);
      setFeedback('wrong');
      setShowAnswer(true);
    }
  };

  const listen = () => {
    if (!('speechSynthesis' in window)) {
      setFeedback('hint');
      return;
    }
    if (mode === 'dictation') {
      if (dictationRepeating) {
        stopSpeech();
      } else {
        startDictationRepeat(current.english);
      }
      return;
    }
    stopSpeech();
    speakSentence(current.english, () => setSpeaking(true), () => setSpeaking(false));
  };

  const listenToFullPassage = () => {
    if (passageListening) {
      stopSpeech();
      return;
    }
    if (!('speechSynthesis' in window)) {
      setFeedback('hint');
      return;
    }

    stopSpeech();
    const generation = speechGenerationRef.current;
    let sentenceIndex = 0;
    setPassageListening(true);

    const playNextSentence = () => {
      if (speechGenerationRef.current !== generation) return;
      const sentence = passageSentences[sentenceIndex];
      if (!sentence) {
        setSpeaking(false);
        setPassageListening(false);
        return;
      }

      speakSentence(
        sentence.english,
        () => setSpeaking(true),
        () => {
          if (speechGenerationRef.current !== generation) return;
          setSpeaking(false);
          sentenceIndex += 1;
          if (sentenceIndex >= passageSentences.length) {
            setPassageListening(false);
            return;
          }
          speechTimerRef.current = window.setTimeout(() => {
            speechTimerRef.current = null;
            playNextSentence();
          }, 450);
        },
      );
    };

    playNextSentence();
  };

  const selectMode = (nextMode: ExerciseMode) => {
    const switchingWordModes = isWordMaterial && nextMode !== mode;
    if (switchingWordModes) setCurrentIndex(0);
    if (modeAdvanceTimerRef.current !== null) {
      window.clearTimeout(modeAdvanceTimerRef.current);
      modeAdvanceTimerRef.current = null;
    }
    focusWordAnswerAfterAdvanceRef.current = switchingWordModes && nextMode === 'writing';
    if (wordAdvanceTimerRef.current !== null) {
      window.clearTimeout(wordAdvanceTimerRef.current);
      wordAdvanceTimerRef.current = null;
      setIsWordAutoAdvancing(false);
    }
    stopSpeech();
    setMode(nextMode);
    if (nextMode !== 'shadowing') setShowPassageEditor(false);
    setFeedback(null);
    setShowAnswer(false);
  };

  const selectSentence = (index: number) => {
    if (modeAdvanceTimerRef.current !== null) {
      window.clearTimeout(modeAdvanceTimerRef.current);
      modeAdvanceTimerRef.current = null;
    }
    focusWordAnswerAfterAdvanceRef.current = false;
    if (wordAdvanceTimerRef.current !== null) {
      window.clearTimeout(wordAdvanceTimerRef.current);
      wordAdvanceTimerRef.current = null;
      setIsWordAutoAdvancing(false);
    }
    stopSpeech();
    setCurrentIndex(index);
    setFeedback(null);
    setShowAnswer(false);
  };

  const nextSentence = () => {
    if (!canAdvance) {
      setFeedback('hint');
      return;
    }
    stopSpeech();
    if (safeCurrentIndex < passageSentences.length - 1) {
      setCurrentIndex((index) => index + 1);
      if (!isWordMaterial) setMode('dictation');
      setFeedback(null);
      setShowAnswer(false);
    }
  };

  return (
    <div className="mx-auto max-w-[1360px] space-y-8">
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
            {isWordMaterial ? 'Word quiz' : 'Sentence studio'}
          </p>
          <h1 className="text-3xl font-bold tracking-[-.05em] sm:text-4xl" data-testid="text-passage-title">
            {usingActiveMaterial && displayedActiveMaterialTitle ? displayedActiveMaterialTitle : '지문의 모든 문장을'}<br className="sm:hidden" /> Let&apos;s do it.
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            {isWordMaterial
              ? '영어 퀴즈와 단어 쓰기를 각각 처음부터 끝까지 완료해요.'
              : '한 문장씩 듣고, 적고, 말해보세요. 세 가지 연습을 모두 끝내면 다음 문장이 열려요.'}
          </p>
        </div>
        <div className="rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] px-4 py-3">
          <div className="flex items-center justify-between gap-8">
            <span className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">전체 진행률</span>
            <span className="font-mono text-sm font-bold text-[hsl(var(--foreground))]" data-testid="text-passage-progress">
              {completedSteps}/{totalProgressSteps}
            </span>
          </div>
          <div className="mt-2 h-1.5 w-44 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
            <div
              className="h-full rounded-full bg-[hsl(var(--accent))] transition-all duration-500"
              style={{ width: `${(completedSteps / totalProgressSteps) * 100}%` }}
              data-testid="progress-passage"
            />
          </div>
          {assignmentProgressSaveError && (
            <p className="mt-2 max-w-44 text-[10px] leading-relaxed text-[hsl(var(--destructive))]" role="alert">
              {assignmentProgressSaveError}
            </p>
          )}
        </div>
        <PersianCatFriends variant="practice" />
      </section>

      {!isWordMaterial && <section className="rise-in stagger-1 rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.78)] p-5 sm:p-7" data-testid="section-passage-input">
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
        <input
          ref={passageFileInputRef}
          type="file"
          accept=".txt,.md,.csv,text/plain,text/markdown,text/csv"
          className="sr-only"
          aria-label="TXT, Markdown 또는 CSV 지문 파일 선택"
          data-testid="input-passage-file"
          onChange={(event) => {
            void importPassageFile(event.currentTarget.files?.[0] ?? null);
            event.currentTarget.value = '';
          }}
        />
        {hidePassageText ? (
          <div className="mt-5 flex min-h-[150px] flex-col justify-between gap-4 rounded-2xl border border-dashed border-[hsl(var(--border))] bg-[hsl(var(--muted)/.35)] p-5 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]">
                <EyeOff size={18} />
              </span>
              <div>
                <p className="text-sm font-bold">연습 중에는 지문을 숨겨두었어요.</p>
                <p className="mt-1 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
                  소리를 듣거나 한글 뜻만 보고 답을 떠올려보세요.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                type="button"
                onClick={() => passageFileInputRef.current?.click()}
                data-testid="button-import-passage-file"
                className="inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-3.5 py-2.5 text-xs font-bold text-[hsl(var(--primary-foreground))] transition-colors"
              >
                <Upload size={14} /> 파일 불러오기
              </button>
              <button
                type="button"
                onClick={() => setShowPassageEditor(true)}
                data-testid="button-show-passage-editor"
                className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2.5 text-xs font-bold text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--accent)/.6)]"
              >
                붙여넣기·편집
              </button>
            </div>
          </div>
        ) : (
          <>
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
                  onClick={() => passageFileInputRef.current?.click()}
                  data-testid="button-import-passage-file"
                  className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2.5 text-xs font-bold text-[hsl(var(--foreground))] transition-colors hover:border-[hsl(var(--accent)/.6)]"
                >
                  <Upload size={14} /> 파일 불러오기
                </button>
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
                {isAnswerMode && (
                  <button
                    type="button"
                    onClick={() => setShowPassageEditor(false)}
                    data-testid="button-hide-passage-editor"
                    className="rounded-xl border border-[hsl(var(--border))] px-3.5 py-2.5 text-xs font-bold text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--accent)/.6)] hover:text-[hsl(var(--foreground))]"
                  >
                    지문 숨기기
                  </button>
                )}
              </div>
            </div>
          </>
        )}
        {editorError && (
          <p className="mt-3 rounded-xl bg-[hsl(var(--destructive)/.1)] px-3.5 py-3 text-xs font-semibold text-[hsl(var(--destructive))]" data-testid="status-passage-input-error">
            {editorError}
          </p>
        )}
      </section>}

      <section className={`rise-in stagger-1 grid gap-6 ${isWordMaterial ? 'lg:grid-cols-1' : 'lg:grid-cols-[minmax(230px,.48fr)_minmax(0,1.52fr)]'}`}>
        {!isWordMaterial && <aside className="min-w-0 rounded-[26px] border border-[hsl(var(--border))] bg-[hsl(var(--card)/.75)] p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--muted-foreground))]">
                Today's passage
              </p>
              <h2 className="mt-2 text-lg font-bold">{usingActiveMaterial && displayedActiveMaterialTitle ? displayedActiveMaterialTitle : isDefaultPassage ? '작은 발견' : '내 지문'}</h2>
            </div>
            <MessageCircle size={19} className="text-[hsl(var(--accent))]" />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            {usingActiveMaterial && activeMaterial
              ? `업로드한 자료에서 ${passageSentences.length}개의 연습 ${isWordMaterial ? '단어' : '문장'}을 불러왔어요.`
              : isDefaultPassage
                ? '작은 카페를 발견한 오후의 이야기예요.'
                : '내가 고른 지문을 문장별로 반복해서 연습해요.'}
          </p>

          <button
            type="button"
            onClick={listenToFullPassage}
            disabled={passageSentences.length === 0}
            aria-pressed={passageListening}
            data-testid="button-listen-full-passage"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[hsl(var(--accent))] px-4 py-3 text-sm font-bold text-[hsl(var(--accent-foreground))] transition-colors hover:brightness-95 disabled:opacity-50"
          >
            {passageListening
              ? <><Square size={15} fill="currentColor" /> 지문 듣기 중지</>
              : <><Headphones size={17} /> 지문 전체 듣기</>}
          </button>

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
                  count === (isWordMaterial ? 1 : modes.length)
                        ? 'bg-[hsl(var(--accent))] text-[hsl(var(--accent-foreground))]'
                        : active
                          ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                          : 'bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]'
                    }`}>
                      {count === modes.length ? <Check size={14} /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-xs font-semibold ${active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                        {hidePassageText
                          ? `${isWordMaterial ? '단어' : '문장'} ${index + 1} · 원문 숨김`
                          : sentence.english}
                      </span>
                      <span className="mt-1.5 block line-clamp-2 text-[11px] leading-relaxed text-[hsl(var(--foreground)/.72)]">
                        {isWordMaterial && mode === 'dictation' ? '뜻 퀴즈 · 정답 숨김' : sentence.korean}
                      </span>
                      <span className="mt-1 block text-[10px] text-[hsl(var(--muted-foreground))]">
                        {count}/{isWordMaterial ? 1 : modes.length} 완료
                      </span>
                    </span>
                    {active && <ArrowRight size={14} className="shrink-0 text-[hsl(var(--accent))]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>}

        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card)/.7)] p-2">
            {availableModes.map(({ id, label, description, icon: Icon }) => {
              const done = currentCompletion[id];
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectMode(id)}
                  disabled={isWordAutoAdvancing}
                  data-testid={`button-passage-mode-${id}`}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all ${
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
          {isWordMaterial && currentModeFinished && !allCompleted && nextUnfinishedWordMode && (
            <p role="status" className="rounded-xl bg-[hsl(var(--secondary)/.65)] px-4 py-3 text-xs font-semibold text-[hsl(var(--secondary-foreground))]">
              {currentMode.label}를 모두 마쳤어요. 이제 {nextUnfinishedWordMode.label}를 처음부터 끝까지 진행해보세요.
            </p>
          )}

          <article className="min-w-0 rounded-[30px] bg-[hsl(var(--sidebar))] p-7 text-[hsl(var(--sidebar-foreground))] shadow-[var(--shadow-md)] sm:p-10 lg:p-12">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[hsl(var(--sidebar-primary))]">
                  {isWordMaterial ? 'Word' : 'Sentence'} {current.id} / {passageSentences.length}
                </p>
                <h2 className="mt-4 max-w-none break-words text-3xl font-bold leading-tight tracking-[-.04em] sm:text-4xl lg:text-[2.75rem]" data-testid="text-current-passage-sentence">
                  {hidePassageText ? (
                    <span className="flex items-center gap-3 text-[hsl(var(--sidebar-foreground)/.72)]">
                      <EyeOff className="shrink-0 text-[hsl(var(--sidebar-primary))]" size={24} />
                      <span>
                        {isWordMaterial
                          ? '단어 원문을 숨겼어요.'
                          : mode === 'dictation' ? '소리를 듣고 문장을 적어보세요.' : '한글 뜻만 보고 영어로 써보세요.'}
                      </span>
                    </span>
                  ) : current.english}
                </h2>
                {shouldShowMeaning && <div className="mt-4 border-l-2 border-[hsl(var(--sidebar-primary))] pl-3" data-testid="text-current-passage-meaning">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[hsl(var(--sidebar-primary))]">{isWordMaterial ? '단어 뜻' : '한글 해석'}</p>
                  <p className="mt-1.5 text-lg font-semibold leading-relaxed text-[hsl(var(--sidebar-foreground)/.9)] sm:text-xl">
                    {current.korean}
                  </p>
                </div>}
              </div>
              <span className="rounded-full border border-[hsl(var(--sidebar-foreground)/.15)] px-3 py-1.5 font-mono text-[10px] text-[hsl(var(--sidebar-foreground)/.6)]">
                {currentMode.label}
              </span>
            </div>

            <div className="mt-8 rounded-2xl border border-[hsl(var(--sidebar-foreground)/.12)] bg-[hsl(var(--sidebar-accent)/.5)] p-4">
              {mode === 'dictation' && (
                <div>
                  <p className="text-xs text-[hsl(var(--sidebar-foreground)/.65)]">
                    {isWordMaterial
                      ? '영어 단어를 보고 알맞은 한글 뜻을 선택해 확인하세요.'
                      : '빈칸 단어를 듣고 글자 칸에 철자를 입력하세요. 문장은 자동으로 반복 재생돼요.'}
                  </p>
                  {!isWordMaterial && <button
                    type="button"
                    onClick={listen}
                    data-testid="button-passage-listen-dictation"
                    className="button-pop mt-3 inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-4 py-2.5 text-xs font-bold text-[hsl(var(--sidebar))]"
                  >
                    {dictationRepeating
                      ? <><Square size={13} fill="currentColor" /> 반복 듣기 중지</>
                      : <><Repeat2 size={15} /> 반복 듣기 시작</>}
                  </button>}
                  {!isWordMaterial && dictationRepeating && (
                    <span className="ml-3 text-[11px] text-[hsl(var(--sidebar-foreground)/.5)]">
                      {speaking ? '재생 중...' : '다음 재생 준비 중...'}
                    </span>
                  )}
                </div>
              )}
              {mode === 'writing' && (
                <div>
                  <p className="text-xs text-[hsl(var(--sidebar-foreground)/.65)]">
                    {isWordMaterial
                      ? '한글 뜻을 보고 해당하는 영어 단어를 적어보세요.'
                      : '빈칸 문장과 한글 해석을 참고해 전체 문장을 직접 입력해보세요.'}
                  </p>
                  {!isWordMaterial && <p className="mt-2 flex items-center gap-2 text-[11px] text-[hsl(var(--sidebar-foreground)/.45)]"><Lightbulb size={13} /> {current.hint}</p>}
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

            {isWordMaterial && mode === 'dictation' && wordQuizOptions.length > 1 ? (
              <div className="mt-5 space-y-2.5" data-testid="group-word-meaning-options">
                {wordQuizOptions.map((option, index) => {
                  const selected = currentAnswers[mode] === option;
                  return (
                    <button
                      key={`${current.id}-${option}`}
                      type="button"
                      onClick={() => updateAnswer(option)}
                      onDoubleClick={() => {
                        updateAnswer(option);
                        checkAnswer(option);
                      }}
                      disabled={isWordAutoAdvancing}
                      aria-pressed={selected}
                      data-testid={`button-word-meaning-option-${index + 1}`}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-semibold transition-colors ${selected ? 'border-[hsl(var(--sidebar-primary))] bg-[hsl(var(--sidebar-primary)/.14)] text-[hsl(var(--sidebar-foreground))]' : 'border-[hsl(var(--sidebar-foreground)/.16)] bg-[hsl(var(--sidebar-accent)/.4)] hover:border-[hsl(var(--sidebar-primary)/.6)]'}`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[hsl(var(--sidebar-foreground)/.1)] font-mono text-xs">
                        {String.fromCharCode(65 + index)}
                      </span>
                      {option}
                      {selected && <Check size={15} className="ml-auto text-[hsl(var(--sidebar-primary))]" />}
                    </button>
                  );
                })}
                <p className="pt-1 text-[11px] text-[hsl(var(--sidebar-foreground)/.55)]">선택지를 두 번 누르면 바로 답을 확인해요.</p>
              </div>
            ) : mode !== 'shadowing' && (
              <div className="mt-5">
                {!isWordMaterial && (
                  <div
                    className="mb-3 rounded-2xl border border-[hsl(var(--sidebar-primary)/.3)] bg-[hsl(var(--sidebar-accent)/.5)] p-4 sm:p-5"
                    data-testid="text-passage-cloze"
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[hsl(var(--sidebar-primary))]">
                      {mode === 'dictation' ? '들은 문장의 빈칸을 채워보세요' : '단어 순서를 섞은 문장'}
                    </p>
                    <p className="mt-2 break-words text-lg font-semibold leading-relaxed sm:text-xl">
                      {mode === 'writing' ? scrambledSentence : currentCloze.prompt}
                    </p>
                  </div>
                )}
                <label htmlFor={`passage-answer-${current.id}`} className="sr-only">{currentMode.label} 답안</label>
                {isWordMaterial ? (
                  <input
                    ref={wordAnswerInputRef}
                    id={`passage-answer-${current.id}`}
                    type="text"
                    value={currentAnswers[mode]}
                    onChange={(event) => updateAnswer(event.target.value)}
                    disabled={isWordAutoAdvancing}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        checkAnswer();
                      }
                    }}
                    data-testid={`input-passage-${mode}`}
                    className="h-14 w-full rounded-2xl border border-[hsl(var(--sidebar-foreground)/.18)] bg-[hsl(var(--sidebar-accent)/.55)] px-4 text-base font-semibold text-[hsl(var(--sidebar-foreground))] outline-none transition-colors placeholder:text-[hsl(var(--sidebar-foreground)/.35)] focus:border-[hsl(var(--sidebar-primary))] sm:text-lg"
                    placeholder="답을 입력하세요"
                    autoComplete="off"
                    autoCapitalize="off"
                  />
                ) : mode === 'dictation' ? (
                  <LetterBoxAnswer
                    answerTemplate={expectedAnswer}
                    value={currentAnswers[mode]}
                    onChange={updateAnswer}
                    onSubmit={checkAnswer}
                    inputId={`passage-answer-${current.id}`}
                  />
                ) : (
                  <>
                  {!isWordMaterial && mode === 'writing' && (
                    <p className="mb-2 text-xs font-bold">내가 만든 문장</p>
                  )}
                  <textarea
                    id={`passage-answer-${current.id}`}
                    value={currentAnswers[mode]}
                    onChange={(event) => updateAnswer(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        checkAnswer();
                      }
                    }}
                    data-testid={`input-passage-${mode}`}
                    rows={3}
                    className="min-h-[144px] w-full resize-y rounded-2xl border border-slate-300 bg-slate-50 px-4 py-4 text-base leading-relaxed text-slate-900 outline-none transition-colors placeholder:text-slate-500 focus:border-[hsl(var(--sidebar-primary))] focus:ring-2 focus:ring-[hsl(var(--sidebar-primary)/.2)] sm:min-h-[168px] sm:text-lg"
                    placeholder="완성한 영어 문장을 직접 입력하세요."
                    autoComplete="off"
                  />
                  </>
                )}
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
                  {feedback === 'correct' && (isWordMaterial
                    ? isWordAutoAdvancing
                      ? speaking
                        ? '정답이에요. 단어 발음을 듣고 있어요.'
                        : hasNextWord ? '정답이에요. 발음을 재생한 뒤 다음 단어로 넘어가요.' : '정답이에요. 마지막 단어 발음을 들어보세요.'
                      : mode === 'writing' ? '정확해요. 이 단어를 직접 쓸 수 있어요.' : '정확해요. 단어의 뜻을 맞혔어요.'
                    : mode === 'shadowing' ? '좋아요. 입으로 직접 말해본 문장이에요.' : '정확해요. 이 문장은 이제 내 것이 됐어요.')}
                  {feedback === 'wrong' && `${isWordMaterial ? '아직 정답이 아니에요. 다시 확인해볼까요?' : '조금 달라요. 정답을 확인하고 다시 한 번 써볼까요?'} ${showAnswer ? expectedAnswer : ''}`}
                  {feedback === 'hint' && (sentenceCompleted
                    ? (isWordMaterial ? '정답이에요. 다음 단어로 넘어가 볼까요?' : '세 가지 연습을 모두 끝냈어요. 다음 문장으로 가볼까요?')
                    : (isWordMaterial ? `${currentMode.label}의 모든 단어를 끝내면 다음 연습으로 넘어갈 수 있어요.` : '이 문장의 받아쓰기, 영작, 따라 말하기를 모두 끝내면 다음으로 갈 수 있어요.'))}
                </span>
              </div>
            )}

            <div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
              <p className="flex items-center gap-2 text-[11px] text-[hsl(var(--sidebar-foreground)/.45)]">
                <Lightbulb size={13} /> {isWordMaterial ? '막히면 단어 뜻을 다시 떠올려보세요.' : '막히면 문장을 소리 내어 천천히 읽어보세요.'}
              </p>
              <div className="flex gap-2">
                {mode !== 'shadowing' && (
                  <button
                    type="button"
                    onClick={() => checkAnswer()}
                    disabled={isWordAutoAdvancing}
                    data-testid={`button-check-passage-${mode}`}
                    className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--sidebar-primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--sidebar))]"
                  >
                    <Check size={14} /> 확인하기
                  </button>
                )}
                {mode === 'shadowing' && (
                  <button
                    type="button"
                    onClick={() => checkAnswer()}
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
              {sentenceCompleted
                ? (isWordMaterial ? '이 단어의 두 가지 연습을 모두 마쳤어요.' : '이 문장의 모든 연습을 완료했어요.')
                : `${currentMode.label}을 완료해보세요.`}
            </p>
            <button
              type="button"
              onClick={nextSentence}
              disabled={isWordMaterial
                ? isWordAutoAdvancing || !canAdvance || safeCurrentIndex === passageSentences.length - 1
                : safeCurrentIndex === passageSentences.length - 1 && (!canAdvance || allCompleted)}
              data-testid="button-next-passage-sentence"
              className="button-pop inline-flex items-center gap-2 rounded-xl bg-[hsl(var(--primary))] px-4 py-3 text-xs font-bold text-[hsl(var(--primary-foreground))] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {allCompleted
                ? (isWordMaterial ? '단어 과제 완료' : '지문 연습 완료')
                : currentIndex === passageSentences.length - 1
                  ? (isWordMaterial ? '마지막 단어' : '마지막 문장')
                  : (isWordMaterial ? '다음 단어' : '다음 문장')} <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </section>

      {allCompleted && (
        <section className="rise-in rounded-[26px] border border-[hsl(var(--accent)/.35)] bg-[hsl(var(--secondary)/.65)] p-6 text-center" data-testid="status-passage-complete">
          <CheckCircle2 className="mx-auto text-[hsl(var(--accent))]" size={28} />
          <h2 className="mt-3 text-xl font-bold">{isWordMaterial ? '단어 과제를 모두 마쳤어요.' : '지문의 모든 문장을 완주했어요.'}</h2>
          <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
            {isWordMaterial ? '영어 퀴즈와 단어 쓰기를 모든 단어에서 마쳤어요.' : '이제 문장들이 눈으로만 아는 영어가 아니라, 꺼내 쓸 수 있는 영어가 됐어요.'}
          </p>
        </section>
      )}
    </div>
  );
}