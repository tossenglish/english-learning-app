/*
 * shared-words.js
 * 단어 연습장과 워드 퀘스트 RPG가 함께 쓰는 단어 목록 모듈.
 * 서버(/api/words)에 저장하고, 서버에 닿지 않을 때는 이 기기에 남겨 둔 사본을 사용합니다.
 *
 * 공통 데이터 형식: [{ en: "apple", ko: "사과" }, ...]
 *
 * 사용법
 *   SharedWords.load().then(function (list) { ... });
 *       list: 배열(서버가 비어 있으면 []) 또는 null(서버/사본 모두 없음)
 *       SharedWords.canEdit: 이 사용자가 공유 단어를 수정할 수 있는지(서버가 알려줌, 모르면 true)
 *   SharedWords.save(list).then(function (r) { ... });
 *       r.ok: 서버 저장 성공 여부, r.status: 실패 시 HTTP 상태(403 = 관리자 아님)
 */
(function () {
  var API = "/api/words"; // 서버 주소가 다르면 여기만 바꾸세요.
  var CACHE_KEY = "shared-words-cache-v1";
  var TIMEOUT_MS = 5000;

  function normalize(list) {
    var out = [],
      seen = {};
    (Array.isArray(list) ? list : []).forEach(function (w) {
      if (!w) return;
      var en = String(w.en == null ? "" : w.en).trim();
      var ko = String(w.ko == null ? "" : w.ko).trim();
      if (!en || !ko) return;
      var k = en.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push({ en: en, ko: ko });
    });
    return out;
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? normalize(JSON.parse(raw)) : [];
    } catch (e) {
      return [];
    }
  }
  function writeCache(list) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(list));
    } catch (e) {}
  }

  function request(method, body) {
    var ctrl =
      typeof AbortController === "function" ? new AbortController() : null;
    var timer = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, TIMEOUT_MS)
      : null;
    var opts = {
      method: method,
      cache: "no-store",
      credentials: "same-origin", // 로그인(Clerk) 쿠키가 같이 전달됩니다.
      headers: { "Content-Type": "application/json" },
    };
    if (body) opts.body = JSON.stringify(body);
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(API, opts)
      .then(function (r) {
        if (timer) clearTimeout(timer);
        if (!r.ok) {
          var err = new Error("HTTP " + r.status);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .catch(function (e) {
        if (timer) clearTimeout(timer);
        throw e;
      });
  }

  var api = (window.SharedWords = {
    canEdit: true,
    normalize: normalize,

    load: function () {
      return request("GET")
        .then(function (d) {
          if (d && typeof d.canEdit === "boolean") api.canEdit = d.canEdit;
          var list = normalize(d && d.words);
          writeCache(list);
          return list;
        })
        .catch(function () {
          var c = readCache();
          return c.length ? c : null;
        });
    },

    save: function (list) {
      var clean = normalize(list);
      return request("PUT", { words: clean })
        .then(function () {
          writeCache(clean);
          return { ok: true, count: clean.length };
        })
        .catch(function (e) {
          return {
            ok: false,
            status: e && e.status,
            error: String(e && e.message ? e.message : e),
          };
        });
    },
  });
})();
