# OpenColab for OpenChamber

OpenColab adds a live, interactive Google Colab surface to OpenChamber Desktop. It uses OpenChamber's guest-service extension API with `surface: true`; it does not patch or fork OpenChamber.

## Features

- Open Google Colab inside the OpenChamber rail panel via a live browser surface.
- Persistent Chromium profile so cookies may survive service restarts.
- URL navigation and reload controls.
- Save/copy a public 9Router API endpoint ending in `/v1`.
- Uses installed Chrome, Chromium, or Edge. No Docker or npm dependencies.

## Install

1. Install Google Chrome, Chromium, or Microsoft Edge on the same computer as OpenChamber Desktop.
2. In OpenChamber, open **Settings → Extensions → Add**.
3. Install from Git URL: `https://github.com/Yoganataa/opencolab`.
4. Review and approve the local service permission. A guest service runs with the user's OS privileges; the manifest permission list is descriptive, not a security sandbox.
5. Open the **OpenColab** panel, then click **Open** to start Colab.
6. Sign in if Google allows the browser environment. Under **9Router settings**, paste the public HTTPS endpoint ending in `/v1` and save. Use **9Router endpoint** to copy it.

## Browser profile

Authentication profile data is stored locally in `~/.openchamber-opencolab/profile` (on Windows under the user's home directory). Treat this folder as sensitive because it may contain login cookies. Do not share it.

## Limitations

- Initial version, not yet validated against all OpenChamber releases or in every OS/browser setup.
- Uses a headless Chromium rendering surface rather than a native embedded WebContentsView. Google sign-in or Colab may reject some browser environments.
- The surface refreshes about once per second. This is an initial low-overhead implementation, not a full-frame-rate remote desktop.
- Closing OpenChamber stops the extension's local browser service. Colab still controls the runtime's lifecycle, and this extension does not bypass Colab idle/session limits or guarantee a 5–10 hour runtime.
- Requires OpenChamber Desktop with the guest extension service/surface API supported.

## Development

No build step is required: the panel and service are plain JavaScript. Run the syntax check with:

```sh
node scripts/check.mjs
```

For a new release, bump `version` in `package.json`, commit the changes, and use **Settings → Extensions → Check for updates** for the Git-installed extension.
