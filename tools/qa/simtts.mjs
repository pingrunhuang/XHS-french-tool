import { openSim } from "./simlib.mjs";
const { b, p, app, tapEl } = await openSim(process.argv[2]);
await app().evaluate(() => { const ss = window.speechSynthesis; const orig = ss.speak.bind(ss); window.__tts = [];
  ss.speak = function (u) { const oe = u.onerror, os = u.onstart; u.onerror = function (ev) { window.__tts.push("error:" + ev.error); oe && oe.call(this, ev); }; u.onstart = function (ev) { window.__tts.push("start"); os && os.call(this, ev); };
    window.__tts.push("speak(activation=" + (navigator.userActivation ? navigator.userActivation.isActive : "n/a") + ", voices=" + ss.getVoices().length + ", fr-local=" + ss.getVoices().filter(v => /^fr/i.test(v.lang) && v.localService).length + ")"); return orig(u); }; });
const h = await app().$("[data-speak-word]"); await tapEl(h); await new Promise(r => setTimeout(r, 3000));
console.log(JSON.stringify(await app().evaluate(() => window.__tts)));
await b.close();
