import * as path from 'path';
import * as vscode from 'vscode';
import { QUICK_ROUND_PERCENTAGES, compressFolderImages, compressSingleImage, compressWorkspaceImages, convertPngColorMode, generateAppIconSet, generateRoundedPng, inspectPngTransparency, isSupportedImageUri } from './imageService';
import { CompressionPanel } from './panel';
import { CompressionSettings, getSettings, normalizeSettings } from './settings';

const DEFAULT_RGB_BACKGROUND = '#ffffff';

function getWorkspaceFolder(resource?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  if (resource) {
    return vscode.workspace.getWorkspaceFolder(resource);
  }

  const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
  if (activeEditorUri) {
    const activeEditorFolder = vscode.workspace.getWorkspaceFolder(activeEditorUri);
    if (activeEditorFolder) {
      return activeEditorFolder;
    }
  }

  return vscode.workspace.workspaceFolders?.[0];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(2)} ${units[index]}`;
}

function isValidHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

async function pickRgbBackgroundColor(initialColor = DEFAULT_RGB_BACKGROUND): Promise<string | undefined> {
  return new Promise((resolve) => {
    const panel = vscode.window.createWebviewPanel(
      'sharkImageRgbBackgroundPicker',
      'Pick RGB background color',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false
      }
    );

    let settled = false;
    const finalize = (value: string | undefined): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(value);
      panel.dispose();
    };

    panel.onDidDispose(() => {
      if (!settled) {
        settled = true;
        resolve(undefined);
      }
    });

    panel.webview.onDidReceiveMessage((message) => {
      if (message?.type === 'confirm' && typeof message.color === 'string' && isValidHexColor(message.color)) {
        finalize(message.color);
        return;
      }

      if (message?.type === 'cancel') {
        finalize(undefined);
      }
    });

    const swatches = ['#ffffff', '#000000', '#f5f5f5', '#d9d9d9', '#ff5757', '#ffbd59', '#7ed957', '#5ce1e6', '#5271ff', '#c16cff'];
    const swatchMarkup = swatches
      .map((color) => `<button class="swatch" data-color="${color}" style="background:${color}" title="${color}"></button>`)
      .join('');

    panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pick RGB background color</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      padding: 24px;
      display: grid;
      gap: 16px;
      background: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
    }
    .card {
      display: grid;
      gap: 16px;
      max-width: 440px;
      padding: 20px;
      border: 1px solid var(--vscode-panel-border);
      border-radius: 12px;
      background: color-mix(in srgb, var(--vscode-editor-background) 88%, #888 12%);
    }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .swatches {
      display: grid;
      grid-template-columns: repeat(5, 40px);
      gap: 10px;
    }
    .swatch {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 2px solid var(--vscode-panel-border);
      cursor: pointer;
    }
    .preview {
      width: 52px;
      height: 52px;
      border-radius: 12px;
      border: 1px solid var(--vscode-panel-border);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08);
    }
    input[type="text"] {
      width: 120px;
      padding: 8px 10px;
      border-radius: 8px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    .actions {
      display: flex;
      gap: 10px;
    }
    button.action {
      padding: 8px 14px;
      border-radius: 8px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
    }
    .primary {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .secondary {
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
    }
    p {
      margin: 0;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="card">
    <p>The PNG contains fully transparent pixels. Pick a background color before converting to RGB.</p>
    <div class="swatches">${swatchMarkup}</div>
    <div class="row">
      <input id="picker" type="color" value="${initialColor}" />
      <input id="hex" type="text" value="${initialColor}" spellcheck="false" />
      <div id="preview" class="preview" style="background:${initialColor}"></div>
    </div>
    <div class="actions">
      <button id="confirm" class="action primary">Use color</button>
      <button id="cancel" class="action secondary">Cancel</button>
    </div>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const picker = document.getElementById('picker');
    const hex = document.getElementById('hex');
    const preview = document.getElementById('preview');
    const applyColor = (value) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
        return;
      }
      picker.value = value;
      hex.value = value.toLowerCase();
      preview.style.background = value;
    };
    picker.addEventListener('input', () => applyColor(picker.value));
    hex.addEventListener('input', () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
        applyColor(hex.value);
      }
    });
    document.querySelectorAll('.swatch').forEach((button) => {
      button.addEventListener('click', () => applyColor(button.dataset.color));
    });
    document.getElementById('confirm').addEventListener('click', () => {
      vscode.postMessage({ type: 'confirm', color: hex.value });
    });
    document.getElementById('cancel').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });
  </script>
</body>
</html>`;
  });
}

async function runCompression(
  outputChannel: vscode.OutputChannel,
  candidate?: Partial<CompressionSettings>,
  targetWorkspaceFolder?: vscode.WorkspaceFolder
): Promise<void> {
  const workspaceFolder = targetWorkspaceFolder ?? getWorkspaceFolder();
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Open a workspace before running Shark Image.');
    return;
  }

  const settings = normalizeSettings(candidate ?? getSettings(workspaceFolder), workspaceFolder);
  outputChannel.show(true);
  outputChannel.appendLine('--- Shark Image batch started ---');

  try {
    const summary = await compressWorkspaceImages(workspaceFolder, settings, outputChannel);
    const reducedBytes = summary.totalBytesBefore - summary.totalBytesAfter;
    const message = `Processed ${summary.totalFiles} files. Wrote ${summary.writtenFiles}, skipped ${summary.skippedFiles}, saved ${formatBytes(Math.max(reducedBytes, 0))}.`;
    outputChannel.appendLine(message);

    if (summary.errors.length > 0) {
      outputChannel.appendLine('Errors:');
      for (const error of summary.errors) {
        outputChannel.appendLine(error);
      }
      vscode.window.showWarningMessage(`${message} ${summary.errors.length} files failed. Check the Shark Image output channel.`);
      return;
    }

    vscode.window.showInformationMessage(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Batch failed: ${message}`);
    vscode.window.showErrorMessage(`Shark Image failed: ${message}`);
  }
}

async function runFolderCompression(
  outputChannel: vscode.OutputChannel,
  folderUri: vscode.Uri,
  candidate?: Partial<CompressionSettings>
): Promise<void> {
  const workspaceFolder = getWorkspaceFolder(folderUri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Select a folder inside the current workspace before running Shark Image.');
    return;
  }

  const settings = normalizeSettings(candidate ?? getSettings(workspaceFolder), workspaceFolder);
  outputChannel.show(true);
  outputChannel.appendLine(`--- Shark Image folder batch started: ${folderUri.fsPath} ---`);

  try {
    const summary = await compressFolderImages(workspaceFolder, folderUri, settings, outputChannel);
    const reducedBytes = summary.totalBytesBefore - summary.totalBytesAfter;
    const message = `Processed ${summary.totalFiles} files in folder. Wrote ${summary.writtenFiles}, skipped ${summary.skippedFiles}, saved ${formatBytes(Math.max(reducedBytes, 0))}.`;
    outputChannel.appendLine(message);

    if (summary.errors.length > 0) {
      outputChannel.appendLine('Errors:');
      for (const error of summary.errors) {
        outputChannel.appendLine(error);
      }
      vscode.window.showWarningMessage(`${message} ${summary.errors.length} files failed. Check the Shark Image output channel.`);
      return;
    }

    vscode.window.showInformationMessage(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Folder batch failed: ${message}`);
    vscode.window.showErrorMessage(`Shark Image failed: ${message}`);
  }
}

async function runSingleFileCompression(
  outputChannel: vscode.OutputChannel,
  fileUri: vscode.Uri,
  candidate?: Partial<CompressionSettings>
): Promise<void> {
  const workspaceFolder = getWorkspaceFolder(fileUri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Select a file inside the current workspace before running Shark Image.');
    return;
  }

  if (!isSupportedImageUri(fileUri)) {
    vscode.window.showErrorMessage('Shark Image only supports .jpg, .jpeg, .png, and .webp files.');
    return;
  }

  const settings = normalizeSettings(candidate ?? getSettings(workspaceFolder), workspaceFolder);
  outputChannel.show(true);
  outputChannel.appendLine(`--- Shark Image file compression started: ${fileUri.fsPath} ---`);

  try {
    const summary = await compressSingleImage(workspaceFolder, fileUri, settings, outputChannel);
    const reducedBytes = summary.totalBytesBefore - summary.totalBytesAfter;
    const message = `Processed ${summary.totalFiles} file. Wrote ${summary.writtenFiles}, skipped ${summary.skippedFiles}, saved ${formatBytes(Math.max(reducedBytes, 0))}.`;
    outputChannel.appendLine(message);

    if (summary.errors.length > 0) {
      outputChannel.appendLine('Errors:');
      for (const error of summary.errors) {
        outputChannel.appendLine(error);
      }
      vscode.window.showWarningMessage(`${message} ${summary.errors.length} files failed. Check the Shark Image output channel.`);
      return;
    }

    vscode.window.showInformationMessage(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`File compression failed: ${message}`);
    vscode.window.showErrorMessage(`Shark Image failed: ${message}`);
  }
}

async function runAppIconGeneration(outputChannel: vscode.OutputChannel, fileUri: vscode.Uri): Promise<void> {
  const workspaceFolder = getWorkspaceFolder(fileUri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Select a PNG file inside the current workspace before generating AppIcon assets.');
    return;
  }

  if (path.extname(fileUri.fsPath).toLowerCase() !== '.png') {
    vscode.window.showErrorMessage('AppIcon generation only supports .png files.');
    return;
  }

  const settings = normalizeSettings(getSettings(workspaceFolder), workspaceFolder);
  outputChannel.show(true);
  outputChannel.appendLine(`--- Shark Image AppIcon generation started: ${fileUri.fsPath} ---`);

  try {
    const summary = await generateAppIconSet(workspaceFolder, fileUri, settings, outputChannel);
    const reducedBytes = summary.totalBytesBefore - summary.totalBytesAfter;
    const message = `Generated ${summary.writtenFiles} AppIcon files in ${summary.outputDirectory}. Saved ${formatBytes(Math.max(reducedBytes, 0))}.`;
    outputChannel.appendLine(message);
    vscode.window.showInformationMessage(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`AppIcon generation failed: ${message}`);
    vscode.window.showErrorMessage(`Shark Image AppIcon generation failed: ${message}`);
  }
}

async function runQuickRound(outputChannel: vscode.OutputChannel, fileUri: vscode.Uri, radiusPercentage: number): Promise<void> {
  const workspaceFolder = getWorkspaceFolder(fileUri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('Select a PNG file inside the current workspace before generating a rounded PNG.');
    return;
  }

  if (path.extname(fileUri.fsPath).toLowerCase() !== '.png') {
    vscode.window.showErrorMessage('Quick round only supports .png files.');
    return;
  }

  const settings = normalizeSettings(getSettings(workspaceFolder), workspaceFolder);
  outputChannel.show(true);
  outputChannel.appendLine(`--- Shark Image quick round started: ${fileUri.fsPath} (${radiusPercentage}%) ---`);

  try {
    const summary = await generateRoundedPng(workspaceFolder, fileUri, radiusPercentage, settings, outputChannel);
    const message = `Generated rounded PNG ${path.basename(summary.outputFile)} with ${summary.radiusPercentage}% radius (${summary.radiusPixels.toFixed(2)} px).`;
    outputChannel.appendLine(message);
    vscode.window.showInformationMessage(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`Quick round failed: ${message}`);
    vscode.window.showErrorMessage(`Shark Image quick round failed: ${message}`);
  }
}

async function runPngColorModeConversion(outputChannel: vscode.OutputChannel, fileUri: vscode.Uri, colorMode: 'rgb' | 'rgba'): Promise<void> {
  const workspaceFolder = getWorkspaceFolder(fileUri);
  if (!workspaceFolder) {
    vscode.window.showErrorMessage(`Select a PNG file inside the current workspace before running to${colorMode.toUpperCase()}.`);
    return;
  }

  if (path.extname(fileUri.fsPath).toLowerCase() !== '.png') {
    vscode.window.showErrorMessage(`to${colorMode.toUpperCase()} only supports .png files.`);
    return;
  }

  const settings = normalizeSettings(getSettings(workspaceFolder), workspaceFolder);
  let backgroundColor: string | undefined;

  if (colorMode === 'rgb') {
    const transparencyInfo = await inspectPngTransparency(fileUri);
    if (transparencyInfo.hasFullyTransparentPixel) {
      backgroundColor = await pickRgbBackgroundColor();
      if (!backgroundColor) {
        vscode.window.showInformationMessage('Shark Image toRGB cancelled.');
        return;
      }
    }
  }

  outputChannel.show(true);
  outputChannel.appendLine(`--- Shark Image to${colorMode.toUpperCase()} started: ${fileUri.fsPath} ---`);

  try {
    const summary = await convertPngColorMode(workspaceFolder, fileUri, colorMode, backgroundColor, settings, outputChannel);
    const message = `Generated ${path.basename(summary.outputFile)} using to${summary.colorMode.toUpperCase()} (channels=${summary.outputChannels}, hasAlpha=${summary.outputHasAlpha}).`;
    outputChannel.appendLine(message);
    vscode.window.showInformationMessage(message);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    outputChannel.appendLine(`to${colorMode.toUpperCase()} failed: ${message}`);
    vscode.window.showErrorMessage(`Shark Image to${colorMode.toUpperCase()} failed: ${message}`);
  }
}

function buildContextSettings(resource: vscode.Uri | undefined): Partial<CompressionSettings> | undefined {
  if (!resource) {
    return undefined;
  }

  const workspaceFolder = getWorkspaceFolder(resource);
  if (!workspaceFolder) {
    return undefined;
  }

  const targetDirectory = isSupportedImageUri(resource) ? path.dirname(resource.fsPath) : resource.fsPath;
  const relativeDirectory = path.relative(workspaceFolder.uri.fsPath, targetDirectory).replace(/\\/g, '/');
  if (!relativeDirectory || relativeDirectory.startsWith('..')) {
    return undefined;
  }

  return {
    ...getSettings(workspaceFolder),
    resourceDirectory: relativeDirectory
  };
}

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('Shark Image');
  const extensionVersion = String(context.extension.packageJSON.version ?? '0.0.0');
  const quickRoundCommands = QUICK_ROUND_PERCENTAGES.map((percentage) =>
    vscode.commands.registerCommand(`sharkImage.quickRound.${percentage}`, async (resource: vscode.Uri) => {
      await runQuickRound(outputChannel, resource, percentage);
    })
  );

  context.subscriptions.push(
    outputChannel,
    ...quickRoundCommands,
    vscode.commands.registerCommand('sharkImage.convertPngToRgba', async (resource: vscode.Uri) => {
      await runPngColorModeConversion(outputChannel, resource, 'rgba');
    }),
    vscode.commands.registerCommand('sharkImage.convertPngToRgb', async (resource: vscode.Uri) => {
      await runPngColorModeConversion(outputChannel, resource, 'rgb');
    }),
    vscode.commands.registerCommand('sharkImage.openCompressionConfig', () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('Open a workspace before configuring Shark Image.');
        return;
      }

      CompressionPanel.open(
        context.extensionUri,
        workspaceFolder,
        async (settings) => runCompression(outputChannel, settings, workspaceFolder),
        extensionVersion
      );
    }),
    vscode.commands.registerCommand('sharkImage.compressWorkspaceImages', async () => {
      const workspaceFolder = getWorkspaceFolder();
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('Open a workspace before running Shark Image.');
        return;
      }

      await runCompression(outputChannel, undefined, workspaceFolder);
    }),
    vscode.commands.registerCommand('sharkImage.compressFolder', async (resource: vscode.Uri) => {
      await runFolderCompression(outputChannel, resource);
    }),
    vscode.commands.registerCommand('sharkImage.compressFile', async (resource: vscode.Uri) => {
      await runSingleFileCompression(outputChannel, resource);
    }),
    vscode.commands.registerCommand('sharkImage.generateAppIconSet', async (resource: vscode.Uri) => {
      await runAppIconGeneration(outputChannel, resource);
    }),
    vscode.commands.registerCommand('sharkImage.configureFromExplorer', (resource: vscode.Uri | undefined) => {
      const workspaceFolder = getWorkspaceFolder(resource);
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('Select a resource inside the current workspace before configuring Shark Image.');
        return;
      }

      CompressionPanel.open(
        context.extensionUri,
        workspaceFolder,
        async (settings) => runCompression(outputChannel, settings, workspaceFolder),
        extensionVersion,
        buildContextSettings(resource)
      );
    })
  );
}

export function deactivate(): void {
  return;
}