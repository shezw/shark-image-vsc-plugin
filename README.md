# Shark Image

Shark Image is a VS Code extension for scanning a workspace image directory, previewing Sharp compression results in real time, and running a one-click batch compression pass.

![screenshot of the preview panel showing sample images and settings](https://raw.githubusercontent.com/shezw/shark-image-vsc-plugin/main/resources/screenshot.png)

## Features

- Scan a configurable workspace directory for supported image files.
- Open a built-in configuration panel and adjust Sharp parameters manually.
- Preview up to three built-in sample images per type on a single horizontal row.
- Group `.jpg` and `.jpeg` samples under a single `JPEG` preview row.
- Run one-click compression across the configured resource directory.
- Generate a full AppIcon asset set from a compliant PNG source with one click.
- Generate rounded-rectangle PNG variants from the Explorer with fixed quick-round presets.
- Add an Explorer right-click submenu named `shark-image` for folders and supported image files.
- Show both saved bytes and saved percentage in preview cards.
- Support English and Chinese in the configuration page.
- Save settings into the workspace so the panel and command stay aligned.

## Supported image types

- JPEG / JPG
- PNG
- WebP

## Commands

- `Shark Image: Open Compression Config`
- `Shark Image: Compress Workspace Images`

## Explorer context menu

Right-click in the Explorer to open the `shark-image` submenu:

- Folder: `compress-all`, `configure`
- Supported image file: `compress`, `configure`
- PNG file: `appicon`
- PNG file: `快速圆角` -> `5%`, `10%`, `15%`, `20%`, `25%`, `30%`, `35%`, `40%`, `45%`, `50%`

`configure` opens the preview page against the clicked folder, or the parent folder of the clicked image file.

`appicon` creates an `AppIcon_<file-name>` directory beside the source PNG, then generates platform-specific icon PNG files for `Android`, `iOS`, `macOS`, `Windows`, and `Linux` using the current PNG compression settings.

`快速圆角` applies an anti-aliased rounded-rectangle mask to the selected PNG and writes the result into the same directory as `<name>_rd_<rr>.png`, where `<rr>` is the two-digit percentage such as `05`, `10`, or `50`.

Quick-round rules:

- Supports both square and non-square PNG files.
- The rounded corner radius is based on the short edge.
- The maximum effective radius is capped at `50%` of the short edge.
- Pixels outside the rounded rectangle remain transparent.

AppIcon source validation rules:

- The source must be a `.png` file.
- The image must be square (`1:1`).
- The width and height must be one of `256`, `512`, `1024`, or `2048`.

## Default directories

- Mirror output: `resources/compressed`

The extension ships with a built-in sample directory at `resources/preview-samples`, with one folder per supported image type. The preview panel always uses these bundled samples so compression tuning stays stable and comparable across workspaces.

The configurable `Resource directory` setting is for workspace image scanning and compression, not for preview sample sourcing.

The preview header now shows `selected / available` counts per type, so if your `Preview samples per type` setting is below `3`, the UI makes that explicit.

Published VSIX packages include the built-in preview sample images so the preview panel works immediately after installation.

## Development

```bash
pnpm install
pnpm run build
```

## Versioning

Use the built-in version scripts to follow the release rules:

```bash
pnpm run version:fix
pnpm run version:feature
pnpm run version:major
```

- `version:fix`: bug fixes, polishing, text updates, resource updates
- `version:feature`: feature additions, feature changes, large resource additions
- `version:major`: milestone releases, multiple features combined, or explicitly requested major releases

Press `F5` in VS Code to launch the extension development host.

## Publish

```bash
pnpm run package
pnpm run publish:vsce
```

Before publishing, make sure the `publisher` field in `package.json` is linked to your Visual Studio Marketplace publisher account.