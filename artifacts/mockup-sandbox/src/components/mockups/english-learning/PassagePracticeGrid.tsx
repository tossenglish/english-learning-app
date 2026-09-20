import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardPaste,
  Headphones,
  Lightbulb,
  Menu,
  MessageCircle,
  Mic,
  MoreHorizontal,
  PenLine,
  Play,
  RotateCcw,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';

type Mode = 'dictation' | 'writing' | 'shadowing';

const sentences = [
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

const modeDetails: Record<Mode, { label: string; description: string }> = {
  dictation: { label: '받아쓰기', description: '소리를 듣고 적어요' },
  writing: { label: '영작', description: '뜻을 보고 문장을 만들어요' },
  shadowing: { label: '따라 말하기', description: '듣고 바로 따라 해요' },
};

const normalize = (value: string) =>
  value.toLowerCase().replace(/[“”"'.,!?]/g, '').replace(/\s+/g, ' ').trim();

export default function PassagePracticeGrid() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [mode, setMode] = useState<Mode>('dictation');
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  const [completed, setCompleted] = useState<Record<number, Mode[]>>({
    1: ['dictation'],
    2: ['dictation', 'writing'],
  });
  const [draft, setDraft] = useState(
    'I stumbled upon a little café. It was tucked away on a quiet street. The smell of fresh bread drew me inside.',
  );
  const [toast, setToast] = useState('');
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  const current = sentences[currentIndex];
  const currentCompleted = completed[current.id] ?? [];
  const completedSteps = Object.values(completed).reduce((total, modes) => total + modes.length, 0);
  const progress = Math.round((completedSteps / (sentences.length * 3)) * 100);
  const modeList = useMemo(() => Object.entries(modeDetails) as [Mode, (typeof modeDetails)[Mode]][], []);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const selectSentence = (index: number) => {
    setCurrentIndex(index);
    setAnswer('');
    setFeedback(null);
  };

  const markCurrentComplete = () => {
    setCompleted((previous) => ({
      ...previous,
      [current.id]: Array.from(new Set([...(previous[current.id] ?? []), mode])),
    }));
    setFeedback('correct');
  };

  const checkAnswer = () => {
    if (mode === 'shadowing') {
      markCurrentComplete();
      return;
    }
    if (normalize(answer) === normalize(current.english)) {
      markCurrentComplete();
    } else {
      setFeedback('wrong');
    }
  };

  const listen = () => {
    if (!('speechSynthesis' in window)) {
      showToast('이 브라우저에서는 음성 재생을 지원하지 않아요.');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(current.english);
    utterance.lang = 'en-US';
    utterance.rate = 0.82;
    window.speechSynthesis.speak(utterance);
    showToast('문장을 천천히 읽어드릴게요.');
  };

  const applyPassage = () => {
    const length = draft.trim().length;
    if (!length) {
      showToast('연습할 영어 지문을 먼저 붙여 넣어주세요.');
      return;
    }
    showToast(`${length.toLocaleString()}자의 지문을 연습 목록에 저장했어요.`);
  };

  const nextSentence = () => {
    if (!currentCompleted.includes(mode)) {
      setFeedback(null);
      showToast('현재 연습을 완료하면 다음 문장이 열려요.');
      return;
    }
    if (currentIndex < sentences.length - 1) {
      selectSentence(currentIndex + 1);
      setMode('dictation');
    } else {
      showToast('좋아요. 지문의 마지막 문장까지 왔어요.');
    }
  };

  return (
    <div className="lpv-root min-h-[100dvh] overflow-x-hidden bg-[#f4efe7] text-[#252d40]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Noto+Sans+KR:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');
        .lpv-root { font-family: 'DM Sans', 'Noto Sans KR', sans-serif; }
        .lpv-mono { font-family: 'Space Mono', monospace; }
        .lpv-grain::after {
          content: ''; position: fixed; inset: 0; pointer-events: none; opacity: .035; z-index: 40;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .lpv-enter { animation: lpv-enter .55s cubic-bezier(.2,.8,.2,1) both; }
        @keyframes lpv-enter { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .lpv-button { transition: transform .18s ease, background-color .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .lpv-button:hover { transform: translateY(-2px); }
        .lpv-button:active { transform: translateY(0); }
        .lpv-scroll::-webkit-scrollbar { width: 5px; }
        .lpv-scroll::-webkit-scrollbar-thumb { background: #d7d0c4; border-radius: 99px; }
      `}</style>

      <div className="lpv-grain flex min-h-[100dvh]">
        <aside
          className={`fixed inset-y-0 left-0 z-30 w-[246px] shrink-0 -translate-x-full bg-[#252d40] px-5 py-7 text-[#f4efe7] shadow-[16px_0_36px_rgba(37,45,64,.14)] transition-transform md:relative md:translate-x-0 md:shadow-none ${
            mobileRailOpen ? 'translate-x-0' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#f1a361] text-[#252d40]">
                <span className="text-xl font-extrabold">어</span>
              </div>
              <div>
                <p className="text-[15px] font-bold tracking-[-.04em]">영어의신<span className="text-[#f1a361]">.</span></p>
                <p className="lpv-mono mt-0.5 text-[9px] uppercase tracking-[.16em] text-[#aeb3b8]">daily practice</p>
              </div>
            </div>
            <button type="button" className="text-[#aeb3b8] md:hidden" onClick={() => setMobileRailOpen(false)} aria-label="메뉴 닫기">
              <X size={18} />
            </button>
          </div>

          <div className="mt-14">
            <p className="lpv-mono mb-3 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-[#89909f]">My practice</p>
            <nav className="space-y-1.5">
              {[
                ['오늘의 연습', '01'],
                ['배우기', '02'],
                ['지문 연습', '03'],
                ['단어장', '04'],
                ['나의 기록', '05'],
              ].map(([label, index], itemIndex) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => showToast(`${label} 화면은 다음 연습에서 준비할게요.`)}
                  className={`flex w-full items-center gap-3 rounded-[13px] px-3 py-3 text-left text-sm font-semibold transition-colors ${
                    itemIndex === 2 ? 'bg-[#384258] text-[#f4efe7] shadow-[inset_3px_0_0_#f1a361]' : 'text-[#aeb3b8] hover:bg-[#313a50] hover:text-[#f4efe7]'
                  }`}
                >
                  <span className="lpv-mono w-5 text-[9px] text-[#f1a361]">{index}</span>
                  <span>{label}</span>
                  {itemIndex === 2 && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#f1a361]" />}
                </button>
              ))}
            </nav>
          </div>

          <div className="absolute inset-x-5 bottom-7 rounded-[18px] border border-[#ffffff1c] bg-[#313a50] p-4">
            <div className="flex items-center justify-between">
              <span className="lpv-mono text-[9px] uppercase tracking-[.17em] text-[#89909f]">This week</span>
              <Sparkles size={15} className="text-[#f1a361]" />
            </div>
            <p className="mt-3 text-sm font-semibold">조금씩, 확실하게.</p>
            <p className="mt-1 text-xs leading-relaxed text-[#aeb3b8]">이번 주 4일째<br />연습하고 있어요.</p>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#252d40]">
              <div className="h-full w-[57%] rounded-full bg-[#f1a361]" />
            </div>
          </div>
        </aside>

        {mobileRailOpen && <button type="button" aria-label="메뉴 닫기" onClick={() => setMobileRailOpen(false)} className="fixed inset-0 z-20 bg-[#252d40]/30 md:hidden" />}

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-10 flex h-[72px] items-center justify-between border-b border-[#ded8cc] bg-[#f4efe7]/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setMobileRailOpen(true)} className="rounded-xl border border-[#ded8cc] bg-[#faf7f0] p-2.5 md:hidden" aria-label="메뉴 열기">
                <Menu size={18} />
              </button>
              <div className="hidden items-center gap-2 text-xs font-semibold text-[#6f756f] sm:flex">
                <span className="h-2 w-2 rounded-full bg-[#e88942]" />
                해봐~ 된다니깐!
              </div>
              <div className="sm:hidden">
                <p className="text-sm font-bold">지문 연습</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => showToast('오늘의 기록을 저장했어요.')} className="lpv-button hidden rounded-xl border border-[#ded8cc] bg-[#faf7f0] px-3.5 py-2.5 text-xs font-bold sm:block">
                오늘의 기록
              </button>
              <button type="button" onClick={() => showToast('민님의 레벨은 Intermediate예요.')} className="lpv-button flex items-center gap-2 rounded-full border border-[#ded8cc] bg-[#faf7f0] px-2.5 py-2 text-xs font-bold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#cce5dd] text-[10px] text-[#315e58]">민</span>
                <span className="hidden sm:inline">Intermediate</span>
                <ChevronDown size={13} className="text-[#6f756f]" />
              </button>
              <button type="button" onClick={() => showToast('로그아웃은 데모에서 잠시 쉬어둘게요.')} className="hidden px-2 text-xs font-bold text-[#6f756f] hover:text-[#252d40] lg:block">
                로그아웃
              </button>
            </div>
          </header>

          <main className="mx-auto max-w-[1500px] px-5 pb-12 pt-7 sm:px-8 lg:px-10">
            <section className="lpv-enter flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div>
                <button type="button" onClick={() => showToast('배우기 화면으로 돌아갈게요.')} className="mb-4 flex items-center gap-2 text-xs font-bold text-[#6f756f] hover:text-[#e88942]">
                  <ArrowLeft size={14} /> 오늘의 단어로 돌아가기
                </button>
                <p className="lpv-mono mb-2 text-[10px] font-bold uppercase tracking-[.19em] text-[#e88942]">Sentence studio / layout 02</p>
                <h1 className="text-3xl font-bold tracking-[-.06em] text-[#252d40] sm:text-4xl">문장을 <span className="text-[#e88942]">꺼내 쓰는</span> 시간.</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#6f756f]">한 문장씩 듣고, 적고, 말해보세요. 세 가지 연습을 모두 끝내면 다음 문장이 열려요.</p>
              </div>
              <div className="w-full rounded-[18px] border border-[#ded8cc] bg-[#faf7f0] p-4 sm:w-auto sm:min-w-[250px]">
                <div className="flex items-center justify-between gap-8">
                  <span className="text-xs font-semibold text-[#6f756f]">전체 진행률</span>
                  <span className="lpv-mono text-sm font-bold text-[#252d40]">{completedSteps}/12</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e7e1d8]">
                  <div className="h-full rounded-full bg-[#e88942] transition-[width] duration-500" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-[10px] font-semibold text-[#6f756f]">{progress}% · 오늘의 연습이 쌓이고 있어요</p>
              </div>
            </section>

            <div className="mt-7 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
              <div className="min-w-0">
                <section className="lpv-enter rounded-[26px] border border-[#ded8cc] bg-[#faf7f0] p-5 shadow-[0_10px_30px_rgba(49,42,29,.05)] sm:p-6">
                  <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] bg-[#cce5dd] text-[#315e58]"><ClipboardPaste size={18} /></span>
                      <div>
                        <p className="lpv-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#e88942]">Make it yours</p>
                        <h2 className="mt-1 text-lg font-bold">연습할 영어 지문을 붙여 넣어보세요.</h2>
                        <p className="mt-1 text-xs text-[#6f756f]">학원 자료나 뉴스처럼 원하는 글을 넣으면 문장별 연습으로 바꿔드려요.</p>
                      </div>
                    </div>
                    <span className="lpv-mono w-fit shrink-0 rounded-full bg-[#ebe6dc] px-3 py-1.5 text-[9px] font-bold text-[#6f756f]">{sentences.length}문장으로 연습 중</span>
                  </div>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className="mt-5 min-h-[112px] w-full resize-y rounded-[16px] border border-[#ded8cc] bg-[#f4efe7]/65 px-4 py-3.5 text-sm leading-relaxed outline-none placeholder:text-[#a4a099] focus:border-[#e88942] focus:ring-2 focus:ring-[#e88942]/15"
                    placeholder="영어 지문을 붙여 넣어보세요."
                    aria-label="영어 지문"
                  />
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex items-center gap-2 text-[11px] text-[#6f756f]"><Sparkles size={13} className="text-[#e88942]" /> 마침표를 기준으로 문장을 나눠요.</span>
                    <div className="flex items-center gap-2 sm:justify-end">
                      <span className="lpv-mono mr-1 text-[10px] text-[#6f756f]">{draft.length.toLocaleString()}자</span>
                      <button type="button" onClick={() => setDraft('I stumbled upon a little café. It was tucked away on a quiet street.')} className="lpv-button rounded-xl border border-[#ded8cc] bg-[#faf7f0] px-3.5 py-2.5 text-xs font-bold">예시 지문</button>
                      <button type="button" onClick={applyPassage} className="lpv-button inline-flex items-center gap-2 rounded-xl bg-[#252d40] px-4 py-2.5 text-xs font-bold text-[#f4efe7] shadow-[0_7px_16px_rgba(37,45,64,.12)]">이 지문으로 연습하기 <ArrowRight size={14} /></button>
                    </div>
                  </div>
                </section>

                <section className="lpv-enter mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_250px]">
                  <article className="min-w-0 rounded-[28px] bg-[#252d40] p-6 text-[#f4efe7] shadow-[0_18px_40px_rgba(37,45,64,.18)] sm:p-8">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="lpv-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#f1a361]">Sentence {current.id} / {sentences.length}</p>
                        <h2 className="mt-4 max-w-2xl text-2xl font-bold leading-tight tracking-[-.04em] sm:text-[31px]">{current.english}</h2>
                      </div>
                      <button type="button" onClick={() => showToast('문장 메뉴를 열었어요.')} className="rounded-xl p-2 text-[#aeb3b8] hover:bg-[#313a50]"><MoreHorizontal size={18} /></button>
                    </div>
                    <div className="mt-5 flex items-start gap-3 border-l-2 border-[#f1a361] pl-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#f1a361]">한글 해석</p>
                        <p className="mt-1 text-base font-semibold leading-relaxed text-[#f4efe7]/90">{current.korean}</p>
                      </div>
                      <button type="button" onClick={listen} className="ml-auto shrink-0 rounded-xl border border-[#ffffff20] p-2.5 text-[#f1a361] hover:bg-[#313a50]" aria-label="문장 듣기"><Volume2 size={16} /></button>
                    </div>

                    <div className="mt-8 grid grid-cols-3 gap-2 rounded-[16px] bg-[#313a50] p-1.5">
                      {modeList.map(([id, detail]) => {
                        const isActive = mode === id;
                        const done = currentCompleted.includes(id);
                        const Icon = id === 'dictation' ? Headphones : id === 'writing' ? PenLine : Mic;
                        return (
                          <button key={id} type="button" onClick={() => { setMode(id); setFeedback(null); }} className={`flex min-w-0 items-center justify-center gap-2 rounded-[12px] px-2 py-3 text-left transition-colors ${isActive ? 'bg-[#f1a361] text-[#252d40]' : 'text-[#aeb3b8] hover:bg-[#384258]'}`}>
                            <Icon size={15} />
                            <span className="hidden min-w-0 sm:block"><span className="block truncate text-xs font-bold">{detail.label}</span><span className={`mt-0.5 block truncate text-[9px] ${isActive ? 'text-[#252d40]/65' : 'text-[#aeb3b8]'}`}>{done ? '완료했어요' : detail.description}</span></span>
                            {done && <CheckCircle2 size={14} className="shrink-0" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-5 rounded-[18px] border border-[#ffffff16] bg-[#313a50]/70 p-4">
                      {mode === 'dictation' && (
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <p className="text-xs text-[#f4efe7]/70">먼저 소리를 여러 번 들어보세요.</p>
                          <button type="button" onClick={listen} className="lpv-button inline-flex w-fit items-center gap-2 rounded-xl bg-[#f1a361] px-4 py-2.5 text-xs font-bold text-[#252d40]"><Play size={13} fill="currentColor" /> 문장 듣기</button>
                        </div>
                      )}
                      {mode === 'writing' && <div><p className="text-xs text-[#f4efe7]/70">한국어 뜻을 보고 영어 문장을 직접 만들어보세요.</p><p className="mt-3 text-lg font-semibold text-[#f1a361]">{current.korean}</p><p className="mt-2 flex items-center gap-2 text-[11px] text-[#aeb3b8]"><Lightbulb size={13} /> {current.hint}</p></div>}
                      {mode === 'shadowing' && (
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                          <p className="text-xs text-[#f4efe7]/70">문장을 듣고 리듬을 따라 3번 소리 내어 읽어보세요.</p>
                          <button type="button" onClick={listen} className="lpv-button inline-flex w-fit items-center gap-2 rounded-xl bg-[#f1a361] px-4 py-2.5 text-xs font-bold text-[#252d40]"><Headphones size={13} /> 먼저 들어보기</button>
                        </div>
                      )}
                    </div>

                    {mode !== 'shadowing' && <input value={answer} onChange={(event) => { setAnswer(event.target.value); setFeedback(null); }} onKeyDown={(event) => { if (event.key === 'Enter') checkAnswer(); }} className="mt-5 w-full rounded-[16px] border border-[#ffffff22] bg-[#313a50] px-4 py-4 text-sm text-[#f4efe7] outline-none placeholder:text-[#aeb3b8]/50 focus:border-[#f1a361]" placeholder={mode === 'dictation' ? '들은 문장을 영어로 적어보세요' : '영어 문장을 입력해보세요'} aria-label={`${modeDetails[mode].label} 답안`} />}

                    {feedback && <div className={`mt-4 flex items-start gap-2 rounded-xl px-3.5 py-3 text-xs font-semibold ${feedback === 'correct' ? 'bg-[#cce5dd] text-[#315e58]' : 'bg-[#854e4b]/40 text-[#f6c0a8]'}`}>{feedback === 'correct' ? <CheckCircle2 size={15} className="shrink-0" /> : <RotateCcw size={15} className="shrink-0" />}<span>{feedback === 'correct' ? '정확해요. 이 문장은 이제 내 것이 됐어요.' : `조금 달라요. 정답은 “${current.english}”이에요.`}</span></div>}

                    <div className="mt-5 flex flex-col-reverse justify-between gap-3 sm:flex-row sm:items-center">
                      <p className="flex items-center gap-2 text-[11px] text-[#aeb3b8]"><Lightbulb size={13} /> 막히면 문장을 천천히 소리 내어 읽어보세요.</p>
                      <button type="button" onClick={checkAnswer} className="lpv-button inline-flex items-center justify-center gap-2 rounded-xl bg-[#f1a361] px-4 py-3 text-xs font-bold text-[#252d40]">{mode === 'shadowing' ? <Mic size={14} /> : <Check size={14} />} {mode === 'shadowing' ? '따라 말했어요' : '확인하기'}</button>
                    </div>
                  </article>

                  <aside className="rounded-[24px] border border-[#ded8cc] bg-[#faf7f0] p-5">
                    <div className="flex items-center justify-between">
                      <div><p className="lpv-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#6f756f]">Current note</p><h3 className="mt-2 text-lg font-bold">오늘의 문장</h3></div>
                      <MessageCircle size={18} className="text-[#e88942]" />
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-[#6f756f]">이 문장은 <strong className="text-[#252d40]">stumble upon</strong>이라는 표현으로 우연한 발견을 말해요.</p>
                    <div className="mt-5 rounded-[16px] bg-[#cce5dd]/70 p-4">
                      <p className="lpv-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#315e58]">Try it aloud</p>
                      <p className="mt-2 text-sm font-semibold leading-relaxed text-[#315e58]">“I stumbled upon a little café.”</p>
                      <button type="button" onClick={listen} className="mt-3 flex items-center gap-2 text-xs font-bold text-[#315e58] hover:underline"><Volume2 size={14} /> 발음 들어보기</button>
                    </div>
                    <div className="mt-5 border-t border-[#ded8cc] pt-4">
                      <p className="lpv-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#6f756f]">Practice rhythm</p>
                      <div className="mt-3 flex items-end gap-1.5">
                        {[14, 24, 18, 32, 22, 14, 27, 19, 36, 17, 27, 12].map((height, index) => <span key={index} className={`w-1.5 rounded-full ${index === 4 ? 'bg-[#e88942]' : 'bg-[#d9cdbd]'}`} style={{ height }} />)}
                      </div>
                    </div>
                  </aside>
                </section>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <p className="text-xs text-[#6f756f]">{currentCompleted.length === 3 ? '이 문장의 모든 연습을 완료했어요.' : `${modeDetails[mode].label}을 완료해보세요.`}</p>
                  <button type="button" onClick={nextSentence} className="lpv-button inline-flex items-center gap-2 rounded-xl bg-[#252d40] px-4 py-3 text-xs font-bold text-[#f4efe7]">{currentIndex === sentences.length - 1 ? '마지막 문장' : '다음 문장'} <ArrowRight size={14} /></button>
                </div>
              </div>

              <aside className="lpv-scroll max-h-[680px] overflow-y-auto rounded-[26px] border border-[#ded8cc] bg-[#faf7f0] p-5">
                <div className="flex items-start justify-between">
                  <div><p className="lpv-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#6f756f]">Today's passage</p><h2 className="mt-2 text-lg font-bold">작은 발견</h2></div>
                  <button type="button" onClick={() => showToast('지문을 저장했어요.')} className="rounded-xl p-2 text-[#6f756f] hover:bg-[#ebe6dc]"><MoreHorizontal size={18} /></button>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#6f756f]">작은 카페를 발견한 오후의 이야기예요.</p>
                <div className="mt-6 space-y-2">
                  {sentences.map((sentence, index) => {
                    const count = (completed[sentence.id] ?? []).length;
                    const active = index === currentIndex;
                    return (
                      <button key={sentence.id} type="button" onClick={() => selectSentence(index)} className={`w-full rounded-[17px] border p-3 text-left transition-colors ${active ? 'border-[#e88942]/60 bg-[#cce5dd]/60' : 'border-transparent hover:border-[#ded8cc] hover:bg-[#f4efe7]'}`}>
                        <div className="flex items-start gap-3">
                          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${count === 3 ? 'bg-[#e88942] text-[#faf7f0]' : active ? 'bg-[#252d40] text-[#f4efe7]' : 'bg-[#ebe6dc] text-[#6f756f]'}`}>{count === 3 ? <Check size={14} /> : index + 1}</span>
                          <span className="min-w-0 flex-1"><span className={`block text-xs font-semibold leading-relaxed ${active ? 'text-[#252d40]' : 'text-[#6f756f]'}`}>{sentence.english}</span><span className="mt-1.5 block text-[10px] leading-relaxed text-[#6f756f]">{sentence.korean}</span><span className="lpv-mono mt-2 block text-[9px] text-[#6f756f]">{count}/3 완료</span></span>
                          {active && <ArrowRight size={14} className="mt-1 shrink-0 text-[#e88942]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-6 rounded-[17px] border border-dashed border-[#d5ccbf] p-4">
                  <p className="flex items-center gap-2 text-xs font-bold"><Headphones size={14} className="text-[#e88942]" /> 세 번의 반복이 기억을 만들어요.</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-[#6f756f]">듣기 → 쓰기 → 말하기 순서로 한 문장을 단단하게 익혀보세요.</p>
                </div>
              </aside>
            </div>
          </main>
        </div>
      </div>

      {toast && <div role="status" className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#252d40] px-4 py-3 text-xs font-semibold text-[#f4efe7] shadow-[0_12px_28px_rgba(37,45,64,.25)]"><CheckCircle2 size={15} className="text-[#f1a361]" />{toast}</div>}
    </div>
  );
}