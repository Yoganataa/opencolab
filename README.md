# OpenColab for OpenChamber

OpenColab is a small OpenChamber Desktop extension for opening and using Google Colab in an interactive browser surface inside OpenChamber.

It is intended to let you open Colab and run your notebook tasks without keeping a separate Edge tab open. It does **not** configure OpenCode providers, endpoint URLs, API keys, or 9Router settings.

## Features

- Open Google Colab or any HTTPS/HTTP URL in the in-panel browser surface.
- Navigate to a notebook, reload the current page, and return to the Colab home page.
- Keep a local Chromium profile so browser cookies may survive service restarts.
- Uses Chrome, Chromium, or Edge installed on the same computer.
- No Docker and no npm dependencies at runtime.

## Install

1. Install Chrome, Chromium, or Microsoft Edge on the same computer as OpenChamber Desktop.
2. Open **Settings → Extensions → Add**.
3. Paste `https://github.com/Yoganataa/opencolab` and click **Add**.
4. Review and approve the local browser service permission.
5. Open the **OpenColab** panel and click **Open**.
6. Sign in to Google if the browser environment permits it, then open your Colab notebook and run your tasks normally.

## Browser profile

The browser profile is stored locally in `~/.openchamber-opencolab/profile` (under your home directory on Windows). It may contain authentication cookies, so do not share this directory.

## Limitations

- This is an initial implementation and still needs validation in the target OpenChamber build.
- It uses a headless Chromium live surface, not a native embedded WebContentsView. Google sign-in or Colab may reject some browser environments.
- The surface is refreshed about once per second and is not a high-frame-rate remote desktop.
- Closing OpenChamber stops the extension's local browser service.
- Colab retains control of runtime lifecycle and may disconnect sessions according to its own idle/session policies. This extension does not bypass those limits or guarantee a 5–10 hour session.
- No endpoint or API key needs to be entered into OpenChamber for this extension.

## Updates

Git-installed extensions can be updated from **Settings → Extensions → Check for updates** when a higher version is published.
