import * as path from 'path';
import * as vscode from 'vscode';
import { compressFolderImages, compressSingleImage, compressWorkspaceImages, generateAppIconSet, isSupportedImageUri } from './imageService';
import { CompressionPanel } from './panel';
import { CompressionSettings, getSettings, normalizeSettings } from './settings';

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

  context.subscriptions.push(
    outputChannel,
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