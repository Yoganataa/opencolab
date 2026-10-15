/* OpenColab local service. Uses Node built-ins and a system Chromium/Chrome/Edge binary. */
"use strict";
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const net = require("node:net");

const PORT = Number(process.env.OPENCHAMBER_SERVICE_PORT);
const TOKEN = process.env.OPENCHAMBER_SERVICE_TOKEN || "";
const PROFILE = path.join(os.homedir(), ".openchamber-opencolab", "profile");
const DEFAULT_URL = "https://colab.research.google.com/";
const VIEW_W = 1440, VIEW_H = 900;
let child = null, ws = null, wsReady = false;
let nextId = 1, pending = new Map(), currentUrl = "", currentTitle = "OpenColab";
let frame = Buffer.alloc(0), frameSeq = 0, frameAt = 0, captureTimer = null;
let viewport = { width: VIEW_W, height: VIEW_H }, endpoint = "";
let frameWaiters = [];

function sendJson(res, status, value) {
  const data = Buffer.from(JSON.stringify(value));
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": data.length, "cache-control": "no-store" });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; if (data.length > 1024 * 1024) { reject(new Error("Request body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch (_) { reject(new Error("Invalid JSON body")); } });
    req.on("error", reject);
  });
}
function authorized(req) { return TOKEN.length > 0 && req.headers.authorization === "Bearer " + TOKEN; }
function findBrowser() {
  const candidates = [];
  if (process.platform === "win32") {
    const pf = process.env.PROGRAMFILES || "C:\\Program Files";
    const pfx = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const local = process.env.LOCALAPPDATA || "";
    candidates.push(path.join(pf, "Google/Chrome/Application/chrome.exe"), path.join(pfx, "Google/Chrome/Application/chrome.exe"),
      path.join(local, "Google/Chrome/Application/chrome.exe"), path.join(pf, "Microsoft/Edge/Application/msedge.exe"),
      path.join(pfx, "Microsoft/Edge/Application/msedge.exe"), "chrome.exe", "msedge.exe", "chromium.exe");
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Chromium.app/Contents/MacOS/Chromium", "google-chrome", "chromium");
  } else candidates.push("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge", "microsoft-edge-stable");
  for (const c of candidates) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
    if (!path.isAbsolute(c)) for (const d of (process.env.PATH || "").split(path.delimiter)) {
      const full = path.join(d, c); if (fs.existsSync(full)) return full;
    }
  }
  throw new Error("Chrome, Chromium, or Edge was not found. Install one and restart OpenChamber.");
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const p = server.address().port; server.close(() => resolve(p)); });
  });
}
function cdpSend(method, params) {
  if (!ws || ws.readyState !== 1) return Promise.reject(new Error("Browser DevTools connection is not ready"));
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error("Browser command timed out: " + method)); }, 12000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}
function connectCdp(url) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== "function") return reject(new Error("This OpenChamber runtime does not expose WebSocket; update OpenChamber."));
    ws = new WebSocket(url);
    ws.addEventListener("open", () => { wsReady = true; resolve(); });
    ws.addEventListener("error", () => reject(new Error("Could not connect to Chrome DevTools")));
    ws.addEventListener("message", ev => {
      let msg; try { msg = JSON.parse(typeof ev.data === "string" ? ev.data : ""); } catch (_) { return; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message || "CDP error")); else p.resolve(msg.result || {});
      }
      if (msg.method === "Page.frameNavigated" && msg.params?.frame && !msg.params.frame.parentId) currentUrl = msg.params.frame.url || currentUrl;
      if (msg.method === "Page.loadEventFired") updateTitle().catch(() => {});
    });
    ws.addEventListener("close", () => { wsReady = false; });
  });
}
async function updateTitle() {
  try {
    const r = await cdpSend("Runtime.evaluate", { expression: "({title:document.title,url:location.href})", returnByValue: true });
    const v = r.result && r.result.value; if (v) { currentTitle = v.title || currentTitle; currentUrl = v.url || currentUrl; }
  } catch (_) {}
}
async function launchBrowser() {
  if (child && !child.killed && wsReady) return;
  const bin = findBrowser(); fs.mkdirSync(PROFILE, { recursive: true });
  const port = await freePort();
  const args = ["--headless=new","--no-first-run","--no-default-browser-check","--disable-dev-shm-usage",
    "--remote-debugging-address=127.0.0.1","--remote-debugging-port=" + port,"--remote-allow-origins=*",
    "--user-data-dir=" + PROFILE,"--window-size=" + VIEW_W + "," + VIEW_H,"--hide-scrollbars","about:blank"];
  child = spawn(bin, args, { stdio: "ignore", windowsHide: true });
  child.on("exit", () => { child = null; wsReady = false; if (ws) { try { ws.close(); } catch (_) {} } ws = null; });
  const versionUrl = "http://127.0.0.1:" + port + "/json/version";
  let pageSocket = null;
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw new Error("Browser exited during startup.");
    try {
      const r = await fetch("http://127.0.0.1:" + port + "/json/list");
      if (r.ok) { const targets = await r.json(); const page = targets.find(t => t.type === "page" && t.webSocketDebuggerUrl); if (page) { pageSocket = page.webSocketDebuggerUrl; break; } }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  if (!pageSocket) {
    try { const r = await fetch(versionUrl); if (r.ok) { const v = await r.json(); pageSocket = v.webSocketDebuggerUrl; } } catch (_) {}
  }
  if (!pageSocket) throw new Error("Chrome DevTools did not start. Check your browser installation.");
  await connectCdp(pageSocket);
  await cdpSend("Page.enable"); await cdpSend("Runtime.enable");
  await cdpSend("Page.setDeviceMetricsOverride", { width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: false });
  startCapture();
}
async function navigate(url) {
  let parsed; try { parsed = new URL(url); } catch (_) { throw new Error("Enter a valid http:// or https:// URL."); }
  if (!["http:","https:"].includes(parsed.protocol)) throw new Error("Only http:// and https:// pages are allowed.");
  await launchBrowser();
  const r = await cdpSend("Page.navigate", { url: parsed.toString() });
  if (r.errorText) throw new Error(r.errorText);
  currentUrl = parsed.toString(); return { url: currentUrl, opened: true };
}
function startCapture() {
  if (captureTimer) clearInterval(captureTimer);
  captureTimer = setInterval(async () => {
    if (!wsReady || !ws || ws.readyState !== 1) return;
    try {
      const r = await cdpSend("Page.captureScreenshot", { format: "jpeg", quality: 72, fromSurface: true, captureBeyondViewport: false });
      if (r.data) { frame = Buffer.from(r.data, "base64"); frameSeq++; frameAt = Date.now(); const w = frameWaiters; frameWaiters = []; w.forEach(fn => fn()); }
      await updateTitle();
    } catch (_) {}
  }, 900);
}
function modifierMask(m) { return (m?.alt?1:0) | (m?.ctrl?2:0) | (m?.meta?4:0) | (m?.shift?8:0); }
function validInput(e) {
  if (!e || typeof e !== "object") return null;
  if (e.type === "pointer" && ["down","up","move"].includes(e.action) && Number.isFinite(e.x) && Number.isFinite(e.y))
    return { type:"pointer", action:e.action, x:e.x, y:e.y, button:Number.isFinite(e.button)?e.button:-1, buttons:Number(e.buttons)||0, modifiers:e.modifiers||{} };
  if (e.type === "wheel") return { type:"wheel", x:Number(e.x)||0, y:Number(e.y)||0, deltaX:Number(e.deltaX)||0, deltaY:Number(e.deltaY)||0, modifiers:e.modifiers||{} };
  if (e.type === "key" && ["down","up"].includes(e.action)) return { type:"key", action:e.action, key:String(e.key||""), code:String(e.code||""), modifiers:e.modifiers||{} };
  if (e.type === "text" && typeof e.text === "string") return { type:"text", text:e.text };
  return null;
}
async function handleInput(events) {
  if (!wsReady) throw new Error("Open a page first.");
  for (const e of events) {
    if (e.type === "pointer") {
      const x=Math.max(0,Math.min(viewport.width,Number(e.x)||0)), y=Math.max(0,Math.min(viewport.height,Number(e.y)||0));
      if (e.action==="move") await cdpSend("Input.dispatchMouseEvent",{type:"mouseMoved",x,y,buttons:e.buttons||0,modifiers:modifierMask(e.modifiers)});
      else await cdpSend("Input.dispatchMouseEvent",{type:e.action==="down"?"mousePressed":"mouseReleased",x,y,button:e.button===2?"right":e.button===1?"middle":"left",buttons:e.buttons||0,clickCount:1,modifiers:modifierMask(e.modifiers)});
    } else if (e.type==="wheel") {
      await cdpSend("Input.dispatchMouseEvent",{type:"mouseWheel",x:e.x||0,y:e.y||0,deltaX:e.deltaX||0,deltaY:e.deltaY||0,modifiers:modifierMask(e.modifiers)});
    } else if (e.type==="key") {
      const key=e.key||"", down=e.action==="down", params={type:down?"keyDown":"keyUp",key,code:e.code||"",modifiers:modifierMask(e.modifiers),windowsVirtualKeyCode:key.length===1?key.toUpperCase().charCodeAt(0):0};
      if (key.length===1&&down) params.text=key; await cdpSend("Input.dispatchKeyEvent",params);
    } else if (e.type==="text") await cdpSend("Input.insertText",{text:e.text});
  }
}
async function route(req,res) {
  if (!authorized(req)) return sendJson(res,401,{error:"Unauthorized service request"});
  const url=new URL(req.url,"http://127.0.0.1");
  if (req.method==="GET"&&url.pathname==="/health") return sendJson(res,200,{ok:true});
  if (req.method==="GET"&&url.pathname==="/state") return sendJson(res,200,{running:!!(child&&!child.killed&&wsReady),url:currentUrl,title:currentTitle,endpoint:endpoint||null,frameSeq,frameAt});
  if (req.method==="POST"&&url.pathname==="/endpoint") {
    const body=await readBody(req), v=String(body.endpoint||"").trim();
    if (v&&!/^https:\/\/[a-z0-9.-]+(?::\d+)?\/v1\/?$/i.test(v)) return sendJson(res,400,{error:"Endpoint must be an https URL ending in /v1."});
    endpoint=v.replace(/\/$/,""); return sendJson(res,200,{endpoint});
  }
  if (req.method==="POST"&&url.pathname==="/navigate") {
    const body=await readBody(req); try { return sendJson(res,200,await navigate(String(body.url||DEFAULT_URL))); } catch(e) { return sendJson(res,400,{error:e.message}); }
  }
  if (req.method==="POST"&&url.pathname==="/reload") {
    if (!wsReady) return sendJson(res,409,{error:"OpenColab browser is not running."});
    try { await cdpSend("Page.reload",{ignoreCache:false}); return sendJson(res,200,{ok:true}); } catch(e) { return sendJson(res,500,{error:e.message}); }
  }
  if (req.method==="GET"&&url.pathname==="/surface/frame") {
    const after=Number(url.searchParams.get("after")||0), wait=Math.min(20000,Math.max(0,Number(url.searchParams.get("wait")||0)));
    if ((!frame.length||frameSeq<=after)&&wait) await new Promise(resolve=>{ const done=()=>{clearTimeout(timer);resolve();}; const timer=setTimeout(done,wait); frameWaiters.push(done); });
    if (!frame.length||frameSeq<=after) { res.writeHead(204); return res.end(); }
    res.writeHead(200,{"content-type":"image/jpeg","content-length":frame.length,"cache-control":"no-store","x-surface-seq":String(frameSeq),
      "x-surface-width":String(viewport.width),"x-surface-height":String(viewport.height),"x-surface-title":currentTitle||"OpenColab"});
    return res.end(frame);
  }
  if (req.method==="POST"&&url.pathname==="/surface/input") {
    const body=await readBody(req), events=Array.isArray(body.events)?body.events.map(validInput).filter(Boolean):[];
    try { await handleInput(events); return sendJson(res,200,{ok:true}); } catch(e) { return sendJson(res,400,{error:e.message}); }
  }
  if (req.method==="POST"&&url.pathname==="/surface/control") { await readBody(req); return sendJson(res,200,{ok:true}); }
  if (req.method==="POST"&&url.pathname==="/surface/resize") {
    const body=await readBody(req); viewport={width:Math.max(320,Math.min(2560,Math.round(Number(body.width)||VIEW_W))),height:Math.max(240,Math.min(1800,Math.round(Number(body.height)||VIEW_H)))};
    if(wsReady) try{await cdpSend("Page.setDeviceMetricsOverride",{width:viewport.width,height:viewport.height,deviceScaleFactor:1,mobile:false});}catch(_){}
    return sendJson(res,200,viewport);
  }
  if (req.method==="GET"&&url.pathname==="/surface/clipboard") return sendJson(res,200,{text:""});
  return sendJson(res,404,{error:"Not found"});
}
const server=http.createServer((req,res)=>{route(req,res).catch(e=>sendJson(res,500,{error:e.message||"Internal service error"}));});
server.on("clientError",(_err,socket)=>socket.end("HTTP/1.1 400 Bad Request\r\n\r\n"));
server.listen(PORT,"127.0.0.1");
process.on("SIGTERM",()=>{if(captureTimer)clearInterval(captureTimer);if(ws)try{ws.close();}catch(_){}if(child)try{child.kill();}catch(_){}server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),1500).unref();});
process.on("SIGINT",()=>process.emit("SIGTERM"));
