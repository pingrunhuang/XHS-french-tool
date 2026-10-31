(function () {
  "use strict";

  var APP_VERSION = "1.0.4";
  var STORAGE_MIN_CLIENT_VERSION = 9460;
  var WINDOW_INFO_MIN_CLIENT_VERSION = 9490;
  var BRIDGE_TIMEOUT_MS = 1500;
  var STORAGE_KEY = "french_daily5_progress_v1";
  var LIKES_KEY = "french_daily5_likes_v1";
  var FAVS_KEY = "french_daily5_favs_v1";

  var bank = (window.FRENCH_WORD_BANK && window.FRENCH_WORD_BANK.words) || [];
  var passages =
    (window.FRENCH_PASSAGES && window.FRENCH_PASSAGES.passages) || [];

  var state = {
    tab: "flash",
    dayKey: "",
    daily: [],
    flashIndex: 0,
    quizOrder: [],
    quizIndex: 0,
    quizScore: 0,
    quizAnswered: false,
    ttsReady: false,
    ttsNote: "",
    likes: { words: {}, passages: {} },
    favs: { words: {}, passages: {} },
    activePassageId: null,
    readRate: 1,
    interacted: false
  };

  // Passage reader: one utterance per sentence. Pause = cancel + remember the
  // sentence index, resume = speak that sentence again. This avoids
  // speechSynthesis.pause()/resume(), which are unreliable on iOS WebKit, and
  // gives exact sentence tracking for the highlight.
  var reader = {
    status: "idle", // idle | playing | paused
    passageId: null,
    sentences: [],
    index: 0,
    token: 0,
    finished: false
  };
  var currentUtterance = null; // keep a ref so iOS does not GC it before onend
  var toastTimer = null;
  var speakWatchdog = null;
  var buildVersionPromise = null;

  // Resolve with `fallback` if `p` does not settle within `ms` (or rejects /
  // is not a thenable). Container bridge calls must never block the UI.
  function withTimeout(p, ms, fallback) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        resolve(fallback);
      }, ms);
      function finish(v) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(v);
      }
      if (!p || typeof p.then !== "function") {
        finish(fallback);
        return;
      }
      p.then(finish, function () {
        finish(fallback);
      });
    });
  }

  function showToast(msg, ms) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast is-show";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.className = "toast";
    }, ms || 2200);
  }

  // Wrap every UI handler: one runtime error must never leave a button dead
  // without feedback.
  function safe(fn) {
    return function (e) {
      state.interacted = true;
      try {
        return fn.call(this, e);
      } catch (err) {
        if (window.console && console.error) console.error(err);
        showToast("出了点小问题，请再点一次");
      }
    };
  }

  function $(id) {
    return document.getElementById(id);
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function hashString(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Stratified daily pick: one word from each CLB 1–5 when possible.
  // Seeded shuffle within each band so the same dayKey always yields the same five.
  // Empty bands are filled from the nearest band(s).
  function pickDaily(words, dayKey, count) {
    if (!words.length) return [];
    var want = typeof count === "number" ? count : 5;
    var bands = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    var untagged = [];
    var i;
    for (i = 0; i < words.length; i++) {
      var w = words[i];
      var c = w && w.clb;
      if (c === 1 || c === 2 || c === 3 || c === 4 || c === 5) bands[c].push(w);
      else untagged.push(w);
    }
    // Untagged words are treated as CLB3 (mid) for fallback mix.
    for (i = 0; i < untagged.length; i++) bands[3].push(untagged[i]);

    function shuffleBand(arr, salt) {
      return shuffleCopy(arr, dayKey + "|" + salt);
    }

    var out = [];
    var used = {};
    var order = [1, 2, 3, 4, 5];
    for (i = 0; i < order.length && out.length < want; i++) {
      var clb = order[i];
      var shuffled = shuffleBand(bands[clb], "clb" + clb);
      var picked = null;
      var k;
      for (k = 0; k < shuffled.length; k++) {
        if (!used[shuffled[k].id]) {
          picked = shuffled[k];
          break;
        }
      }
      if (!picked) {
        // nearest bands: clb-1, clb+1, then expand
        var delta;
        for (delta = 1; delta <= 4 && !picked; delta++) {
          var sides = [clb - delta, clb + delta];
          var s;
          for (s = 0; s < sides.length && !picked; s++) {
            var nb = sides[s];
            if (!bands[nb]) continue;
            var alt = shuffleBand(bands[nb], "clb" + clb + "-fb" + nb);
            for (k = 0; k < alt.length; k++) {
              if (!used[alt[k].id]) {
                picked = alt[k];
                break;
              }
            }
          }
        }
      }
      if (picked) {
        used[picked.id] = true;
        out.push(picked);
      }
    }
    // If still short (tiny banks), fill from full seeded shuffle.
    if (out.length < want) {
      var rest = shuffleBand(words, "fill");
      for (i = 0; i < rest.length && out.length < want; i++) {
        if (!used[rest[i].id]) {
          used[rest[i].id] = true;
          out.push(rest[i]);
        }
      }
    }
    return out;
  }

  function shuffleCopy(arr, seedStr) {
    var rnd = mulberry32(hashString(seedStr));
    var copy = arr.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = copy[i];
      copy[i] = copy[j];
      copy[j] = t;
    }
    return copy;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function genderLabel(w) {
    if (!w) return "";
    if (w.pos === "v") return "动词";
    if (w.pos === "adj") return "形容词";
    if (w.gender === "m") return "阳性";
    if (w.gender === "f") return "阴性";
    return "";
  }

  function readBuildVersion(launchOptions) {
    var miniToolEnv = launchOptions && launchOptions.miniToolEnv;
    return Number(miniToolEnv && miniToolEnv.buildVersion) || 0;
  }

  function getClientVersion(buildVersion) {
    return Math.floor((Number(buildVersion) || 0) / 1000);
  }

  function isClientVersionAtLeast(buildVersion, minimumClientVersion) {
    return getClientVersion(buildVersion) >= minimumClientVersion;
  }

  function getBuildVersion() {
    var xhs = window.xhs;
    var syncBuildVersion = readBuildVersion(xhs && xhs.launchOptions);
    if (syncBuildVersion) {
      return Promise.resolve(syncBuildVersion);
    }
    if (buildVersionPromise) return buildVersionPromise;
    var miniTool = xhs && xhs.miniTool;
    if (!miniTool || typeof miniTool.getLaunchOptions !== "function") {
      return Promise.resolve(0);
    }
    var pending;
    try {
      pending = miniTool.getLaunchOptions();
    } catch (error) {
      return Promise.resolve(0);
    }
    buildVersionPromise = withTimeout(pending, BRIDGE_TIMEOUT_MS, null).then(
      function (launchOptions) {
        return readBuildVersion(launchOptions);
      }
    );
    return buildVersionPromise;
  }

  function setLocalData(key, data) {
    var serializedData;
    try {
      serializedData = JSON.stringify(data);
    } catch (error) {
      return Promise.resolve(false);
    }
    if (typeof serializedData !== "string") return Promise.resolve(false);

    return getBuildVersion().then(function (buildVersion) {
      var miniTool = window.xhs && window.xhs.miniTool;
      if (
        isClientVersionAtLeast(buildVersion, STORAGE_MIN_CLIENT_VERSION) &&
        miniTool &&
        typeof miniTool.setStorage === "function"
      ) {
        var pendingSet;
        try {
          pendingSet = miniTool.setStorage({ key: key, data: serializedData });
        } catch (error) {
          return false;
        }
        return withTimeout(
          pendingSet && typeof pendingSet.then === "function"
            ? pendingSet.then(function () {
                return true;
              })
            : null,
          BRIDGE_TIMEOUT_MS,
          false
        );
      }
      try {
        localStorage.setItem(key, serializedData);
        return true;
      } catch (error) {
        return false;
      }
    });
  }

  function getLocalData(key) {
    return getBuildVersion().then(function (buildVersion) {
      var miniTool = window.xhs && window.xhs.miniTool;
      if (
        isClientVersionAtLeast(buildVersion, STORAGE_MIN_CLIENT_VERSION) &&
        miniTool &&
        typeof miniTool.getStorage === "function"
      ) {
        var pendingGet;
        try {
          pendingGet = miniTool.getStorage({ key: key });
        } catch (error) {
          return null;
        }
        return withTimeout(pendingGet, BRIDGE_TIMEOUT_MS, null).then(function (res) {
          if (!res || res.data == null || res.data === "") return null;
          try {
            return JSON.parse(res.data);
          } catch (e) {
            return null;
          }
        });
      }
      try {
        var raw = localStorage.getItem(key);
        if (raw == null || raw === "") return null;
        return JSON.parse(raw);
      } catch (error) {
        return null;
      }
    });
  }

  function normalizeMapBucket(raw) {
    var out = { words: {}, passages: {} };
    if (!raw || typeof raw !== "object") return out;
    var wk = raw.words;
    var pk = raw.passages;
    var k;
    if (wk && typeof wk === "object") {
      for (k in wk) {
        if (Object.prototype.hasOwnProperty.call(wk, k) && wk[k]) out.words[k] = true;
      }
    }
    if (pk && typeof pk === "object") {
      for (k in pk) {
        if (Object.prototype.hasOwnProperty.call(pk, k) && pk[k]) out.passages[k] = true;
      }
    }
    return out;
  }

  function mergeBucket(target, loaded) {
    var kinds = ["words", "passages"];
    var i;
    var k;
    for (i = 0; i < kinds.length; i++) {
      var src = loaded[kinds[i]] || {};
      for (k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[kinds[i]][k] = true;
      }
    }
  }

  function isLiked(kind, id) {
    if (!id) return false;
    return !!(state.likes[kind] && state.likes[kind][id]);
  }

  function isFaved(kind, id) {
    if (!id) return false;
    return !!(state.favs[kind] && state.favs[kind][id]);
  }

  function persistLikes() {
    setLocalData(LIKES_KEY, state.likes).then(function () {});
  }

  function persistFavs() {
    setLocalData(FAVS_KEY, state.favs).then(function () {});
  }

  function toggleLike(kind, id) {
    if (!id || !state.likes[kind]) return;
    if (state.likes[kind][id]) delete state.likes[kind][id];
    else state.likes[kind][id] = true;
    persistLikes();
  }

  function toggleFav(kind, id) {
    if (!id || !state.favs[kind]) return;
    if (state.favs[kind][id]) delete state.favs[kind][id];
    else state.favs[kind][id] = true;
    persistFavs();
  }

  function reactButtonsHtml(kind, id) {
    var liked = isLiked(kind, id);
    var faved = isFaved(kind, id);
    return (
      '<button type="button" class="btn react btn-sm' +
      (liked ? " is-on" : "") +
      '" data-react="like" data-kind="' +
      escapeHtml(kind) +
      '" data-id="' +
      escapeHtml(id) +
      '">' +
      (liked ? "♥ 已赞" : "♡ 点赞") +
      "</button>" +
      '<button type="button" class="btn react fav btn-sm' +
      (faved ? " is-on" : "") +
      '" data-react="fav" data-kind="' +
      escapeHtml(kind) +
      '" data-id="' +
      escapeHtml(id) +
      '">' +
      (faved ? "★ 已藏" : "☆ 收藏") +
      "</button>"
    );
  }

  var TTS_OFF_NOTE =
    "当前环境不支持系统朗读（安卓小红书内常见），可对照音标跟读。";

  function hasTtsApi() {
    return !!(
      window.speechSynthesis &&
      typeof window.speechSynthesis.speak === "function" &&
      typeof window.SpeechSynthesisUtterance === "function"
    );
  }

  // Speech is a progressive enhancement: Android System WebView does not
  // expose the Web Speech API, so every speak control is hidden there instead
  // of rendering buttons that do nothing.
  function detectTts() {
    if (!hasTtsApi()) {
      state.ttsReady = false;
      state.ttsNote = TTS_OFF_NOTE;
      return;
    }
    state.ttsReady = true;
    state.ttsNote =
      "使用设备系统语音（优先 fr-FR）。没有声音时请检查静音键和媒体音量。";
  }

  function disableTts(note) {
    stopSpeak();
    state.ttsReady = false;
    state.ttsNote = note || TTS_OFF_NOTE;
    applyTtsVisibility();
    rerenderCurrent();
  }

  function applyTtsVisibility() {
    var quizSpeak = $("btnQuizSpeak");
    if (quizSpeak) quizSpeak.style.display = state.ttsReady ? "" : "none";
    var readTab = document.querySelector('.tab[data-tab="read"]');
    if (readTab) readTab.textContent = state.ttsReady ? "名著朗读" : "名著短文";
    var readHint = $("readHint");
    if (readHint) {
      readHint.textContent = state.ttsReady
        ? "古典法语名著短文 · 整段朗读可暂停 / 继续 · 点赞收藏仅保存在本机。"
        : "古典法语名著短文 · 法中对照 · 点赞收藏仅保存在本机。";
    }
  }

  function clearSpeakWatchdog() {
    if (speakWatchdog) {
      clearTimeout(speakWatchdog);
      speakWatchdog = null;
    }
  }

  function pickFrenchVoice() {
    try {
      var voices = window.speechSynthesis.getVoices() || [];
      var i;
      for (i = 0; i < voices.length; i++) {
        if (voices[i].lang && voices[i].lang.toLowerCase().indexOf("fr-fr") === 0) {
          return voices[i];
        }
      }
      for (i = 0; i < voices.length; i++) {
        if (voices[i].lang && voices[i].lang.toLowerCase().indexOf("fr") === 0) {
          return voices[i];
        }
      }
    } catch (e) {}
    return null;
  }

  var ALLOWED_RATES = [0.25, 0.5, 0.75, 1];

  function normalizeRate(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!isFinite(n)) return 1;
    var best = 1;
    var bestDiff = 99;
    var i;
    for (i = 0; i < ALLOWED_RATES.length; i++) {
      var d = Math.abs(ALLOWED_RATES[i] - n);
      if (d < bestDiff) {
        bestDiff = d;
        best = ALLOWED_RATES[i];
      }
    }
    return best;
  }

  function rateValue() {
    return normalizeRate(state.readRate);
  }

  function rateLabel(r) {
    if (r === 0.25) return "0.25×";
    if (r === 0.5) return "0.5×";
    if (r === 0.75) return "0.75×";
    return "1×";
  }

  function persistReadRate() {
    // Stored with daily progress so prefs survive reloads; dayKey mismatch still loads rate.
    saveProgress();
  }

  function cancelSpeech() {
    clearSpeakWatchdog();
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
  }

  function stopSpeak() {
    reader.token += 1;
    reader.status = "idle";
    reader.index = 0;
    reader.finished = false;
    cancelSpeech();
    applyReaderUI();
  }

  function speakFrench(text, opts) {
    if (!text) return;
    if (!state.ttsReady) {
      updateTtsNote(true);
      showToast(state.ttsNote || TTS_OFF_NOTE, 2800);
      return;
    }
    opts = opts || {};
    var started = false;
    try {
      if (!opts.queue) {
        window.speechSynthesis.cancel();
      }
      var u = new window.SpeechSynthesisUtterance(String(text));
      currentUtterance = u;
      u.lang = "fr-FR";
      var voice = pickFrenchVoice();
      if (voice) u.voice = voice;
      u.rate = typeof opts.rate === "number" ? opts.rate : rateValue();
      u.onstart = function () {
        started = true;
        clearSpeakWatchdog();
        if (typeof opts.onStart === "function") opts.onStart();
      };
      u.onend = function () {
        started = true;
        clearSpeakWatchdog();
        if (typeof opts.onEnd === "function") opts.onEnd();
      };
      u.onerror = function (ev) {
        clearSpeakWatchdog();
        var reason = ev && ev.error;
        // "interrupted" / "canceled" come from our own cancel(); not a failure.
        if (reason !== "interrupted" && reason !== "canceled") {
          showToast("朗读失败，请检查媒体音量或系统法语语音包，也可对照音标跟读。", 3000);
        }
        if (typeof opts.onError === "function") opts.onError(ev);
      };
      if (!opts.silent) showToast("正在朗读…", 1200);
      clearSpeakWatchdog();
      speakWatchdog = setTimeout(function () {
        speakWatchdog = null;
        if (!started) {
          showToast("没有听到声音？请关闭静音、调大媒体音量，或对照音标跟读。", 3200);
        }
      }, 2500);
      window.speechSynthesis.speak(u);
    } catch (e) {
      clearSpeakWatchdog();
      disableTts("朗读失败。请对照音标跟读，或确认系统已安装法语语音包。");
      showToast(state.ttsNote, 3000);
    }
  }

  function updateTtsNote(warn) {
    var el = $("ttsNote");
    if (!el) return;
    el.textContent = state.ttsNote || "";
    el.className = "tts-note" + (warn || !state.ttsReady ? " warn" : "");
  }

  function splitSentences(text) {
    var src = String(text || "").replace(/\s+/g, " ").trim();
    if (!src) return [];
    var parts = [];
    var buf = "";
    var i;
    for (i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      buf += ch;
      if (ch === "." || ch === "!" || ch === "?" || ch === "…" || ch === "。") {
        var next = src.charAt(i + 1);
        var trimmed = buf.trim();
        if (trimmed) parts.push(trimmed);
        buf = "";
        if (next === " ") {
          // skip one space after terminator
        }
      }
    }
    var rest = buf.trim();
    if (rest) parts.push(rest);
    if (!parts.length && src) parts.push(src);
    return parts;
  }

  function findPassage(id) {
    var i;
    for (i = 0; i < passages.length; i++) {
      if (passages[i].id === id) return passages[i];
    }
    return null;
  }

  function findWord(id) {
    var i;
    for (i = 0; i < bank.length; i++) {
      if (bank[i].id === id) return bank[i];
    }
    return null;
  }

  function saveProgress() {
    var payload = {
      dayKey: state.dayKey,
      flashIndex: state.flashIndex,
      quizIndex: state.quizIndex,
      quizScore: state.quizScore,
      readRate: normalizeRate(state.readRate)
    };
    setLocalData(STORAGE_KEY, payload).then(function () {});
  }

  function loadProgress() {
    return getLocalData(STORAGE_KEY).then(function (data) {
      if (!data) return;
      // Prefer persisted rate even when the calendar day rolled over.
      if (data.readRate !== undefined && data.readRate !== null) {
        state.readRate = normalizeRate(data.readRate);
      } else if (data.readRate === "slow") {
        state.readRate = 0.75;
      } else if (data.readRate === "normal") {
        state.readRate = 1;
      }
      if (data.dayKey !== state.dayKey || state.interacted) return;
      if (typeof data.flashIndex === "number") {
        state.flashIndex = Math.max(0, Math.min(data.flashIndex, state.daily.length - 1));
      }
      if (typeof data.quizIndex === "number") {
        state.quizIndex = Math.max(0, Math.min(data.quizIndex, state.quizOrder.length - 1));
      }
      if (typeof data.quizScore === "number") {
        state.quizScore = Math.max(0, data.quizScore);
      }
    });
  }

  function loadReactions() {
    return Promise.all([getLocalData(LIKES_KEY), getLocalData(FAVS_KEY)]).then(
      function (pair) {
        mergeBucket(state.likes, normalizeMapBucket(pair[0]));
        mergeBucket(state.favs, normalizeMapBucket(pair[1]));
      }
    );
  }

  function switchTab(name) {
    state.tab = name;
    if (name !== "read") stopSpeak();
    var tabs = document.querySelectorAll(".tab");
    var i;
    for (i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      if (t.getAttribute("data-tab") === name) t.classList.add("is-active");
      else t.classList.remove("is-active");
    }
    var panels = ["flash", "gender", "quiz", "read", "fav"];
    for (i = 0; i < panels.length; i++) {
      var p = $("panel-" + panels[i]);
      if (!p) continue;
      if (panels[i] === name) p.classList.add("is-active");
      else p.classList.remove("is-active");
    }
    if (name === "read") {
      if (state.activePassageId) showPassageDetail(state.activePassageId);
      else showPassageList();
    }
    if (name === "fav") renderFav();
    if (name === "flash") renderFlash();
  }

  function renderFlash() {
    var w = state.daily[state.flashIndex];
    $("flashIndex").textContent = state.daily.length
      ? state.flashIndex + 1 + " / " + state.daily.length
      : "0 / 0";
    $("flashMeta").textContent = "今日 · " + state.dayKey;
    var card = $("flashCard");
    if (!w) {
      card.innerHTML = '<div class="empty">词库为空</div>';
      return;
    }
    var html = "";
    html += '<div class="pill-row">';
    html += '<span class="pill">' + escapeHtml(genderLabel(w) || w.pos) + "</span>";
    if (w.article) {
      html +=
        '<span class="pill orange">' +
        escapeHtml(w.article) +
        " " +
        escapeHtml(w.word) +
        "</span>";
    }
    html +=
      '<span class="pill muted">今日第 ' + (state.flashIndex + 1) + " 词</span>";
    html += "</div>";
    html += '<div class="word-fr">' + escapeHtml(w.word) + "</div>";
    html += '<div class="word-zh">' + escapeHtml(w.zh) + "</div>";
    html += '<div class="word-ipa">' + escapeHtml(w.ipa || "") + "</div>";
    html += '<div class="actions">';
    if (state.ttsReady) {
      html += '<button type="button" class="btn orange btn-sm" data-speak-word="1">朗读单词</button>';
    }
    html += reactButtonsHtml("words", w.id);
    html += "</div>";
    if (w.genderTip) {
      html +=
        '<div class="example" style="margin-top:12px;"><div class="tip" style="margin:0;">' +
        escapeHtml(w.genderTip) +
        "</div></div>";
    }
    var ex = w.examples || [];
    var i;
    for (i = 0; i < ex.length; i++) {
      html += '<div class="example">';
      html += '<div class="fr">' + escapeHtml(ex[i].fr) + "</div>";
      html += '<div class="zh">' + escapeHtml(ex[i].zh) + "</div>";
      if (ex[i].tip) html += '<div class="tip">' + escapeHtml(ex[i].tip) + "</div>";
      if (state.ttsReady) {
        html +=
          '<div class="ex-actions"><button type="button" class="btn secondary btn-sm" data-speak-ex="' +
          i +
          '">朗读例句</button></div>';
      }
      html += "</div>";
    }
    card.innerHTML = html;
  }

  function renderGenderList(query) {
    var q = (query || "").trim().toLowerCase();
    var list = $("genderList");
    var nouns = [];
    var i;
    for (i = 0; i < bank.length; i++) {
      var w = bank[i];
      if (w.pos !== "n") continue;
      if (!q) {
        nouns.push(w);
        continue;
      }
      var hay =
        (w.word || "") +
        " " +
        (w.zh || "") +
        " " +
        (w.article || "") +
        " " +
        (w.genderTip || "");
      if (hay.toLowerCase().indexOf(q) !== -1) nouns.push(w);
    }
    if (!nouns.length) {
      list.innerHTML = '<div class="empty">没有匹配的名词</div>';
      return;
    }
    var max = q ? nouns.length : Math.min(nouns.length, 30);
    var html = "";
    for (i = 0; i < max; i++) {
      var item = nouns[i];
      html += '<div class="gender-item">';
      html += '<div class="head">';
      if (item.article) {
        html += '<span class="article">' + escapeHtml(item.article) + "</span>";
      }
      html += '<span class="w">' + escapeHtml(item.word) + "</span>";
      html += '<span class="zh">' + escapeHtml(item.zh) + "</span>";
      html += "</div>";
      html +=
        '<div class="pill-row" style="margin-top:8px;"><span class="pill">' +
        escapeHtml(genderLabel(item)) +
        "</span>";
      if (item.ipa) html += '<span class="pill muted">' + escapeHtml(item.ipa) + "</span>";
      html += "</div>";
      if (item.genderTip) {
        html += '<div class="tip">' + escapeHtml(item.genderTip) + "</div>";
      }
      if (state.ttsReady) {
        html +=
          '<div class="actions" style="margin-top:10px;"><button type="button" class="btn secondary btn-sm" data-gender-speak="' +
          escapeHtml(item.id) +
          '">朗读</button></div>';
      }
      html += "</div>";
    }
    if (!q && nouns.length > max) {
      html +=
        '<div class="empty">已显示前 ' +
        max +
        " 个名词，输入关键词继续筛选（共 " +
        nouns.length +
        "）</div>";
    }
    list.innerHTML = html;
  }

  function currentQuizWord() {
    return state.quizOrder[state.quizIndex] || null;
  }

  function renderQuiz() {
    var w = currentQuizWord();
    $("quizScore").textContent =
      "得分 " +
      state.quizScore +
      " · 第 " +
      (state.quizIndex + 1) +
      " / " +
      state.quizOrder.length +
      " 题";
    var feedback = $("quizFeedback");
    feedback.className = "feedback";
    feedback.textContent = "";
    state.quizAnswered = false;
    $("quizInput").value = "";
    $("quizInput").disabled = false;
    $("btnQuizCheck").disabled = false;
    if (!w || !w.cloze) {
      $("quizPrompt").textContent = "暂无题目";
      $("quizZh").textContent = "";
      return;
    }
    $("quizPrompt").textContent = w.cloze.prompt;
    $("quizZh").textContent = w.cloze.zh || "";
  }

  function checkQuiz() {
    var w = currentQuizWord();
    if (!w || !w.cloze || state.quizAnswered) return;
    var input = ($("quizInput").value || "").trim();
    var answers = w.cloze.answers || [w.cloze.answer];
    var ok = false;
    var i;
    for (i = 0; i < answers.length; i++) {
      if (String(answers[i]).toLowerCase() === input.toLowerCase()) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      var normIn = input.replace(/\s+/g, " ");
      for (i = 0; i < answers.length; i++) {
        if (
          String(answers[i]).replace(/\s+/g, " ").toLowerCase() ===
          normIn.toLowerCase()
        ) {
          ok = true;
          break;
        }
      }
    }
    state.quizAnswered = true;
    $("quizInput").disabled = true;
    $("btnQuizCheck").disabled = true;
    var feedback = $("quizFeedback");
    if (ok) {
      state.quizScore += 1;
      feedback.className = "feedback is-show ok";
      feedback.innerHTML =
        "正确！<br/>" +
        escapeHtml(w.cloze.full) +
        (w.cloze.zh ? "<br/>" + escapeHtml(w.cloze.zh) : "");
    } else {
      feedback.className = "feedback is-show bad";
      feedback.innerHTML =
        "再想想。参考答案：<strong>" +
        escapeHtml(w.cloze.answer) +
        "</strong><br/>完整句子：" +
        escapeHtml(w.cloze.full) +
        (w.cloze.zh ? "<br/>" + escapeHtml(w.cloze.zh) : "");
    }
    $("quizScore").textContent =
      "得分 " +
      state.quizScore +
      " · 第 " +
      (state.quizIndex + 1) +
      " / " +
      state.quizOrder.length +
      " 题";
    saveProgress();
  }

  function nextQuiz() {
    if (state.quizIndex < state.quizOrder.length - 1) {
      state.quizIndex += 1;
    } else {
      state.quizIndex = 0;
      state.quizOrder = shuffleCopy(bank.slice(), state.dayKey + "|quiz|" + Date.now());
      state.quizScore = 0;
    }
    saveProgress();
    renderQuiz();
  }

  function showPassageList() {
    state.activePassageId = null;
    stopSpeak();
    $("readListView").style.display = "block";
    $("readDetailView").style.display = "none";
    var box = $("passageList");
    if (!passages.length) {
      box.innerHTML = '<div class="empty">暂无名著短文</div>';
      return;
    }
    var html = "";
    var i;
    for (i = 0; i < passages.length; i++) {
      var p = passages[i];
      var preview = (p.fr || "").slice(0, 72);
      if ((p.fr || "").length > 72) preview += "…";
      html +=
        '<button type="button" class="list-btn" data-open-passage="' +
        escapeHtml(p.id) +
        '">';
      html += '<div class="lb-title">' + escapeHtml(p.title) + "</div>";
      html +=
        '<div class="lb-meta">' +
        escapeHtml(p.author) +
        " · " +
        escapeHtml(p.work) +
        (p.level ? " · " + escapeHtml(p.level) : "") +
        (isFaved("passages", p.id) ? " · ★" : "") +
        (isLiked("passages", p.id) ? " · ♥" : "") +
        "</div>";
      html += '<div class="lb-preview">' + escapeHtml(preview) + "</div>";
      html += "</button>";
    }
    box.innerHTML = html;
  }

  function scrollSentenceIntoView(el) {
    var main = document.querySelector(".main");
    if (!el || !main) return;
    var mr = main.getBoundingClientRect();
    var er = el.getBoundingClientRect();
    var bandTop = mr.top + mr.height * 0.2;
    var bandBottom = mr.top + mr.height * 0.7;
    if (er.top >= bandTop && er.bottom <= bandBottom) return;
    var target = main.scrollTop + (er.top - mr.top) - mr.height * 0.35;
    if (target < 0) target = 0;
    if (typeof main.scrollTo === "function" && "scrollBehavior" in document.documentElement.style) {
      main.scrollTo({ top: target, behavior: "smooth" });
    } else {
      main.scrollTop = target;
    }
  }

  // Mark the sentence being read (idx) or clear all (-1).
  function highlightSentence(idx, paused) {
    var root = $("passageFrText");
    if (!root) return;
    var nodes = root.querySelectorAll(".sent");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (i === idx) {
        nodes[i].classList.add("is-playing");
        if (paused) nodes[i].classList.add("is-paused");
        else nodes[i].classList.remove("is-paused");
      } else {
        nodes[i].classList.remove("is-playing");
        nodes[i].classList.remove("is-paused");
      }
    }
    if (idx >= 0 && nodes[idx]) scrollSentenceIntoView(nodes[idx]);
  }

  // Sync highlight, buttons and progress text with the reader state.
  function applyReaderUI() {
    var onThisPassage = reader.passageId && reader.passageId === state.activePassageId;
    var active = onThisPassage && reader.status !== "idle";
    highlightSentence(active ? reader.index : -1, reader.status === "paused");
    var btn = $("btnPassageSpeak");
    if (btn) {
      if (active && reader.status === "playing") btn.textContent = "暂停";
      else if (active && reader.status === "paused") btn.textContent = "继续";
      else btn.textContent = onThisPassage && reader.finished ? "再读一遍" : "开始朗读";
    }
    var stop = $("btnPassageStop");
    if (stop) stop.disabled = !active;
    var prog = $("readProgress");
    if (prog) {
      var total = splitSentences((findPassage(state.activePassageId) || {}).fr).length;
      if (active) {
        prog.textContent =
          (reader.status === "paused" ? "已暂停 · " : "朗读中 · ") +
          "第 " + (reader.index + 1) + " / " + reader.sentences.length + " 句";
      } else if (onThisPassage && reader.finished) {
        prog.textContent = "已读完 · 共 " + total + " 句";
      } else {
        prog.textContent = "共 " + total + " 句 · 读到哪句就高亮哪句";
      }
    }
  }

  function speakCurrentSentence(queue) {
    var token = ++reader.token;
    var idx = reader.index;
    applyReaderUI();
    speakFrench(reader.sentences[idx], {
      rate: rateValue(), // read per sentence, so a speed change applies from the next one
      queue: queue,
      silent: true,
      onEnd: function () {
        if (token !== reader.token || reader.status !== "playing") return;
        if (reader.index + 1 >= reader.sentences.length) {
          reader.status = "idle";
          reader.index = 0;
          reader.finished = true;
          reader.token += 1;
          applyReaderUI();
          return;
        }
        reader.index += 1;
        speakCurrentSentence(true);
      },
      onError: function (ev) {
        if (token !== reader.token) return;
        var reason = ev && ev.error;
        if (reason === "interrupted" || reason === "canceled") return;
        stopSpeak();
      }
    });
  }

  function startReading() {
    var p = findPassage(state.activePassageId);
    if (!p) return;
    if (!state.ttsReady) {
      updateTtsNote(true);
      showToast(state.ttsNote || TTS_OFF_NOTE, 2800);
      return;
    }
    var sentences = splitSentences(p.fr);
    if (!sentences.length) return;
    reader.passageId = p.id;
    reader.sentences = sentences;
    reader.index = 0;
    reader.finished = false;
    reader.status = "playing";
    showToast("正在朗读…", 1200);
    speakCurrentSentence(false);
  }

  function pauseReading() {
    if (reader.status !== "playing") return;
    reader.status = "paused";
    reader.token += 1; // ignore callbacks from the cancelled utterance
    cancelSpeech();
    applyReaderUI();
  }

  function resumeReading() {
    if (reader.status !== "paused") return;
    reader.status = "playing";
    speakCurrentSentence(false); // restart the paused sentence from its beginning
  }

  function togglePassagePlayback() {
    var onThisPassage = reader.passageId === state.activePassageId;
    if (onThisPassage && reader.status === "playing") pauseReading();
    else if (onThisPassage && reader.status === "paused") resumeReading();
    else startReading();
  }

  function setReadRate(rate) {
    state.readRate = normalizeRate(rate);
    persistReadRate();
    var seg = $("segRate");
    if (seg) {
      var btns = seg.querySelectorAll("button");
      var i;
      var cur = String(state.readRate);
      for (i = 0; i < btns.length; i++) {
        if (btns[i].getAttribute("data-rate") === cur) btns[i].classList.add("is-on");
        else btns[i].classList.remove("is-on");
      }
    }
    if (reader.status === "playing") showToast("语速将从下一句生效", 1400);
    else showToast("语速 " + rateLabel(state.readRate), 1200);
  }

  function showPassageDetail(id) {
    var p = findPassage(id);
    if (!p) {
      showPassageList();
      return;
    }
    if (reader.passageId && reader.passageId !== id) {
      stopSpeak();
      reader.passageId = null;
    }
    state.activePassageId = id;
    $("readListView").style.display = "none";
    $("readDetailView").style.display = "block";
    var card = $("passageCard");
    var sentences = splitSentences(p.fr);
    var html = "";
    html += '<div class="pill-row">';
    html += '<span class="pill">' + escapeHtml(p.work) + "</span>";
    html += '<span class="pill orange">' + escapeHtml(p.author) + "</span>";
    if (p.level) html += '<span class="pill muted">' + escapeHtml(p.level) + "</span>";
    html += "</div>";
    html +=
      '<div class="word-fr" style="font-size:22px;margin-top:10px;">' +
      escapeHtml(p.title) +
      "</div>";
    html += '<div class="actions" style="margin-top:10px;">';
    html += reactButtonsHtml("passages", p.id);
    html += "</div>";
    html += '<div class="passage-fr" id="passageFrText" style="margin-top:14px;">';
    var i;
    for (i = 0; i < sentences.length; i++) {
      html +=
        '<span class="sent" data-sent="' +
        i +
        '">' +
        escapeHtml(sentences[i]) +
        (i < sentences.length - 1 ? " " : "") +
        "</span>";
    }
    html += "</div>";
    html += '<div class="passage-zh">' + escapeHtml(p.zh || "") + "</div>";

    if (state.ttsReady) {
      html += '<div class="opt-row">';
      html += '<div class="opt-label">语速（跟读）</div>';
      html += '<div class="seg" id="segRate">';
      var ri;
      for (ri = 0; ri < ALLOWED_RATES.length; ri++) {
        var rv = ALLOWED_RATES[ri];
        html +=
          '<button type="button" data-rate="' +
          rv +
          '"' +
          (normalizeRate(state.readRate) === rv ? ' class="is-on"' : "") +
          ">" +
          rateLabel(rv) +
          "</button>";
      }
      html += "</div>";
      html += "</div>";

      html += '<div class="actions" style="margin-top:12px;">';
      html +=
        '<button type="button" class="btn orange" id="btnPassageSpeak" style="-webkit-flex:1;flex:1;">开始朗读</button>';
      html += '<button type="button" class="btn secondary" id="btnPassageStop" disabled>停止</button>';
      html += "</div>";
      html += '<div class="read-progress" id="readProgress"></div>';
    }
    html += '<div class="tts-note" id="ttsNote"></div>';
    card.innerHTML = html;
    updateTtsNote(!state.ttsReady);
    applyReaderUI();
  }

  function renderFav() {
    var box = $("favContent");
    var wordIds = Object.keys(state.favs.words || {});
    var passIds = Object.keys(state.favs.passages || {});
    var html = "";
    html += '<div class="fav-section-title">收藏的单词（' + wordIds.length + "）</div>";
    if (!wordIds.length) {
      html += '<div class="empty">还没有收藏单词。在闪卡页点 ☆ 收藏。</div>';
    } else {
      var i;
      for (i = 0; i < wordIds.length; i++) {
        var w = findWord(wordIds[i]);
        if (!w) continue;
        html += '<div class="card" style="margin-bottom:8px;">';
        html +=
          '<div class="word-fr" style="font-size:22px;margin-top:0;">' +
          escapeHtml(w.word) +
          "</div>";
        html += '<div class="word-zh">' + escapeHtml(w.zh) + "</div>";
        html += '<div class="word-ipa">' + escapeHtml(w.ipa || "") + "</div>";
        html += '<div class="actions">';
        if (state.ttsReady) {
          html +=
            '<button type="button" class="btn secondary btn-sm" data-fav-speak-word="' +
            escapeHtml(w.id) +
            '">朗读</button>';
        }
        html += reactButtonsHtml("words", w.id);
        html += "</div></div>";
      }
    }
    html += '<div class="fav-section-title">收藏的名著（' + passIds.length + "）</div>";
    if (!passIds.length) {
      html += '<div class="empty">还没有收藏短文。在名著详情页点 ☆ 收藏。</div>';
    } else {
      for (i = 0; i < passIds.length; i++) {
        var p = findPassage(passIds[i]);
        if (!p) continue;
        html +=
          '<button type="button" class="list-btn" data-fav-open-passage="' +
          escapeHtml(p.id) +
          '">';
        html += '<div class="lb-title">' + escapeHtml(p.title) + "</div>";
        html +=
          '<div class="lb-meta">' +
          escapeHtml(p.author) +
          " · " +
          escapeHtml(p.work) +
          "</div>";
        html += "</button>";
      }
    }
    box.innerHTML = html;
  }

  function handleReactClick(t) {
    var react = t.getAttribute("data-react");
    var kind = t.getAttribute("data-kind");
    var id = t.getAttribute("data-id");
    if (!react || !kind || !id) return false;
    if (react === "like") toggleLike(kind, id);
    else if (react === "fav") toggleFav(kind, id);
    else return false;
    rerenderCurrent();
    showToast(
      react === "like"
        ? isLiked(kind, id) ? "已点赞" : "已取消点赞"
        : isFaved(kind, id) ? "已收藏，可在「收藏」页查看" : "已取消收藏",
      1400
    );
    return true;
  }

  function rerenderCurrent() {
    if (state.tab === "flash") renderFlash();
    else if (state.tab === "gender") renderGenderList($("genderSearch").value || "");
    else if (state.tab === "read" && state.activePassageId) showPassageDetail(state.activePassageId);
    else if (state.tab === "read") showPassageList();
    else if (state.tab === "fav") renderFav();
  }

  function renderAll() {
    applyTtsVisibility();
    renderFlash();
    renderGenderList($("genderSearch").value || "");
    renderQuiz();
    if (state.activePassageId) showPassageDetail(state.activePassageId);
    else showPassageList();
    renderFav();
    updateTtsNote(!state.ttsReady);
  }

  // Keep the header (and the tab row under it) clear of the container's
  // status bar / top-right capsule buttons. getWindowInfo is client 9.49+.
  function adjustForContainerChrome() {
    var miniTool = window.xhs && window.xhs.miniTool;
    if (!miniTool || typeof miniTool.getWindowInfo !== "function") return;
    getBuildVersion()
      .then(function (buildVersion) {
        if (!isClientVersionAtLeast(buildVersion, WINDOW_INFO_MIN_CLIENT_VERSION)) return null;
        var pending;
        try {
          pending = miniTool.getWindowInfo();
        } catch (error) {
          return null;
        }
        return withTimeout(pending, BRIDGE_TIMEOUT_MS, null);
      })
      .then(function (info) {
        if (!info) return;
        var top = 0;
        if (info.safeArea && typeof info.safeArea.top === "number") top = info.safeArea.top;
        var mb = info.menuButtons || {};
        var keys = ["back", "me", "share"];
        var i;
        for (i = 0; i < keys.length; i++) {
          var r = mb[keys[i]];
          if (r && typeof r.bottom === "number" && r.bottom > top) top = r.bottom;
        }
        if (!(top > 0) || top > 160) return;
        var header = document.querySelector(".header");
        if (header) header.style.paddingTop = Math.ceil(top + 8) + "px";
      })
      .catch(function () {});
  }

  function bindEvents() {
    function on(target, type, fn) {
      if (!target) return;
      target.addEventListener(type, safe(fn));
    }

    function onHidden() {
      if (reader.status === "playing") pauseReading();
      else cancelSpeech();
    }
    document.addEventListener("visibilitychange", safe(function () {
      if (document.hidden) onHidden();
    }));
    window.addEventListener("pagehide", safe(onHidden));

    // Lets :active press states render on iOS WebKit.
    document.addEventListener("touchstart", function () {}, { passive: true });

    var tabs = $("tabs");
    on(tabs, "click", function (e) {
      var t = e.target;
      while (t && t !== tabs && !(t.getAttribute && t.getAttribute("data-tab"))) {
        t = t.parentNode;
      }
      if (!t || !t.getAttribute) return;
      var name = t.getAttribute("data-tab");
      if (name) switchTab(name);
    });

    on($("btnPrev"), "click", function () {
      if (!state.daily.length) return;
      state.flashIndex = (state.flashIndex - 1 + state.daily.length) % state.daily.length;
      saveProgress();
      renderFlash();
    });
    on($("btnNext"), "click", function () {
      if (!state.daily.length) return;
      state.flashIndex = (state.flashIndex + 1) % state.daily.length;
      saveProgress();
      renderFlash();
    });

    on($("flashCard"), "click", function (e) {
      var t = e.target;
      while (t && t !== $("flashCard")) {
        if (t.getAttribute && t.getAttribute("data-react")) {
          handleReactClick(t);
          return;
        }
        if (t.getAttribute && t.getAttribute("data-speak-word")) {
          var w = state.daily[state.flashIndex];
          if (w) speakFrench(w.word, { rate: rateValue() });
          return;
        }
        if (t.getAttribute && t.getAttribute("data-speak-ex") != null) {
          var idx = Number(t.getAttribute("data-speak-ex"));
          var cur = state.daily[state.flashIndex];
          if (cur && cur.examples && cur.examples[idx]) {
            speakFrench(cur.examples[idx].fr, { rate: rateValue() });
          }
          return;
        }
        t = t.parentNode;
      }
    });

    var searchTimer = null;
    on($("genderSearch"), "input", function () {
      var val = $("genderSearch").value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        renderGenderList(val);
      }, 120);
    });

    on($("genderList"), "click", function (e) {
      var t = e.target;
      while (t && t !== $("genderList")) {
        if (t.getAttribute && t.getAttribute("data-gender-speak")) {
          var id = t.getAttribute("data-gender-speak");
          var i;
          for (i = 0; i < bank.length; i++) {
            if (bank[i].id === id) {
              speakFrench(bank[i].word, { rate: rateValue() });
              break;
            }
          }
          return;
        }
        t = t.parentNode;
      }
    });

    on($("btnQuizCheck"), "click", checkQuiz);
    on($("btnQuizSkip"), "click", function () {
      nextQuiz();
    });
    on($("btnQuizNext"), "click", function () {
      nextQuiz();
    });
    on($("btnQuizSpeak"), "click", function () {
      var w = currentQuizWord();
      if (w && w.cloze && w.cloze.full) speakFrench(w.cloze.full, { rate: rateValue() });
    });
    on($("quizInput"), "keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        checkQuiz();
      }
    });

    on($("btnReadBack"), "click", function () {
      stopSpeak();
      showPassageList();
    });

    on($("passageList"), "click", function (e) {
      var t = e.target;
      while (t && t !== $("passageList")) {
        if (t.getAttribute && t.getAttribute("data-open-passage")) {
          showPassageDetail(t.getAttribute("data-open-passage"));
          return;
        }
        t = t.parentNode;
      }
    });

    on($("passageCard"), "click", function (e) {
      var t = e.target;
      while (t && t !== $("passageCard")) {
        if (t.getAttribute && t.getAttribute("data-react")) {
          handleReactClick(t);
          return;
        }
        if (t.getAttribute && t.getAttribute("data-rate")) {
          setReadRate(t.getAttribute("data-rate"));
          return;
        }
        if (t.id === "btnPassageSpeak") {
          togglePassagePlayback();
          return;
        }
        if (t.id === "btnPassageStop") {
          stopSpeak();
          return;
        }
        t = t.parentNode;
      }
    });

    on($("favContent"), "click", function (e) {
      var t = e.target;
      while (t && t !== $("favContent")) {
        if (t.getAttribute && t.getAttribute("data-react")) {
          handleReactClick(t);
          return;
        }
        if (t.getAttribute && t.getAttribute("data-fav-speak-word")) {
          var ww = findWord(t.getAttribute("data-fav-speak-word"));
          if (ww) speakFrench(ww.word, { rate: rateValue() });
          return;
        }
        if (t.getAttribute && t.getAttribute("data-fav-open-passage")) {
          var pid = t.getAttribute("data-fav-open-passage");
          switchTab("read");
          showPassageDetail(pid);
          return;
        }
        t = t.parentNode;
      }
    });
  }

  function init() {
    detectTts();
    if (window.speechSynthesis) {
      try {
        window.speechSynthesis.onvoiceschanged = function () {
          if (!state.ttsReady) return;
          updateTtsNote(false);
        };
      } catch (e) {}
    }

    state.dayKey = todayKey();
    state.daily = pickDaily(bank, state.dayKey, 5);
    state.quizOrder = shuffleCopy(bank.slice(), state.dayKey + "|quiz");
    state.flashIndex = 0;
    state.quizIndex = 0;
    state.quizScore = 0;

    $("headerSub").textContent =
      "CLB1–5 · 词库 " +
      bank.length +
      " · 名著 " +
      passages.length +
      " · " +
      state.dayKey;
    var ver = $("appVersion");
    if (ver) ver.textContent = "v" + APP_VERSION;

    bindEvents();
    // Render immediately; never gate the first paint on container bridges.
    renderAll();
    adjustForContainerChrome();

    Promise.all([loadProgress(), loadReactions()]).then(
      function () {
        if (!state.interacted) {
          renderAll();
        } else {
          renderFav();
          if (state.tab === "flash") renderFlash();
        }
      },
      function () {}
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
