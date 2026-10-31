(function () {
  "use strict";

  var STORAGE_MIN_CLIENT_VERSION = 9460;
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
    readMode: "all",
    readRate: "normal",
    speakingSentence: -1
  };

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

  function pickDaily(words, dayKey, count) {
    if (!words.length) return [];
    var rnd = mulberry32(hashString(dayKey + "|french-daily5"));
    var idxs = [];
    var i;
    for (i = 0; i < words.length; i++) idxs.push(i);
    for (i = idxs.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var tmp = idxs[i];
      idxs[i] = idxs[j];
      idxs[j] = tmp;
    }
    var n = Math.min(count, idxs.length);
    var out = [];
    for (i = 0; i < n; i++) out.push(words[idxs[i]]);
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
    var miniTool = xhs && xhs.miniTool;
    if (!miniTool || typeof miniTool.getLaunchOptions !== "function") {
      return Promise.resolve(0);
    }
    return miniTool
      .getLaunchOptions()
      .then(function (launchOptions) {
        return readBuildVersion(launchOptions);
      })
      .catch(function () {
        return 0;
      });
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
        return miniTool
          .setStorage({ key: key, data: serializedData })
          .then(function () {
            return true;
          })
          .catch(function () {
            return false;
          });
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
        return miniTool
          .getStorage({ key: key })
          .then(function (res) {
            if (!res || res.data == null || res.data === "") return null;
            try {
              return JSON.parse(res.data);
            } catch (e) {
              return null;
            }
          })
          .catch(function () {
            return null;
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

  function detectTts() {
    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== "function") {
      state.ttsReady = false;
      state.ttsNote =
        "当前环境不支持系统朗读。请看音标自学，或换一台带法语 TTS 的真机。";
      return;
    }
    state.ttsReady = true;
    state.ttsNote =
      "使用设备系统语音（优先 fr-FR）。不同手机音色与是否含法语包可能不同。";
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

  function rateValue() {
    return state.readRate === "slow" ? 0.75 : 1.0;
  }

  function stopSpeak() {
    state.speakingSentence = -1;
    try {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } catch (e) {}
    highlightSentence(-1);
  }

  function speakFrench(text, opts) {
    if (!text) return;
    if (!state.ttsReady) {
      updateTtsNote(true);
      return;
    }
    opts = opts || {};
    try {
      if (!opts.queue) {
        window.speechSynthesis.cancel();
      }
      var u = new window.SpeechSynthesisUtterance(String(text));
      u.lang = "fr-FR";
      var voice = pickFrenchVoice();
      if (voice) u.voice = voice;
      u.rate = typeof opts.rate === "number" ? opts.rate : rateValue();
      if (typeof opts.onStart === "function") u.onstart = opts.onStart;
      if (typeof opts.onEnd === "function") u.onend = opts.onEnd;
      if (typeof opts.onError === "function") u.onerror = opts.onError;
      window.speechSynthesis.speak(u);
    } catch (e) {
      state.ttsReady = false;
      state.ttsNote = "朗读失败。请查看音标，或确认系统已安装法语语音包。";
      updateTtsNote(true);
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
      quizScore: state.quizScore
    };
    setLocalData(STORAGE_KEY, payload).then(function () {});
  }

  function loadProgress() {
    return getLocalData(STORAGE_KEY).then(function (data) {
      if (!data || data.dayKey !== state.dayKey) return;
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
        state.likes = normalizeMapBucket(pair[0]);
        state.favs = normalizeMapBucket(pair[1]);
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
    html += '<button type="button" class="btn orange btn-sm" data-speak-word="1">朗读单词</button>';
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
      html +=
        '<div class="ex-actions"><button type="button" class="btn secondary btn-sm" data-speak-ex="' +
        i +
        '">朗读例句</button></div>';
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
      html +=
        '<div class="actions" style="margin-top:10px;"><button type="button" class="btn secondary btn-sm" data-gender-speak="' +
        escapeHtml(item.id) +
        '">朗读</button></div>';
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

  function highlightSentence(idx) {
    var root = $("passageFrText");
    if (!root) return;
    var nodes = root.querySelectorAll(".sent");
    var i;
    for (i = 0; i < nodes.length; i++) {
      if (i === idx) nodes[i].classList.add("is-playing");
      else nodes[i].classList.remove("is-playing");
    }
  }

  function showPassageDetail(id) {
    var p = findPassage(id);
    if (!p) {
      showPassageList();
      return;
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

    html += '<div class="opt-row">';
    html += '<div class="opt-label">朗读模式</div>';
    html += '<div class="seg" id="segMode">';
    html +=
      '<button type="button" data-mode="all"' +
      (state.readMode === "all" ? ' class="is-on"' : "") +
      ">整段朗读</button>";
    html +=
      '<button type="button" data-mode="sent"' +
      (state.readMode === "sent" ? ' class="is-on"' : "") +
      ">按句朗读</button>";
    html += "</div>";
    html += '<div class="opt-label">语速</div>';
    html += '<div class="seg" id="segRate">';
    html +=
      '<button type="button" data-rate="slow"' +
      (state.readRate === "slow" ? ' class="is-on"' : "") +
      ">慢速</button>";
    html +=
      '<button type="button" data-rate="normal"' +
      (state.readRate === "normal" ? ' class="is-on"' : "") +
      ">常速</button>";
    html += "</div>";
    html += "</div>";

    html += '<div class="actions" style="margin-top:12px;">';
    html +=
      '<button type="button" class="btn orange" id="btnPassageSpeak" style="-webkit-flex:1;flex:1;">开始朗读</button>';
    html += '<button type="button" class="btn secondary" id="btnPassageStop">停止</button>';
    html += "</div>";
    html += '<div class="tts-note" id="ttsNote"></div>';
    card.innerHTML = html;
    updateTtsNote(!state.ttsReady);
  }

  function speakPassage() {
    var p = findPassage(state.activePassageId);
    if (!p) return;
    if (!state.ttsReady) {
      updateTtsNote(true);
      return;
    }
    stopSpeak();
    var sentences = splitSentences(p.fr);
    if (!sentences.length) return;

    if (state.readMode === "all") {
      speakFrench(p.fr, {
        rate: rateValue(),
        onStart: function () {
          highlightSentence(0);
        },
        onEnd: function () {
          highlightSentence(-1);
        }
      });
      return;
    }

    var idx = 0;
    function speakNext() {
      if (idx >= sentences.length) {
        highlightSentence(-1);
        state.speakingSentence = -1;
        return;
      }
      state.speakingSentence = idx;
      highlightSentence(idx);
      var cur = idx;
      speakFrench(sentences[cur], {
        rate: rateValue(),
        queue: false,
        onEnd: function () {
          if (state.speakingSentence !== cur) return;
          idx += 1;
          speakNext();
        },
        onError: function () {
          highlightSentence(-1);
          state.speakingSentence = -1;
        }
      });
    }
    speakNext();
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
        html +=
          '<button type="button" class="btn secondary btn-sm" data-fav-speak-word="' +
          escapeHtml(w.id) +
          '">朗读</button>';
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
    if (state.tab === "flash") renderFlash();
    else if (state.tab === "read" && state.activePassageId) showPassageDetail(state.activePassageId);
    else if (state.tab === "read") showPassageList();
    else if (state.tab === "fav") renderFav();
    return true;
  }

  function bindEvents() {
    var tabs = $("tabs");
    tabs.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== tabs && !(t.getAttribute && t.getAttribute("data-tab"))) {
        t = t.parentNode;
      }
      if (!t || !t.getAttribute) return;
      var name = t.getAttribute("data-tab");
      if (name) switchTab(name);
    });

    $("btnPrev").addEventListener("click", function () {
      if (!state.daily.length) return;
      state.flashIndex = (state.flashIndex - 1 + state.daily.length) % state.daily.length;
      saveProgress();
      renderFlash();
    });
    $("btnNext").addEventListener("click", function () {
      if (!state.daily.length) return;
      state.flashIndex = (state.flashIndex + 1) % state.daily.length;
      saveProgress();
      renderFlash();
    });

    $("flashCard").addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== $("flashCard")) {
        if (t.getAttribute && t.getAttribute("data-react")) {
          handleReactClick(t);
          return;
        }
        if (t.getAttribute && t.getAttribute("data-speak-word")) {
          var w = state.daily[state.flashIndex];
          if (w) speakFrench(w.word, { rate: 0.92 });
          return;
        }
        if (t.getAttribute && t.getAttribute("data-speak-ex") != null) {
          var idx = Number(t.getAttribute("data-speak-ex"));
          var cur = state.daily[state.flashIndex];
          if (cur && cur.examples && cur.examples[idx]) {
            speakFrench(cur.examples[idx].fr, { rate: 0.92 });
          }
          return;
        }
        t = t.parentNode;
      }
    });

    var searchTimer = null;
    $("genderSearch").addEventListener("input", function () {
      var val = $("genderSearch").value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        renderGenderList(val);
      }, 120);
    });

    $("genderList").addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== $("genderList")) {
        if (t.getAttribute && t.getAttribute("data-gender-speak")) {
          var id = t.getAttribute("data-gender-speak");
          var i;
          for (i = 0; i < bank.length; i++) {
            if (bank[i].id === id) {
              speakFrench(bank[i].word, { rate: 0.92 });
              break;
            }
          }
          return;
        }
        t = t.parentNode;
      }
    });

    $("btnQuizCheck").addEventListener("click", checkQuiz);
    $("btnQuizSkip").addEventListener("click", function () {
      nextQuiz();
    });
    $("btnQuizNext").addEventListener("click", function () {
      nextQuiz();
    });
    $("btnQuizSpeak").addEventListener("click", function () {
      var w = currentQuizWord();
      if (w && w.cloze && w.cloze.full) speakFrench(w.cloze.full, { rate: 0.92 });
    });
    $("quizInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        checkQuiz();
      }
    });

    $("btnReadBack").addEventListener("click", function () {
      stopSpeak();
      showPassageList();
    });

    $("passageList").addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== $("passageList")) {
        if (t.getAttribute && t.getAttribute("data-open-passage")) {
          showPassageDetail(t.getAttribute("data-open-passage"));
          return;
        }
        t = t.parentNode;
      }
    });

    $("passageCard").addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== $("passageCard")) {
        if (t.getAttribute && t.getAttribute("data-react")) {
          handleReactClick(t);
          return;
        }
        if (t.getAttribute && t.getAttribute("data-mode")) {
          state.readMode = t.getAttribute("data-mode");
          stopSpeak();
          showPassageDetail(state.activePassageId);
          return;
        }
        if (t.getAttribute && t.getAttribute("data-rate")) {
          state.readRate = t.getAttribute("data-rate");
          showPassageDetail(state.activePassageId);
          return;
        }
        if (t.id === "btnPassageSpeak") {
          speakPassage();
          return;
        }
        if (t.id === "btnPassageStop") {
          stopSpeak();
          return;
        }
        t = t.parentNode;
      }
    });

    $("favContent").addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== $("favContent")) {
        if (t.getAttribute && t.getAttribute("data-react")) {
          handleReactClick(t);
          return;
        }
        if (t.getAttribute && t.getAttribute("data-fav-speak-word")) {
          var ww = findWord(t.getAttribute("data-fav-speak-word"));
          if (ww) speakFrench(ww.word, { rate: 0.92 });
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
          detectTts();
          updateTtsNote(!state.ttsReady);
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
      "A1–A2 · 词库 " +
      bank.length +
      " · 名著 " +
      passages.length +
      " · " +
      state.dayKey;

    bindEvents();

    Promise.all([loadProgress(), loadReactions()]).then(function () {
      renderFlash();
      renderGenderList("");
      renderQuiz();
      showPassageList();
      renderFav();
      updateTtsNote(!state.ttsReady);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
