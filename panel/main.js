(function () {
  "use strict";

  var host;
  var busy = false;
  var bootPromise = null;
  var $ = function (id) { return document.getElementById(id); };
  var stateEl = $("state");
  var dot = $("dot");
  var reloadButton = $("reload");
  var DEFAULT_URL = "https://colab.research.google.com/";

  function setStatus(text, kind) {
    stateEl.textContent = text;
    dot.className = "dot" + (kind ? " " + kind : "");
  }

  async function run(method, path, body) {
    var raw = await host.serviceRequest({
      method: method,
      path: path,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    var data = raw && raw.body;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (_) {}
    }
    if (raw && raw.status >= 400) {
      throw new Error((data && data.error) || ("HTTP " + raw.status));
    }
    return data || raw;
  }

  async function ensureBrowser() {
    if (bootPromise) return bootPromise;
    bootPromise = (async function () {
      reloadButton.disabled = true;
      try {
        setStatus("Checking browser session…", "loading");
        var state = await run("GET", "/state");
        if (state.running) {
          setStatus(state.title ? "Connected · " + state.title : "Colab session ready", "ok");
          return;
        }

        setStatus("Launching Google Colab…", "loading");
        var opened = await run("POST", "/navigate", { url: DEFAULT_URL });
        setStatus("Colab opened · waiting for page", "ok");
        if (opened && opened.url) {
          window.setTimeout(function () {
            run("GET", "/state").then(function (s) {
              if (s.running) setStatus(s.title ? "Connected · " + s.title : "Colab session ready", "ok");
            }).catch(function () {});
          }, 1800);
        }
      } catch (error) {
        setStatus(error && error.message ? error.message : "Could not start Colab", "bad");
        bootPromise = null;
      } finally {
        reloadButton.disabled = false;
      }
    })();
    return bootPromise;
  }

  reloadButton.addEventListener("click", async function () {
    reloadButton.disabled = true;
    try {
      var state = await run("GET", "/state");
      if (state.running) {
        await run("POST", "/reload", {});
        setStatus("Reloading Colab…", "loading");
        window.setTimeout(function () {
          run("GET", "/state").then(function (s) {
            setStatus(s.running ? (s.title ? "Connected · " + s.title : "Colab session ready") : "Browser session stopped", s.running ? "ok" : "bad");
          }).catch(function (error) { setStatus(error.message, "bad"); });
        }, 1200);
      } else {
        bootPromise = null;
        await ensureBrowser();
      }
    } catch (error) {
      setStatus(error && error.message ? error.message : "Reload failed", "bad");
    } finally {
      reloadButton.disabled = false;
    }
  });

  // OpenChamber's guest bridge: the SDK envelope and request shape.
  function connectHost() {
    var seq = 0;
    var pending = new Map();
    var readyListeners = [];
    var lastReady = null;
    var channel = "openchamber.sdk";
    var version = 1;

    function send(type, payload) {
      var id = "oc-" + (++seq);
      return new Promise(function (resolve, reject) {
        var timer = window.setTimeout(function () {
          pending.delete(id);
          reject(new Error("OpenChamber host request timed out"));
        }, 20000);
        pending.set(id, { resolve: resolve, reject: reject, timer: timer });
        var message = { channel: channel, v: version, type: type, id: id };
        if (payload !== undefined) message.payload = payload;
        window.parent.postMessage(message, "*");
      });
    }

    window.addEventListener("message", function (event) {
      if (event.source !== window.parent) return;
      var message = event.data;
      if (!message || message.channel !== channel || message.v !== version) return;
      if (message.type === "ready") {
        lastReady = message.payload || {};
        readyListeners.slice().forEach(function (fn) { fn(lastReady); });
        return;
      }
      if (message.type === "result" && pending.has(message.id)) {
        var request = pending.get(message.id);
        pending.delete(message.id);
        window.clearTimeout(request.timer);
        if (message.ok) request.resolve(message.payload || {});
        else request.reject(new Error(message.error || message.code || "Host request failed"));
      }
    });

    window.parent.postMessage({ channel: channel, v: version, type: "hello" }, "*");
    return {
      onReady: function (fn) {
        readyListeners.push(fn);
        if (lastReady) fn(lastReady);
        return function () {
          readyListeners = readyListeners.filter(function (listener) { return listener !== fn; });
        };
      },
      serviceRequest: function (request) { return send("service-request", request); }
    };
  }

  try {
    host = connectHost();
    host.onReady(function () { ensureBrowser(); });
  } catch (error) {
    setStatus("Open this panel inside OpenChamber.", "bad");
  }
})();