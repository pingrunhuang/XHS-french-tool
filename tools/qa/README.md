# QA scripts (v1.0.8)

Needs Node 20+, Google Chrome, and puppeteer-core. The scripts import it from `/tmp/pp/node_modules/puppeteer-core`; change that path if yours is elsewhere.

- `node functest.mjs ../../dist`: functional assertions in real Chrome under a container-like CSP, using touch taps. Covers Android without speechSynthesis, the desktop simulator, iOS with working TTS, and iOS where TTS fails. Exit 0 means pass.
- `node clickall.mjs ../../dist android|ios|pc`: taps every visible control in each tab, then reports the hit-test result and the DOM response.
- `node loadtime.mjs <dir>...`: DCL and load timing at 6x CPU throttle.
- `simclick2.mjs` / `simdetail.mjs` / `simtts.mjs <redapp dev url>`: click controls inside the official `redapp dev` simulator, with calibrated coordinates. The simulator re-dispatches clicks into the app iframe as untrusted events.
