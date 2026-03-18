import * as path from 'path';
import * as vscode from 'vscode';
import { buildPreviewPayload, BUILTIN_PREVIEW_DIRECTORY, PreviewPayload } from './imageService';
import { CompressionSettings, getSettings, normalizeSettings, saveSettings } from './settings';

interface WebviewStateMessage {
  type: 'state';
  settings: CompressionSettings;
  preview: PreviewPayload;
  workspaceName: string;
  locale: string;
  version: string;
}

export class CompressionPanel implements vscode.Disposable {
  private static currentPanel: CompressionPanel | undefined;

  public static open(
    extensionUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    onRunCompression: (settings: CompressionSettings) => Promise<void>,
    extensionVersion: string,
    initialSettings?: Partial<CompressionSettings>
  ): void {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (CompressionPanel.currentPanel) {
      CompressionPanel.currentPanel.panel.reveal(column);
      CompressionPanel.currentPanel.workspaceFolder = workspaceFolder;
      CompressionPanel.currentPanel.extensionVersion = extensionVersion;
      CompressionPanel.currentPanel.renderHtml();
      void CompressionPanel.currentPanel.refresh(initialSettings);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sharkImage.config',
      'Shark Image Config',
      column ?? vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
      }
    );

    CompressionPanel.currentPanel = new CompressionPanel(panel, extensionUri, workspaceFolder, onRunCompression, extensionVersion, initialSettings);
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly extensionUri: vscode.Uri;
  private workspaceFolder: vscode.WorkspaceFolder;
  private readonly onRunCompression: (settings: CompressionSettings) => Promise<void>;
  private readonly disposables: vscode.Disposable[] = [];
  private extensionVersion: string;
  private initialSettings?: Partial<CompressionSettings>;

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    onRunCompression: (settings: CompressionSettings) => Promise<void>,
    extensionVersion: string,
    initialSettings?: Partial<CompressionSettings>
  ) {
    this.panel = panel;
    this.extensionUri = extensionUri;
    this.workspaceFolder = workspaceFolder;
    this.onRunCompression = onRunCompression;
    this.extensionVersion = extensionVersion;
    this.initialSettings = initialSettings;

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage((message) => void this.handleMessage(message), null, this.disposables);
    this.renderHtml();
    void this.refresh(initialSettings);
  }

  public dispose(): void {
    CompressionPanel.currentPanel = undefined;
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
    this.panel.dispose();
  }

  private async handleMessage(message: { type: string; settings?: Partial<CompressionSettings> }): Promise<void> {
    switch (message.type) {
      case 'requestState':
        await this.refresh(this.initialSettings);
        return;
      case 'clearCache':
        this.initialSettings = message.settings;
        this.renderHtml();
        await this.refresh(message.settings);
        return;
      case 'updatePreview':
        await this.refresh(message.settings);
        return;
      case 'saveSettings': {
        const settings = normalizeSettings(message.settings, this.workspaceFolder);
        await saveSettings(settings, this.workspaceFolder);
        this.initialSettings = undefined;
        vscode.window.showInformationMessage('Shark Image settings saved to workspace configuration.');
        await this.refresh();
        return;
      }
      case 'chooseDirectory':
        await this.chooseDirectory();
        return;
      case 'runCompression': {
        const settings = normalizeSettings(message.settings, this.workspaceFolder);
        await this.onRunCompression(settings);
        await this.refresh(settings);
        return;
      }
      default:
        return;
    }
  }

  private async chooseDirectory(): Promise<void> {
    const workspaceFolder = this.workspaceFolder;
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('Open a workspace before selecting an image directory.');
      return;
    }

    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      defaultUri: workspaceFolder.uri,
      openLabel: 'Select Image Directory'
    });

    if (!selected?.length) {
      return;
    }

    const relative = path.relative(workspaceFolder.uri.fsPath, selected[0].fsPath).replace(/\\/g, '/');
    if (relative.startsWith('..')) {
      vscode.window.showErrorMessage('The selected directory must be inside the current workspace.');
      return;
    }

    const settings = normalizeSettings({
      ...getSettings(workspaceFolder),
      resourceDirectory: relative
    }, workspaceFolder);

    await saveSettings(settings, workspaceFolder);
    await this.refresh(settings);
  }

  private async refresh(candidate?: Partial<CompressionSettings>): Promise<void> {
    const workspaceFolder = this.workspaceFolder;
    if (!workspaceFolder) {
      await this.panel.webview.postMessage({
        type: 'error',
        message: 'Open a workspace to configure Shark Image.'
      });
      return;
    }

    const settings = normalizeSettings(candidate ?? getSettings(workspaceFolder), workspaceFolder);
    this.initialSettings = candidate;

    try {
      const preview = await buildPreviewPayload(this.extensionUri, settings);
      const message: WebviewStateMessage = {
        type: 'state',
        settings,
        preview,
        workspaceName: workspaceFolder.name,
        locale: vscode.env.language,
        version: this.extensionVersion
      };
      await this.panel.webview.postMessage(message);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.panel.webview.postMessage({
        type: 'state',
        settings,
        preview: {
          sourceDirectory: BUILTIN_PREVIEW_DIRECTORY,
          resolvedSourceDirectory: vscode.Uri.joinPath(this.extensionUri, BUILTIN_PREVIEW_DIRECTORY).fsPath,
          groups: [],
          warnings: [message]
        },
        workspaceName: workspaceFolder.name,
        locale: vscode.env.language,
        version: this.extensionVersion
      });
    }
  }

  private renderHtml(): void {
    this.panel.webview.html = this.getHtml();
  }

  private getHtml(): string {
    const scriptUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'));
    const styleUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));
    const nonce = `${Date.now()}${Math.random().toString(36).slice(2)}`;

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https:; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="${styleUri}" />
    <title>Shark Image Config</title>
  </head>
  <body>
    <div class="shell">
      <header class="hero">
        <div>
          <p id="eyebrow" class="eyebrow">SHARK IMAGE</p>
          <h1 id="hero-title">Workspace image compression</h1>
          <p id="hero-version" class="hero-version">v0.0.0</p>
          <p id="hero-copy" class="hero-copy">Tune Sharp compression parameters, preview the result per image type, then run a single workspace batch.</p>
        </div>
        <div class="hero-actions">
          <button id="toggle-language" class="button secondary" type="button">中文</button>
          <button id="clear-cache" class="button secondary" type="button">Clear cache</button>
          <button id="choose-directory" class="button secondary" type="button">Choose directory</button>
          <button id="save-settings" class="button secondary" type="button">Save settings</button>
          <button id="run-compression" class="button primary" type="button">Compress now</button>
        </div>
      </header>

      <section class="workspace-card">
        <div>
          <span id="workspace-label" class="label">Workspace</span>
          <strong id="workspace-name">-</strong>
        </div>
        <div>
          <span id="resource-directory-label" class="label">Resource directory</span>
          <strong id="resource-directory">-</strong>
        </div>
      </section>

      <section class="config-grid">
        <label>
          <span id="output-mode-label">Output mode</span>
          <select name="outputMode">
            <option id="output-mode-mirror" value="mirror">Mirror directory</option>
            <option id="output-mode-overwrite" value="overwrite">Overwrite source</option>
          </select>
        </label>
        <label>
          <span id="output-directory-label">Output directory</span>
          <input name="outputDirectory" type="text" />
        </label>
        <label>
          <span id="preview-sample-count-label">Preview samples per type</span>
          <input name="previewSampleCount" type="number" min="1" max="3" />
        </label>
        <label class="toggle">
          <span id="recursive-label">Recursive scan</span>
          <input name="recursive" type="checkbox" />
        </label>
        <label class="toggle">
          <span id="preserve-metadata-label">Preserve metadata</span>
          <input name="preserveMetadata" type="checkbox" />
        </label>
      </section>

      <section class="format-grid">
        <article class="format-card">
          <h2 id="jpeg-title">JPEG</h2>
          <label>
            <span id="jpeg-quality-label">Quality</span>
            <input name="jpegQuality" type="range" min="1" max="100" />
            <output data-output-for="jpegQuality"></output>
          </label>
        </article>
        <article class="format-card">
          <h2 id="png-title">PNG</h2>
          <label>
            <span id="png-quality-label">Palette quality</span>
            <input name="pngQuality" type="range" min="1" max="100" />
            <output data-output-for="pngQuality"></output>
          </label>
          <label>
            <span id="png-compression-level-label">Compression level</span>
            <input name="pngCompressionLevel" type="range" min="0" max="9" />
            <output data-output-for="pngCompressionLevel"></output>
          </label>
        </article>
        <article class="format-card">
          <h2 id="webp-title">WebP</h2>
          <label>
            <span id="webp-quality-label">Quality</span>
            <input name="webpQuality" type="range" min="1" max="100" />
            <output data-output-for="webpQuality"></output>
          </label>
          <label>
            <span id="webp-effort-label">Effort</span>
            <input name="webpEffort" type="range" min="0" max="6" />
            <output data-output-for="webpEffort"></output>
          </label>
        </article>
      </section>

      <section class="preview-section">
        <div class="section-heading">
          <div>
            <p id="preview-eyebrow" class="eyebrow">LIVE PREVIEW</p>
            <h2 id="preview-title">Three samples per row, grouped by image type</h2>
            <p class="sample-path-block">
              <span id="sample-path-label" class="sample-path-label">Sample path</span>
              <strong id="sample-path" class="sample-path">-</strong>
            </p>
          </div>
          <p id="warning-text" class="warning-text"></p>
        </div>
        <div id="preview-groups" class="preview-groups"></div>
      </section>
    </div>

    <div id="image-modal" class="image-modal hidden" aria-hidden="true">
      <div id="image-modal-backdrop" class="image-modal-backdrop"></div>
      <div class="image-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="image-modal-title">
        <div class="image-modal-header">
          <div>
            <p id="image-modal-kicker" class="eyebrow">IMAGE PREVIEW</p>
            <h2 id="image-modal-title">Preview</h2>
          </div>
          <button id="image-modal-close" class="button secondary image-modal-close" type="button">Close</button>
        </div>
        <img id="image-modal-image" class="image-modal-image" alt="Expanded preview" />
      </div>
    </div>

    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
  }
}