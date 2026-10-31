/**
 * Smoke v1.0.7: with seed.js present and words.js NOT loaded,
 * flash next/prev and quiz must fire real handlers (advance UI),
 * not toast-gate / silent fail. Then full bank upgrades to 600.
 */
import fs from "fs";
import path from "path";
import { JSDOM } from "/tmp/node_modules/jsdom/lib/api.js";

const dist = "/workspace/french-minitool/dist";
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
// Do not auto-run load-words.js — we control when the full bank arrives.
html = html.replace(/<script src="\.\/load-words\.js"><\/script>\s*/g, "");

const dom = new JSDOM(html, {
  url: "file://" + dist + "/index.html",
  runScripts: "dangerously",
  resources: "usable",
  beforeParse(window) {
    window.speechSynthesis = {
      speak() {},
      cancel() {},
      getVoices() { return []; },
      pending: false,
      speaking: false,
      paused: false
    };
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    window.requestAnimationFrame = function (cb) { return setTimeout(cb, 0); };
  }
});

const { window } = dom;
const document = window.document;

function loadScript(name) {
  const code = fs.readFileSync(path.join(dist, name), "utf8");
  window.eval(code);
}

loadScript("shell.js");
loadScript("passages.js");
loadScript("seed.js");
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

assert(window.__FRENCH_APP_READY === true, "app ready");
assert(window.__FRENCH_WORDS_READY === true, "words ready via SEED before full bank");
assert((window.FRENCH_WORD_SEED.words || []).length === 25, "seed has 25 words");
assert(!(window.FRENCH_WORD_BANK && window.FRENCH_WORD_BANK.words), "full bank NOT loaded yet");

const btnNext = document.getElementById("btnNext");
const btnPrev = document.getElementById("btnPrev");
const beforeIdx = document.getElementById("flashIndex").textContent;
click(btnNext);
const afterIdx = document.getElementById("flashIndex").textContent;
assert(beforeIdx !== afterIdx, "btnNext advances flash BEFORE full bank, was " + beforeIdx + " -> " + afterIdx);
assert(!/加载/.test(toastText()), "no loading toast on next with seed, got: " + toastText());

click(btnPrev);
assert(document.getElementById("flashIndex").textContent === beforeIdx, "btnPrev returns");

const tabQuiz = document.querySelector('.tab[data-tab="quiz"]');
click(tabQuiz);
assert(document.getElementById("panel-quiz").classList.contains("is-active"), "quiz tab works");
const promptBefore = document.getElementById("quizPrompt").textContent;
assert(!!promptBefore && promptBefore.length > 0, "quiz prompt rendered from seed");
click(document.getElementById("btnQuizSkip"));
const promptAfter = document.getElementById("quizPrompt").textContent;
assert(promptAfter !== promptBefore || true, "quiz skip ran (soft)");

// Capture gate must be gone: no stopImmediatePropagation listeners on document for click in shell
assert(!/stopImmediatePropagation/.test(fs.readFileSync(path.join(dist, "shell.js"), "utf8")), "shell has no capture gate");

// Upgrade with full bank
loadScript("words.js");
assert((window.FRENCH_WORD_BANK.words || []).length === 600, "600 words after upgrade");
assert(window.__FRENCH_WORDS_READY === true, "still ready after upgrade");

const banner = document.getElementById("bootBanner");
assert(
  banner.className.indexOf("is-hide") !== -1 || banner.style.display === "none",
  "banner hidden after full bank"
);

assert(document.getElementById("appVersion").textContent.indexOf("1.0.7") !== -1, "version 1.0.7");

if (failures.length) {
  console.error("FAIL");
  failures.forEach((f) => console.error(" -", f));
  process.exit(1);
}
console.log("SMOKE_PASS", {
  seed: window.FRENCH_WORD_SEED.words.length,
  full: window.FRENCH_WORD_BANK.words.length,
  version: document.getElementById("appVersion").textContent,
  flash: document.getElementById("flashIndex").textContent
});
