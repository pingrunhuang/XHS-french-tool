/* Early UI shell: bind tabs IMMEDIATELY (scripts sit at end of body — do NOT
   wait for DOMContentLoaded). v1.0.7: NO capture-phase click/touch gate —
   seed bank makes flash/quiz live on first paint; a gate that toasts forever
   when the full bank never arrives looks like "dead buttons" to reviewers. */
(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
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
  }

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
