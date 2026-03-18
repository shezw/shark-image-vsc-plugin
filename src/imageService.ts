import { createRequire } from 'module';
import * as path from 'path';
import * as vscode from 'vscode';
import { CompressionSettings } from './settings';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
type SharpModule = typeof import('sharp');
let cachedSharp: SharpModule | undefined;

export interface CompressionSummary {
  totalFiles: number;
  writtenFiles: number;
  skippedFiles: number;
  totalBytesBefore: number;
  totalBytesAfter: number;
  errors: string[];
}

export interface PreviewItem {
  fileName: string;
  extension: string;
  originalSize: number;
  compressedSize: number;
  bytesSaved: number;
  savedPercentage: number;
  originalDataUrl: string;
  compressedDataUrl: string;
}

export interface PreviewGroup {
  imageType: string;
  label: string;
  availableCount: number;
  items: PreviewItem[];
}

export interface PreviewPayload {
  sourceDirectory: string;
  resolvedSourceDirectory: string;
  groups: PreviewGroup[];
  warnings: string[];
}

export const BUILTIN_PREVIEW_DIRECTORY = 'resources/preview-samples';

function getImageType(extension: string): 'jpeg' | 'png' | 'webp' | undefined {
  switch (extension.toLowerCase()) {
    case '.jpg':
    case '.jpeg':
      return 'jpeg';
    case '.png':
      return 'png';
    case '.webp':
      return 'webp';
    default:
      return undefined;
  }
}

function getImageTypeLabel(imageType: string): string {
  switch (imageType) {
    case 'jpeg':
      return 'JPEG';
    case 'png':
      return 'PNG';
    case 'webp':
      return 'WebP';
    default:
      return imageType.toUpperCase();
  }
}

function getSharp(): SharpModule {
  if (cachedSharp) {
    return cachedSharp;
  }

  try {
    const appRequire = createRequire(__filename);
    cachedSharp = appRequire('sharp') as SharpModule;
    return cachedSharp;
  } catch {
    const bundledSharpEntry = path.resolve(__dirname, '..', 'runtime-deps', 'node_modules', 'sharp', 'package.json');
    const bundledRequire = createRequire(bundledSharpEntry);
    cachedSharp = bundledRequire('sharp') as SharpModule;
    return cachedSharp;
  }
}

export function isSupportedImageUri(uri: vscode.Uri): boolean {
  return getImageType(path.extname(uri.fsPath)) !== undefined;
}

function getMimeType(extension: string): string {
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function toDataUrl(buffer: Uint8Array, extension: string): string {
  return `data:${getMimeType(extension)};base64,${Buffer.from(buffer).toString('base64')}`;
}

async function pathExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function walkDirectory(root: vscode.Uri, recursive: boolean): Promise<vscode.Uri[]> {
  const collected: vscode.Uri[] = [];
  const entries = await vscode.workspace.fs.readDirectory(root);

  for (const [name, fileType] of entries) {
    const child = vscode.Uri.joinPath(root, name);
    if (fileType === vscode.FileType.Directory && recursive) {
      collected.push(...await walkDirectory(child, recursive));
      continue;
    }

    if (fileType === vscode.FileType.File) {
      collected.push(child);
    }
  }

  return collected;
}

async function collectImageFilesFromDirectory(root: vscode.Uri, recursive: boolean): Promise<vscode.Uri[]> {
  const files = await walkDirectory(root, recursive);
  return files.filter(isSupportedImageUri).sort((left, right) => left.fsPath.localeCompare(right.fsPath));
}

export async function resolveSourceDirectory(workspaceFolder: vscode.WorkspaceFolder, settings: CompressionSettings): Promise<vscode.Uri> {
  const directory = vscode.Uri.joinPath(workspaceFolder.uri, settings.resourceDirectory);
  if (!await pathExists(directory)) {
    throw new Error(`Image directory does not exist: ${settings.resourceDirectory}`);
  }

  return directory;
}

export async function scanImageFiles(workspaceFolder: vscode.WorkspaceFolder, settings: CompressionSettings): Promise<vscode.Uri[]> {
  const sourceDirectory = await resolveSourceDirectory(workspaceFolder, settings);
  return collectImageFilesFromDirectory(sourceDirectory, settings.recursive);
}

export async function compressBuffer(buffer: Uint8Array, extension: string, settings: CompressionSettings): Promise<Buffer> {
  const sharp = getSharp();
  let pipeline = sharp(buffer).rotate();
  if (settings.preserveMetadata) {
    pipeline = pipeline.withMetadata();
  }

  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return pipeline.jpeg({ quality: settings.jpegQuality, mozjpeg: true }).toBuffer();
    case '.png':
      return pipeline.png({ quality: settings.pngQuality, compressionLevel: settings.pngCompressionLevel }).toBuffer();
    case '.webp':
      return pipeline.webp({ quality: settings.webpQuality, effort: settings.webpEffort }).toBuffer();
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}

function buildOutputUri(
  workspaceFolder: vscode.WorkspaceFolder,
  sourceDirectory: vscode.Uri,
  inputFile: vscode.Uri,
  settings: CompressionSettings
): vscode.Uri {
  if (settings.outputMode === 'overwrite') {
    return inputFile;
  }

  const relativePath = path.relative(sourceDirectory.fsPath, inputFile.fsPath);
  return vscode.Uri.joinPath(workspaceFolder.uri, settings.outputDirectory, relativePath.replace(/\\/g, '/'));
}

export async function compressWorkspaceImages(
  workspaceFolder: vscode.WorkspaceFolder,
  settings: CompressionSettings,
  outputChannel: vscode.OutputChannel
): Promise<CompressionSummary> {
  const sourceDirectory = await resolveSourceDirectory(workspaceFolder, settings);
  const files = await scanImageFiles(workspaceFolder, settings);
  return compressImageUris(workspaceFolder, sourceDirectory, files, settings, outputChannel);
}

export async function compressImageUris(
  workspaceFolder: vscode.WorkspaceFolder,
  sourceDirectory: vscode.Uri,
  files: vscode.Uri[],
  settings: CompressionSettings,
  outputChannel: vscode.OutputChannel
): Promise<CompressionSummary> {
  const summary: CompressionSummary = {
    totalFiles: files.length,
    writtenFiles: 0,
    skippedFiles: 0,
    totalBytesBefore: 0,
    totalBytesAfter: 0,
    errors: []
  };

  for (const file of files) {
    const extension = path.extname(file.fsPath).toLowerCase();

    try {
      const originalBuffer = await vscode.workspace.fs.readFile(file);
      const compressedBuffer = await compressBuffer(originalBuffer, extension, settings);
      summary.totalBytesBefore += originalBuffer.byteLength;

      if (compressedBuffer.byteLength >= originalBuffer.byteLength) {
        summary.totalBytesAfter += originalBuffer.byteLength;
        summary.skippedFiles += 1;
        outputChannel.appendLine(`Skipped ${file.fsPath} because compressed output was not smaller.`);
        continue;
      }

      const outputFile = buildOutputUri(workspaceFolder, sourceDirectory, file, settings);
      const outputDirectory = vscode.Uri.file(path.dirname(outputFile.fsPath));
      await vscode.workspace.fs.createDirectory(outputDirectory);
      await vscode.workspace.fs.writeFile(outputFile, compressedBuffer);

      summary.totalBytesAfter += compressedBuffer.byteLength;
      summary.writtenFiles += 1;
      outputChannel.appendLine(`Compressed ${file.fsPath} -> ${outputFile.fsPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(`${file.fsPath}: ${message}`);
      outputChannel.appendLine(`Failed ${file.fsPath}: ${message}`);
    }
  }

  return summary;
}

export async function compressFolderImages(
  workspaceFolder: vscode.WorkspaceFolder,
  folderUri: vscode.Uri,
  settings: CompressionSettings,
  outputChannel: vscode.OutputChannel
): Promise<CompressionSummary> {
  const files = await collectImageFilesFromDirectory(folderUri, settings.recursive);
  return compressImageUris(workspaceFolder, folderUri, files, settings, outputChannel);
}

export async function compressSingleImage(
  workspaceFolder: vscode.WorkspaceFolder,
  fileUri: vscode.Uri,
  settings: CompressionSettings,
  outputChannel: vscode.OutputChannel
): Promise<CompressionSummary> {
  const sourceDirectory = vscode.Uri.file(path.dirname(fileUri.fsPath));
  return compressImageUris(workspaceFolder, sourceDirectory, [fileUri], settings, outputChannel);
}

export async function buildPreviewPayload(
  extensionUri: vscode.Uri,
  settings: CompressionSettings
): Promise<PreviewPayload> {
  const warnings: string[] = [];
  const sourceDirectory = vscode.Uri.joinPath(extensionUri, BUILTIN_PREVIEW_DIRECTORY);
  if (!await pathExists(sourceDirectory)) {
    throw new Error(`Built-in preview directory does not exist: ${BUILTIN_PREVIEW_DIRECTORY}`);
  }

  const files = await collectImageFilesFromDirectory(sourceDirectory, true);
  const grouped = new Map<string, vscode.Uri[]>();

  for (const file of files) {
    const imageType = getImageType(path.extname(file.fsPath).toLowerCase());
    if (!imageType) {
      continue;
    }

    const bucket = grouped.get(imageType) ?? [];
    bucket.push(file);
    grouped.set(imageType, bucket);
  }

  if (files.length === 0) {
    warnings.push('No supported images found in the configured resource directory.');
  }

  const groups: PreviewGroup[] = [];
  for (const [imageType, allFiles] of grouped.entries()) {
    const sampleFiles = allFiles.slice(0, settings.previewSampleCount);
    const items: PreviewItem[] = [];
    for (const sampleFile of sampleFiles) {
      try {
        const originalBuffer = await vscode.workspace.fs.readFile(sampleFile);
        const extension = path.extname(sampleFile.fsPath).toLowerCase();
        const compressedBuffer = await compressBuffer(originalBuffer, extension, settings);
        const bytesSaved = originalBuffer.byteLength - compressedBuffer.byteLength;
        items.push({
          fileName: path.basename(sampleFile.fsPath),
          extension,
          originalSize: originalBuffer.byteLength,
          compressedSize: compressedBuffer.byteLength,
          bytesSaved,
          savedPercentage: originalBuffer.byteLength === 0 ? 0 : (bytesSaved / originalBuffer.byteLength) * 100,
          originalDataUrl: toDataUrl(originalBuffer, extension),
          compressedDataUrl: toDataUrl(compressedBuffer, extension)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        warnings.push(`Preview failed for ${path.basename(sampleFile.fsPath)}: ${message}`);
      }
    }

    groups.push({
      imageType,
      label: getImageTypeLabel(imageType),
      availableCount: allFiles.length,
      items
    });
  }

  groups.sort((left, right) => left.label.localeCompare(right.label));

  return {
    sourceDirectory: BUILTIN_PREVIEW_DIRECTORY,
    resolvedSourceDirectory: sourceDirectory.fsPath,
    groups,
    warnings
  };
}