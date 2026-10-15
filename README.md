# OpenColab for OpenChamber

OpenColab is an OpenChamber Desktop extension that automatically opens Google Colab in an interactive browser surface.

## Features

- Starts Google Colab automatically when the panel becomes ready; no separate **Open** click is needed.
- Keeps a local browser profile so cookies may survive service restarts.
- Provides one control to reload the current page or relaunch Colab if the browser is stopped.
- Uses Chrome, Chromium, or Microsoft Edge installed on the same computer.
- Does not configure OpenCode providers, endpoint URLs, API keys, or 9Router settings.
- No Docker or npm dependencies at runtime.

## Install

1. Install Chrome, Chromium, or Microsoft Edge on the same computer as OpenChamber Desktop.
2. Open **Settings → Extensions → Add**.
3. Paste `https://github.com/Yoganataa/opencolab` and click **Add**.
4. Review and approve the local browser service permission.
5. Open the **OpenColab** panel. It should launch Google Colab automatically.
6. Sign in if Google permits the browser environment, then open your notebook and run it normally.

## Browser profile

The browser profile is stored locally in `~/.openchamber-opencolab/profile` (under your home directory on Windows). It may contain authentication cookies, so do not share this directory.

## Limitations

- Automatic startup and the live browser surface still need validation in the target OpenChamber build.
- This uses a headless Chromium live surface, not a native embedded browser view. Google sign-in or Colab may reject some browser environments.
- The surface is refreshed about once per second and is not a high-frame-rate remote desktop.
- Closing OpenChamber stops the extension's local browser service.
- Colab controls runtime lifecycle and may disconnect sessions according to its own idle/session policies. This extension does not bypass those limits or guarantee a fixed session duration.
- No endpoint or API key needs to be entered into OpenChamber for this extension.

## Updates

For a Git-installed extension, open **Settings → Extensions → Check for updates** to install a published version with a higher version number.
