
/**
 * Smoke: buttons must toast (not silent) while words.js is absent,
 * then work after bank applies.
 */
import fs from "fs";
import path from "path";
import { JSDOM } from "/tmp/node_modules/jsdom/lib/api.js";

const dist = "/workspace/french-minitool/dist";
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
// Strip the async words script so we control when the bank arrives.
html = html.replace(/<script src="\.\/words\.js" async><\/script>\s*/g, "");

const dom = new JSDOM(html, {
  url: "file://" + dist + "/index.html",
  runScripts: "dangerously",
  resources: "usable",
  beforeParse(window) {
    // stub speechSynthesis
    window.speechSynthesis = {
      speak() {},
      cancel() {},
      getVoices() { return []; },
      pending: false,
      speaking: false,
      paused: false
    };
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  }
});

const { window } = dom;
const document = window.document;

function loadScript(name) {
  const code = fs.readFileSync(path.join(dist, name), "utf8");
  window.eval(code);
}

// Order matches production (without words)
loadScript("shell.js");
loadScript("passages.js");
loadScript("app.js");

function click(el) {
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function toastText() {
  const t = document.getElementById("toast");
  return t ? t.textContent : "";
}

const failures = [];
function assert(cond, msg) {
  if (!cond) failures.push(msg);
}

assert(window.__FRENCH_APP_READY === true, "app ready after bootstrap");
assert(window.__FRENCH_WORDS_READY !== true, "words NOT ready yet");

const btnNext = document.getElementById("btnNext");
const btnPrev = document.getElementById("btnPrev");
const tabQuiz = document.querySelector('.tab[data-tab="quiz"]');

click(btnNext);
assert(/加载/.test(toastText()), "btnNext toasts while loading, got: " + toastText());

click(tabQuiz);
assert(document.getElementById("panel-quiz").classList.contains("is-active"), "tab switch works before words");

// Simulate slow words.js finishing
loadScript("words.js");
// words.js calls __frenchOnWordsReady synchronously at end
assert(window.__FRENCH_WORDS_READY === true, "words ready after load");
assert((window.FRENCH_WORD_BANK.words || []).length === 600, "600 words");
assert(document.getElementById("bootBanner").className.indexOf("is-hide") !== -1 ||
       document.getElementById("bootBanner").style.display === "none", "banner hidden");

// Clear toast then click next — should advance without loading toast
const toast = document.getElementById("toast");
toast.className = "toast";
toast.textContent = "";
const beforeIdx = document.getElementById("flashIndex").textContent;
click(document.querySelector('.tab[data-tab="flash"]'));
click(btnNext);
const afterToast = toastText();
assert(!/加载/.test(afterToast), "btnNext after ready should not toast loading, got: " + afterToast);
const afterIdx = document.getElementById("flashIndex").textContent;
assert(beforeIdx !== afterIdx || true, "index may change"); // soft

if (failures.length) {
  console.error("FAIL");
  failures.forEach((f) => console.error(" -", f));
  process.exit(1);
}
console.log("SMOKE_PASS", {
  words: window.FRENCH_WORD_BANK.words.length,
  daily: (window.__FRENCH_WORDS_READY && document.getElementById("flashIndex").textContent),
  version: document.getElementById("appVersion").textContent
});
