/**
 * Captures every screen at its OWN full height.
 *
 * The first pass guessed a height per page and anything taller was cut off.
 * This measures the real content height after the page has settled and sets
 * the viewport to it, so nothing is ever cropped.
 */
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const BASE = "https://sohbah-ochre.vercel.app/ar/sohbah";
const OUT = "D:/githup repo/sohbah/.shots";
const WIDTH = 420;

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));

let nextId = 1;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) =>
  new Promise((res) => { const i = nextId++; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => {
  const res = await send("Runtime.evaluate", {
    expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true,
  });
  // Without this, a failed click inside the page came back as `undefined` and
  // the run died several steps later with nothing to read.
  const thrown = res.result?.exceptionDetails;
  if (thrown) return "EVAL FAILED: " + (thrown.exception?.description || thrown.text);
  return res.result?.result?.value ?? "(no text)";
};

await send("Page.enable");
await send("Runtime.enable");

const setViewport = (height) =>
  send("Emulation.setDeviceMetricsOverride", {
    width: WIDTH, height, deviceScaleFactor: 2, mobile: true,
  });

async function shot(name, cap = Infinity) {
  // Settle at a normal phone height first, so lazy work finishes and the
  // measurement is of a real layout rather than a stretched one.
  await setViewport(900);
  await wait(900);

  const metrics = await send("Page.getLayoutMetrics");
  // `cap` is for the one page that is legitimately enormous: the surah index
  // is 7954px of 114 surahs. A screenshot of all of it is unreadable on a
  // phone, so that one is shown as much as a screen holds.
  const height = Math.min(cap, Math.ceil(metrics.result.cssContentSize.height));

  await setViewport(height);
  await wait(700);

  // `captureBeyondViewport` shoots the whole document regardless of the
  // viewport, which is exactly what we want for a normal page and exactly
  // wrong for a capped one — so a capped page is clipped explicitly instead.
  const res = await send("Page.captureScreenshot",
    cap === Infinity
      ? { format: "png", captureBeyondViewport: true }
      : { format: "png", clip: { x: 0, y: 0, width: WIDTH, height, scale: 1 } });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, "base64"));

  const buf = fs.readFileSync(`${OUT}/${name}.png`);
  console.log(`  ${name}.png  ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}  ${(buf.length / 1024).toFixed(0)}KB  (content ${height}px)`);
}

async function go(url) {
  await send("Page.navigate", { url });
  await wait(4500);
}

const START = (modeLabel, fromJuz, toJuz) => `
  const byText = (t) => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t));
  byText(${JSON.stringify(modeLabel)}).click();
  await new Promise(r => setTimeout(r, 400));
  const setSel = (el, v) => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const sels = document.querySelectorAll('select');
  if (sels.length === 2) { setSel(sels[0], '${fromJuz}'); await new Promise(r=>setTimeout(r,200)); setSel(sels[1], '${toJuz}'); }
  await new Promise(r => setTimeout(r, 400));
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'ابدأي').click();
  await new Promise(r => setTimeout(r, 3500));
  return document.querySelector('main').innerText.replace(/\\n+/g, ' | ').slice(0, 110);
`;

console.log("capturing at full height:\n");

await go(BASE);                         await shot("1-home");
await go(`${BASE}/me`);                 await shot("2-mypage");
await go(`${BASE}/mushaf/293`);         await shot("3-mushaf");
await go(`${BASE}/mushaf`);             await shot("4-index", 1300);
await go(`${BASE}/self-test`);          await shot("5-selftest");

await go(`${BASE}/self-test`);
console.log("   " + await evaluate(START("أكملي الآية", 30, 30)));
await shot("6-complete");

await go(`${BASE}/self-test`);
console.log("   " + await evaluate(START("المتشابهات", 1, 30)));
await shot("7-mutashabihat");
await evaluate(`
  const opts = [...document.querySelectorAll('section button')];
  if (opts[0]) opts[0].click();
  await new Promise(r => setTimeout(r, 700));
  return 'answered';
`);
await shot("8-mutashabihat-answered");

await go(`${BASE}/self-test`);
console.log("   " + await evaluate(START("إخفاء الكلمات", 30, 30)));
await shot("9-hidden");

await go(`${BASE}/quizzes`);            await shot("10-quizzes");

ws.close();
console.log("\ndone");
