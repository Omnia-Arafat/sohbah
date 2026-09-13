/**
 * The screens the first pass left out: the timetable (and its tabs), the
 * circles as they read after the redesign, and registration.
 *
 * Same full-height rule as capture.mjs — measure, then shoot.
 */
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const BASE = "https://sohbah-ochre.vercel.app/ar/sohbah";
const OUT = "D:/githup repo/sohbah/.shots";
const WIDTH = 420;

const targets = await (await fetch("http://127.0.0.1:9222/json/list")).json();
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
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
  const thrown = res.result?.exceptionDetails;
  if (thrown) return "EVAL FAILED: " + (thrown.exception?.description || thrown.text);
  return res.result?.result?.value ?? "(no text)";
};

await send("Page.enable");
await send("Runtime.enable");

const setViewport = (height) =>
  send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height, deviceScaleFactor: 2, mobile: true });

async function shot(name, cap = Infinity) {
  await setViewport(900);
  await wait(900);
  const metrics = await send("Page.getLayoutMetrics");
  const height = Math.min(cap, Math.ceil(metrics.result.cssContentSize.height));
  await setViewport(height);
  await wait(700);
  const res = await send("Page.captureScreenshot",
    cap === Infinity
      ? { format: "png", captureBeyondViewport: true }
      : { format: "png", clip: { x: 0, y: 0, width: WIDTH, height, scale: 1 } });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(res.result.data, "base64"));
  const buf = fs.readFileSync(`${OUT}/${name}.png`);
  console.log(`  ${name}.png  ${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}  ${(buf.length / 1024).toFixed(0)}KB`);
}

const go = async (url) => { await send("Page.navigate", { url }); await wait(4500); };

console.log("");

await go(`${BASE}/schedule`);
console.log("  tabs: " + await evaluate(`
  const strip = document.querySelector('[role="tablist"]');
  return strip ? [...strip.querySelectorAll('[role="tab"]')].map(b => b.textContent.trim()).join(' / ') : 'no tab strip';
`));
await shot("11-schedule", 1900);

// The second board, to show the tabs actually switch.
console.log("  " + await evaluate(`
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  if (tabs.length < 2) return 'only one board — no second tab to show';
  tabs[1].click();
  await new Promise(r => setTimeout(r, 800));
  return 'switched to: ' + tabs[1].textContent.trim();
`));
await shot("12-schedule-tab2", 1900);

await go(`${BASE}/register`);
await shot("13-register");

ws.close();
console.log("\ndone");
