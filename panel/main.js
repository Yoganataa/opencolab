(function () {
  "use strict";
  var host, busy = false;
  var $ = function (id) { return document.getElementById(id); };
  var urlInput = $("url"), stateEl = $("state"), dot = $("dot");
  var titleEl = $("title"), endpointStatus = $("endpointStatus");

  function setStatus(text, kind) { stateEl.textContent = text; dot.className = "dot" + (kind ? " " + kind : ""); }
  async function run(method, path, body) {
    if (busy) return;
    busy = true;
    ["open","reload","home","endpoint","saveEndpoint"].forEach(function (id) { $(id).disabled = true; });
    try {
      var raw = await host.serviceRequest({ method: method, path: path, body: body });
      var data = raw && raw.body;
      if (typeof data === "string") { try { data = JSON.parse(data); } catch (_) {} }
      if (raw && raw.status >= 400) throw new Error((data && data.error) || ("HTTP " + raw.status));
      return data || raw;
    } finally {
      busy = false;
      ["open","reload","home","endpoint","saveEndpoint"].forEach(function (id) { $(id).disabled = false; });
    }
  }
  async function refresh() {
    try {
      var s = await run("GET", "/state");
      setStatus(s.running ? "Browser session running" : "Browser session not started", s.running ? "ok" : "");
      titleEl.textContent = s.title ? "— " + s.title : "";
      endpointStatus.textContent = s.endpoint ? "9Router: " + s.endpoint : "9Router endpoint not configured";
      if (s.endpoint && !$("endpointInput").value) $("endpointInput").value = s.endpoint;
      if (s.url) urlInput.value = s.url;
    } catch (e) { setStatus("Service unavailable: " + e.message, "bad"); }
  }
  $("open").addEventListener("click", async function () {
    try { var data = await run("POST", "/navigate", { url: urlInput.value.trim() }); if (data.url) urlInput.value = data.url; setStatus("Page opened", "ok"); await refresh(); }
    catch (e) { setStatus(e.message, "bad"); }
  });
  urlInput.addEventListener("keydown", function (e) { if (e.key === "Enter") $("open").click(); });
  $("reload").addEventListener("click", async function () {
    try { await run("POST", "/reload", {}); setStatus("Reload requested", "ok"); }
    catch (e) { setStatus(e.message, "bad"); }
  });
  $("home").addEventListener("click", function () { urlInput.value = "https://colab.research.google.com/"; $("open").click(); });
  $("endpoint").addEventListener("click", async function () {
    try { var s = await run("GET", "/state"); if (!s.endpoint) throw new Error("Set the endpoint in 9Router settings first."); await host.writeClipboard(s.endpoint); setStatus("9Router endpoint copied", "ok"); }
    catch (e) { setStatus(e.message, "bad"); }
  });
  $("saveEndpoint").addEventListener("click", async function () {
    try {
      var saved = await run("POST", "/endpoint", { endpoint: $("endpointInput").value.trim() });
      endpointStatus.textContent = saved.endpoint ? "9Router: " + saved.endpoint : "9Router endpoint not configured";
      setStatus("Endpoint saved", "ok");
    } catch (e) { setStatus(e.message, "bad"); }
  });

  // Minimal local host bridge using OpenChamber's documented SDK wire envelope.
  function connectHost() {
    var seq = 0, pending = new Map(), readyListeners = [], channel = "openchamber.sdk", version = 1;
    function send(type, payload) {
      var id = "opencolab-" + (++seq);
      return new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { pending.delete(id); reject(new Error("OpenChamber host request timed out")); }, 20000);
        pending.set(id, { resolve: resolve, reject: reject, timer: timer });
        var msg = { channel: channel, v: version, type: type, id: id };
        if (payload !== undefined) msg.payload = payload;
        window.parent.postMessage(msg, "*");
      });
    }
    window.addEventListener("message", function (event) {
      if (event.source !== window.parent) return;
      var m = event.data;
      if (!m || m.channel !== channel || m.v !== version) return;
      if (m.type === "ready") { readyListeners.slice().forEach(function (fn) { fn(m.payload); }); return; }
      if (m.type === "result" && pending.has(m.id)) {
        var p = pending.get(m.id); pending.delete(m.id); clearTimeout(p.timer);
        if (m.ok) p.resolve(m.payload || {});
        else p.reject(new Error(m.error || m.code || "Host request failed"));
      }
    });
    window.parent.postMessage({ channel: channel, v: version, type: "hello" }, "*");
    return {
      onReady: function (fn) { readyListeners.push(fn); },
      serviceRequest: function (request) { return send("service-request", request); },
      writeClipboard: function (text) { return send("clipboard-write", { text: text }); }
    };
  }
  try { host = connectHost(); } catch (e) { setStatus("Open this panel inside OpenChamber to connect.", "bad"); return; }
  host.onReady(function () { refresh(); });
})();
