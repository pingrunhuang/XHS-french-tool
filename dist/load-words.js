/* Defer the ~282KB bank until after seed UI has painted and handlers bound.
   Do NOT use <script async> (some XHS WebViews mishandle it).
   Dynamically inserted scripts default to async=true — force async=false. */
(function () {
  "use strict";
  function inject() {
    if (window.__frenchWordsInjected) return;
    window.__frenchWordsInjected = true;
    try {
      var s = document.createElement("script");
      s.src = "./words.js";
      s.async = false;
      document.body.appendChild(s);
    } catch (err) {
      if (window.console && console.error) console.error(err);
    }
  }
  function yieldThenInject() {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        setTimeout(inject, 0);
      });
    } else {
      setTimeout(inject, 0);
    }
  }
  yieldThenInject();
})();
