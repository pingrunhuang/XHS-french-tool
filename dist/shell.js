/* Early UI shell: bind tab/chrome clicks BEFORE words.js parses (can be 200KB+).
   Keeps top tabs and key buttons responsive while the word bank loads. */
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

  function appReady() {
    return !!window.__FRENCH_APP_READY;
  }

  function bind() {
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
        // Always flip panels immediately so review taps never feel dead.
        cssSwitchTab(name);
        if (typeof window.__frenchOnTab === "function") {
          try {
            window.__frenchOnTab(name);
          } catch (err) {}
        }
      });
    }

    // While app.js has not finished init, capture-phase gate gives feedback
    // instead of a silent no-op. Once ready, capture does nothing and app handlers run.
    var gated = [
      "btnPrev",
      "btnNext",
      "btnQuizCheck",
      "btnQuizSkip",
      "btnQuizNext",
      "btnQuizSpeak",
      "btnReadBack"
    ];
    var gi;
    for (gi = 0; gi < gated.length; gi++) {
      (function (id) {
        var el = $(id);
        if (!el || el.getAttribute("data-shell-gate")) return;
        el.setAttribute("data-shell-gate", "1");
        el.addEventListener(
          "click",
          function (e) {
            if (appReady()) return;
            e.stopImmediatePropagation();
            e.preventDefault();
            showBootToast("词库加载中，请稍候再点…");
          },
          true
        );
      })(gated[gi]);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }
})();
