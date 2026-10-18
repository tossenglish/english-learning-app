(() => {
  "use strict";

  const root = document.getElementById("fc-app");
  const historyKey = "fc-history-v1";
  const canSpeak = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);

  function validSets() {
    if (!Array.isArray(window.FC_SETS)) return [];
    const ids = new Set();
    return window.FC_SETS.flatMap((set) => {
      if (!set || typeof set.id !== "string" || !set.id.trim() || ids.has(set.id)) return [];
      ids.add(set.id);
      const seen = new Set();
      const words = (Array.isArray(set.words) ? set.words : []).flatMap((word) => {
        if (!word || typeof word.en !== "string" || typeof word.ko !== "string") return [];
        const en = word.en.trim(), ko = word.ko.trim(), key = en.toLocaleLowerCase();
        if (!en || !ko || seen.has(key)) return [];
        seen.add(key);
        return [{ en, ko }];
      });
      return words.length ? [{ id: set.id, title: String(set.title || set.id), words }] : [];
    });
  }

  const sets = validSets();
  let state = {
    screen: "home", set: null, deck: [], index: 0, flipped: false,
    known: [], missed: [], direction: "en-ko", shuffled: true, reviewOnly: false
  };

  function readHistory() {
    try {
      const history = JSON.parse(window.localStorage.getItem(historyKey) || "{}");
      return history && typeof history === "object" && !Array.isArray(history) ? history : {};
    }
    catch { return {}; }
  }
  function writeHistory(history) {
    try { window.localStorage.setItem(historyKey, JSON.stringify(history)); }
    catch { /* Keep studying when storage is unavailable. */ }
  }
  function shuffle(words) {
    const result = [...words];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function currentHistory(setId) {
    const record = readHistory()[setId];
    if (!record || !Number.isFinite(record.known) || !Array.isArray(record.missed)) return null;
    return {
      ...record,
      known: Math.max(0, record.known),
      missed: record.missed.filter((word) => word && typeof word.en === "string" && typeof word.ko === "string")
    };
  }

  function startSet(set, reviewOnly = false, shuffled = state.shuffled) {
    const history = currentHistory(set.id);
    const missedKeys = new Set((history?.missed || []).map((word) => word.en.toLocaleLowerCase()));
    let deck = reviewOnly ? set.words.filter((word) => missedKeys.has(word.en.toLocaleLowerCase())) : [...set.words];
    if (shuffled) deck = shuffle(deck);
    state = { ...state, screen: "study", set, deck, index: 0, flipped: false, known: [], missed: [], reviewOnly, shuffled };
    render();
  }

  function homeMarkup() {
    const cards = sets.map((set) => {
      const record = currentHistory(set.id);
      const count = record ? `${record.known}개 알아요 · ${record.missed.length}개 복습` : `${set.words.length}개 단어`;
      const review = record?.missed?.length
        ? `<button class="fc-review" data-action="review" data-set="${escapeHtml(set.id)}">지난번 헷갈린 단어 복습하기</button>` : "";
      return `<article class="fc-set-card">
        <button class="fc-set-card" data-action="start" data-set="${escapeHtml(set.id)}"><strong>${escapeHtml(set.title)}</strong><span>${count}</span></button>
        ${record ? `<div class="fc-record"><b>마지막 학습</b>: 알아요 ${record.known}개 · 헷갈려요 ${record.missed.length}개
          ${record.missed.length ? `<ul>${record.missed.map((word) => `<li>${escapeHtml(word.en)} — ${escapeHtml(word.ko)}</li>`).join("")}</ul>` : ""}</div>` : ""}
        ${review}
      </article>`;
    }).join("");
    return `<section class="fc-shell">
      <header class="fc-top"><div class="fc-brand"><span class="fc-brand-mark" aria-hidden="true">Aa</span>오늘의 단어 연습</div><span class="fc-label">영어 단어</span></header>
      <p class="fc-label">하루 한 세트, 가볍게</p><h1 class="fc-title">단어를 보고,<br>하나씩 익혀 봐요.</h1>
      <p class="fc-copy">카드를 넘기며 아는 단어와 더 연습할 단어를 나눠 보세요.</p>
      ${cards ? `<div class="fc-set-grid">${cards}</div>` : `<p class="fc-error">연습할 수 있는 단어 세트가 없습니다. words.js의 단어를 확인해 주세요.</p>`}
    </section>`;
  }

  function studyMarkup() {
    const word = state.deck[state.index];
    if (!word) { finish(); return ""; }
    const front = state.direction === "en-ko" ? word.en : word.ko;
    const back = state.direction === "en-ko" ? word.ko : word.en;
    const total = state.deck.length;
    const done = state.known.length + state.missed.length;
    const history = currentHistory(state.set.id);
    return `<section class="fc-shell">
      <header class="fc-top"><button class="fc-small-button" data-action="home">← 세트 선택</button><span class="fc-label">${escapeHtml(state.set.title)}</span></header>
      ${history ? `<p class="fc-record">지난번: 알아요 ${history.known}개 · 헷갈려요 ${history.missed.length}개</p>` : ""}
      <div class="fc-study-meta"><b>${state.index + 1} / ${total}</b><div class="fc-tools">
        <button class="fc-small-button" data-action="order">${state.shuffled ? "섞기 중 · 순서대로" : "순서대로 · 섞기"}</button>
        <button class="fc-small-button" data-action="direction">${state.direction === "en-ko" ? "영어 → 한국어" : "한국어 → 영어"}</button>
      </div></div>
      <div class="fc-progress" role="progressbar" aria-label="학습 진행" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><div class="fc-progress-fill" style="width:${Math.round(done / total * 100)}%"></div></div>
      <div class="fc-counts"><span>알아요 ✓ ${state.known.length}개</span><span>헷갈려요 ? ${state.missed.length}개</span></div>
      <div class="fc-panel">
        <div class="fc-card-scene"><button class="fc-flashcard${state.flipped ? " is-flipped" : ""}${state.cardPop ? " fc-pop" : ""}" data-action="flip" aria-label="카드 뒤집기">
          <span class="fc-card-face"><span class="fc-face-label">${state.direction === "en-ko" ? "영어" : "한국어"}</span><span class="fc-word">${escapeHtml(front)}</span><span class="fc-card-hint">카드를 눌러 뜻 확인하기 · 스페이스 또는 엔터</span></span>
          <span class="fc-card-face fc-card-back"><span class="fc-face-label">${state.direction === "en-ko" ? "한국어 뜻" : "영어 단어"}</span><span class="fc-word">${escapeHtml(back)}</span></span>
        </button></div>
        <div class="fc-actions">
          ${canSpeak ? `<button class="fc-secondary" data-action="speak" aria-label="${escapeHtml(word.en)} 발음 듣기">🔊 발음 듣기</button>` : ""}
          <button class="fc-secondary fc-confused" data-action="mark-missed">헷갈려요 ?</button>
          <button class="fc-know" data-action="mark-known">알아요 ✓</button>
        </div>
      </div>
    </section>`;
  }

  function finish() {
    state.screen = "result";
    const history = readHistory();
    history[state.set.id] = { known: state.known.length, missed: state.missed, updatedAt: Date.now() };
    writeHistory(history);
  }

  function resultMarkup() {
    const missed = state.missed;
    return `<section class="fc-shell"><header class="fc-top"><div class="fc-brand"><span class="fc-brand-mark">✓</span>학습 결과</div></header>
      <div class="fc-panel"><p class="fc-label">${escapeHtml(state.set.title)}</p><h1 class="fc-title">${missed.length ? "잘했어요!" : "모두 익혔어요!"}</h1>
      <p class="fc-copy">${missed.length ? "헷갈린 단어를 다시 만나면 더 잘 기억날 거예요." : "모든 단어를 알아요로 표시했어요. 멋져요!"}</p>
      <div class="fc-result-score"><div class="fc-score"><strong>${state.known.length}</strong><span>알아요 ✓</span></div><div class="fc-score"><strong>${missed.length}</strong><span>헷갈려요 ?</span></div></div>
      ${missed.length ? `<h2>다시 볼 단어</h2><ul class="fc-result-list">${missed.map((word) => `<li>${escapeHtml(word.en)} — ${escapeHtml(word.ko)}</li>`).join("")}</ul>` : ""}
      <div class="fc-actions">${missed.length ? `<button class="fc-secondary" data-action="review-current">헷갈린 카드만 다시 보기</button>` : ""}
      <button class="fc-primary" data-action="restart">처음부터 다시 하기</button><button class="fc-secondary" data-action="home">세트 선택으로</button></div></div>
    </section>`;
  }

  function render() {
    if (!root) return;
    root.innerHTML = state.screen === "study" ? studyMarkup() : state.screen === "result" ? resultMarkup() : homeMarkup();
  }

  function mark(known) {
    const word = state.deck[state.index];
    if (known) state.known.push(word); else state.missed.push(word);
    state.cardPop = true;
    state.index += 1; state.flipped = false;
    if (state.index >= state.deck.length) finish();
    render();
    window.setTimeout(() => { state.cardPop = false; }, 330);
  }

  root?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "start" || action === "review") {
      const set = sets.find((item) => item.id === button.dataset.set);
      if (set) startSet(set, action === "review");
    } else if (action === "flip") {
      state.flipped = !state.flipped; render();
    } else if (action === "mark-known") mark(true);
    else if (action === "mark-missed") mark(false);
    else if (action === "home") { state.screen = "home"; render(); }
    else if (action === "restart") startSet(state.set, false, state.shuffled);
    else if (action === "review-current") startSet(state.set, true, state.shuffled);
    else if (action === "direction") { state.direction = state.direction === "en-ko" ? "ko-en" : "en-ko"; state.flipped = false; render(); }
    else if (action === "order") startSet(state.set, state.reviewOnly, !state.shuffled);
    else if (action === "speak") {
      event.stopPropagation();
      const word = state.deck[state.index];
      if (word && canSpeak) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(word.en);
        utterance.lang = "en-US";
        window.speechSynthesis.speak(utterance);
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    if (state.screen !== "study" || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
    if (event.code === "Space" || event.code === "Enter") {
      if (event.target.closest("button[data-action='flip']")) return;
      if (event.target.closest("button")) return;
      event.preventDefault(); state.flipped = !state.flipped; render();
    } else if (event.key === "ArrowRight") { event.preventDefault(); mark(true); }
    else if (event.key === "ArrowLeft") { event.preventDefault(); mark(false); }
  });

  const requestedSet = new URLSearchParams(location.search).get("set");
  const initialSet = sets.find((set) => set.id === requestedSet) || (sets.length === 1 ? sets[0] : null);
  if (initialSet) startSet(initialSet);
  else render();
})();
