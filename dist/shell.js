/* Early UI shell: bind IMMEDIATELY (scripts sit at end of body — do NOT
   wait for DOMContentLoaded, which only fires AFTER sync/deferred siblings).
   Toast-gate every critical control until the word bank is ready. */
(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function showBootToast(msg) {
    var el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.className = "toast is-show";
    if (window.__frenchBootToastTimer) clearTimeout(window.__frenchBootToastTimer);
    window.__frenchBootToastTimer = setTimeout(function () {
      el.className = "toast";
    }, 1800);
  }

  function wordsReady() {
    return !!window.__FRENCH_WORDS_READY;
  }

  function cssSwitchTab(name) {
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
  }

  function isInteractiveTarget(el) {
    if (!el || !el.getAttribute) return null;
    if (el.id === "btnPrev" || el.id === "btnNext") return el;
    if (el.id === "btnQuizCheck" || el.id === "btnQuizSkip") return el;
    if (el.id === "btnQuizNext" || el.id === "btnQuizSpeak") return el;
    if (el.id === "btnReadBack") return el;
    if (el.classList && (el.classList.contains("btn") || el.classList.contains("back-link"))) return el;
    if (el.getAttribute("data-react") || el.getAttribute("data-speak-word") ||
        el.getAttribute("data-speak-ex") != null || el.getAttribute("data-gender-speak") ||
        el.getAttribute("data-open-passage") || el.getAttribute("data-rate") ||
        el.getAttribute("data-fav-speak-word") || el.getAttribute("data-fav-open-passage")) {
      return el;
    }
    return null;
  }

  function bind() {
    if (window.__frenchShellBound) return;
    window.__frenchShellBound = true;

    var tabs = $("tabs");
    if (tabs && !tabs.getAttribute("data-shell-bound")) {
      tabs.setAttribute("data-shell-bound", "1");
      tabs.addEventListener("click", function (e) {
        var t = e.target;
        while (t && t !== tabs && !(t.getAttribute && t.getAttribute("data-tab"))) {
          t = t.parentNode;
        }
        if (!t || !t.getAttribute) return;
        var name = t.getAttribute("data-tab");
        if (!name) return;
        cssSwitchTab(name);
        if (typeof window.__frenchOnTab === "function") {
          try { window.__frenchOnTab(name); } catch (err) {}
        }
      });
    }

    // Capture-phase gate: never silent no-op while bank is still loading.
    // Tabs are handled above and stay live; everything else toast-gates.
    document.addEventListener(
      "click",
      function (e) {
        if (wordsReady()) return;
        var t = e.target;
        while (t && t !== document && t !== document.body) {
          if (t.getAttribute && t.getAttribute("data-tab")) return; // tabs always live
          if (t.id === "genderSearch" || (t.tagName && t.tagName.toLowerCase() === "input")) return;
          if (isInteractiveTarget(t)) {
            e.stopImmediatePropagation();
            e.preventDefault();
            showBootToast("词库加载中，请稍候再点…");
            return;
          }
          t = t.parentNode;
        }
      },
      true
    );

    // Pointer/touch fallback for WebViews that drop or delay click during jank.
    function pointerGate(e) {
      if (wordsReady()) return;
      if (e.type === "touchend" && e.cancelable === false) {
        // allow scroll end; only gate clear taps
      }
      var t = e.target;
      while (t && t !== document && t !== document.body) {
        if (t.getAttribute && t.getAttribute("data-tab")) return;
        if (isInteractiveTarget(t)) {
          // Do not preventDefault on touchstart (kills scroll); only hint via toast on touchend/pointerup
          if (e.type === "touchend" || e.type === "pointerup") {
            showBootToast("词库加载中，请稍候再点…");
          }
          return;
        }
        t = t.parentNode;
      }
    }
    document.addEventListener("touchend", pointerGate, true);
    if (window.PointerEvent) {
      document.addEventListener("pointerup", pointerGate, true);
    }

    var banner = $("bootBanner");
    if (banner) banner.style.display = "";
  }

  // Scripts are at end of <body>: nodes above already exist. Bind NOW.
  try {
    bind();
  } catch (errBind) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        try { bind(); } catch (e2) {}
      });
    }
  }
})();
