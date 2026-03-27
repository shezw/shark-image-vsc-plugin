import { createRequire } from 'module';
import * as path from 'path';
import * as vscode from 'vscode';
import { CompressionSettings } from './settings';

const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
type SharpModule = typeof import('sharp');
let cachedSharp: SharpModule | undefined;

const APP_ICON_INPUT_SIZES = new Set([256, 512, 1024, 2048]);
export const QUICK_ROUND_PERCENTAGES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50] as const;

const APP_ICON_TARGETS = {
  Android: [
    { directory: ['mipmap-mdpi'], fileName: 'ic_launcher.png', size: 48 },
    { directory: ['mipmap-hdpi'], fileName: 'ic_launcher.png', size: 72 },
    { directory: ['mipmap-xhdpi'], fileName: 'ic_launcher.png', size: 96 },
    { directory: ['mipmap-xxhdpi'], fileName: 'ic_launcher.png', size: 144 },
    { directory: ['mipmap-xxxhdpi'], fileName: 'ic_launcher.png', size: 192 },
    { directory: ['play-store'], fileName: 'ic_launcher_512.png', size: 512 }
  ],
  iOS: [
    { directory: [], fileName: 'Icon-App-20x20@1x.png', size: 20 },
    { directory: [], fileName: 'Icon-App-20x20@2x.png', size: 40 },
    { directory: [], fileName: 'Icon-App-20x20@3x.png', size: 60 },
    { directory: [], fileName: 'Icon-App-29x29@1x.png', size: 29 },
    { directory: [], fileName: 'Icon-App-29x29@2x.png', size: 58 },
    { directory: [], fileName: 'Icon-App-29x29@3x.png', size: 87 },
    { directory: [], fileName: 'Icon-App-40x40@2x.png', size: 80 },
    { directory: [], fileName: 'Icon-App-40x40@3x.png', size: 120 },
    { directory: [], fileName: 'Icon-App-60x60@2x.png', size: 120 },
    { directory: [], fileName: 'Icon-App-60x60@3x.png', size: 180 },
    { directory: [], fileName: 'Icon-App-76x76.png', size: 76 },
    { directory: [], fileName: 'Icon-App-76x76@2x.png', size: 152 },
    { directory: [], fileName: 'Icon-App-83.5x83.5@2x.png', size: 167 },
    { directory: [], fileName: 'Icon-App-1024x1024@1x.png', size: 1024 }
  ],
  macOS: [
    { directory: [], fileName: 'icon_16x16.png', size: 16 },
    { directory: [], fileName: 'icon_16x16@2x.png', size: 32 },
    { directory: [], fileName: 'icon_32x32.png', size: 32 },
    { directory: [], fileName: 'icon_32x32@2x.png', size: 64 },
    { directory: [], fileName: 'icon_128x128.png', size: 128 },
    { directory: [], fileName: 'icon_128x128@2x.png', size: 256 },
    { directory: [], fileName: 'icon_256x256.png', size: 256 },
    { directory: [], fileName: 'icon_256x256@2x.png', size: 512 },
    { directory: [], fileName: 'icon_512x512.png', size: 512 },
    { directory: [], fileName: 'icon_512x512@2x.png', size: 1024 }
  ],
  Windows: [
    { directory: [], fileName: 'app_icon_16.png', size: 16 },
    { directory: [], fileName: 'app_icon_24.png', size: 24 },
    { directory: [], fileName: 'app_icon_32.png', size: 32 },
    { directory: [], fileName: 'app_icon_48.png', size: 48 },
    { directory: [], fileName: 'app_icon_64.png', size: 64 },
    { directory: [], fileName: 'app_icon_128.png', size: 128 },
    { directory: [], fileName: 'app_icon_256.png', size: 256 }
  ],
  Linux: [
    { directory: [], fileName: 'app_icon_16.png', size: 16 },
    { directory: [], fileName: 'app_icon_24.png', size: 24 },
    { directory: [], fileName: 'app_icon_32.png', size: 32 },
    { directory: [], fileName: 'app_icon_48.png', size: 48 },
    { directory: [], fileName: 'app_icon_64.png', size: 64 },
    { directory: [], fileName: 'app_icon_128.png', size: 128 },
    { directory: [], fileName: 'app_icon_256.png', size: 256 },
    { directory: [], fileName: 'app_icon_512.png', size: 512 }
  ]
} as const;

export interface CompressionSummary {
  totalFiles: number;
  writtenFiles: number;
  skippedFiles: number;
  totalBytesBefore: number;
  totalBytesAfter: number;
  errors: string[];
}

export interface AppIconGenerationSummary {
  outputDirectory: string;
  writtenFiles: number;
  totalBytesBefore: number;
  totalBytesAfter: number;
}

export interface RoundedPngSummary {
  outputFile: string;
  radiusPercentage: number;
  radiusPixels: number;
  totalBytesBefore: number;
  totalBytesAfter: number;
}

export interface PngColorModeSummary {
  outputFile: string;
  colorMode: 'rgb' | 'rgba';
  outputChannels: number;
  outputHasAlpha: boolean;
  totalBytesBefore: number;
  totalBytesAfter: number;
}

export interface PngTransparencyInfo {
  hasTransparency: boolean;
  hasFullyTransparentPixel: boolean;
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

async function resizePngBuffer(buffer: Uint8Array, size: number, preserveMetadata: boolean): Promise<Buffer> {
  const sharp = getSharp();
  let pipeline = sharp(buffer).rotate().resize(size, size, { fit: 'cover' });
  if (preserveMetadata) {
    pipeline = pipeline.withMetadata();
  }

  return pipeline.png().toBuffer();
}

function formatRoundedPercentage(radiusPercentage: number): string {
  return String(radiusPercentage).padStart(2, '0');
}

function escapeSvgAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function createRoundedMaskSvg(width: number, height: number, radiusPixels: number): Buffer {
  const safeWidth = Math.max(width, 1);
  const safeHeight = Math.max(height, 1);
  const safeRadius = Math.max(0, Math.min(radiusPixels, Math.min(safeWidth, safeHeight) / 2));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${escapeSvgAttribute(String(safeWidth))}" height="${escapeSvgAttribute(String(safeHeight))}" viewBox="0 0 ${escapeSvgAttribute(String(safeWidth))} ${escapeSvgAttribute(String(safeHeight))}">`,
    `<rect x="0" y="0" width="${escapeSvgAttribute(String(safeWidth))}" height="${escapeSvgAttribute(String(safeHeight))}" rx="${escapeSvgAttribute(String(safeRadius))}" ry="${escapeSvgAttribute(String(safeRadius))}" fill="white"/>`,
    '</svg>'
  ].join('');

  return Buffer.from(svg, 'utf8');
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

export async function generateAppIconSet(
  workspaceFolder: vscode.WorkspaceFolder,
  fileUri: vscode.Uri,
  settings: CompressionSettings,
  outputChannel: vscode.OutputChannel
): Promise<AppIconGenerationSummary> {
  const extension = path.extname(fileUri.fsPath).toLowerCase();
  if (extension !== '.png') {
    throw new Error('AppIcon generation only supports .png files.');
  }

  const sharp = getSharp();
  const originalBuffer = await vscode.workspace.fs.readFile(fileUri);
  const metadata = await sharp(originalBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    throw new Error('Unable to read PNG dimensions.');
  }

  if (width !== height) {
    throw new Error(`AppIcon source must be 1:1. Current size is ${width}x${height}.`);
  }

  if (!APP_ICON_INPUT_SIZES.has(width)) {
    throw new Error('AppIcon source size must be one of 256, 512, 1024, or 2048 pixels.');
  }

  const appIconRoot = vscode.Uri.joinPath(fileUri.with({ path: path.dirname(fileUri.path) }), `AppIcon_${path.parse(fileUri.fsPath).name}`);
  await vscode.workspace.fs.createDirectory(appIconRoot);

  const summary: AppIconGenerationSummary = {
    outputDirectory: appIconRoot.fsPath,
    writtenFiles: 0,
    totalBytesBefore: 0,
    totalBytesAfter: 0
  };

  for (const [platform, targets] of Object.entries(APP_ICON_TARGETS)) {
    for (const target of targets) {
      const resizedBuffer = await resizePngBuffer(originalBuffer, target.size, settings.preserveMetadata);
      const compressedBuffer = await compressBuffer(resizedBuffer, '.png', settings);
      const targetDirectory = target.directory.reduce(
        (current, segment) => vscode.Uri.joinPath(current, segment),
        vscode.Uri.joinPath(appIconRoot, platform)
      );

      await vscode.workspace.fs.createDirectory(targetDirectory);
      const targetFile = vscode.Uri.joinPath(targetDirectory, target.fileName);
      await vscode.workspace.fs.writeFile(targetFile, compressedBuffer);

      summary.totalBytesBefore += resizedBuffer.byteLength;
      summary.totalBytesAfter += compressedBuffer.byteLength;
      summary.writtenFiles += 1;
      outputChannel.appendLine(`Generated ${platform}/${[...target.directory, target.fileName].join('/')} (${target.size}x${target.size})`);
    }
  }

  return summary;
}

export async function generateRoundedPng(
  workspaceFolder: vscode.WorkspaceFolder,
  fileUri: vscode.Uri,
  radiusPercentage: number,
  settings: CompressionSettings,
  outputChannel: vscode.OutputChannel
): Promise<RoundedPngSummary> {
  void workspaceFolder;

  const extension = path.extname(fileUri.fsPath).toLowerCase();
  if (extension !== '.png') {
    throw new Error('Quick round only supports .png files.');
  }

  if (!QUICK_ROUND_PERCENTAGES.includes(radiusPercentage as typeof QUICK_ROUND_PERCENTAGES[number])) {
    throw new Error('Quick round percentage must be one of 5, 10, 15, 20, 25, 30, 35, 40, 45, or 50.');
  }

  const sharp = getSharp();
  const originalBuffer = await vscode.workspace.fs.readFile(fileUri);
  const metadata = await sharp(originalBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  if (!width || !height) {
    throw new Error('Unable to read PNG dimensions.');
  }

  const shortEdge = Math.min(width, height);
  const radiusPixels = Math.min(shortEdge * (radiusPercentage / 100), shortEdge * 0.5);
  const roundedMask = createRoundedMaskSvg(width, height, radiusPixels);

  let pipeline = sharp(originalBuffer)
    .rotate()
    .ensureAlpha()
    .composite([{ input: roundedMask, blend: 'dest-in' }]);

  if (settings.preserveMetadata) {
    pipeline = pipeline.withMetadata();
  }

  const roundedBuffer = await pipeline.png({ quality: settings.pngQuality, compressionLevel: settings.pngCompressionLevel }).toBuffer();
  const parsedPath = path.parse(fileUri.fsPath);
  const outputFile = vscode.Uri.joinPath(fileUri.with({ path: path.dirname(fileUri.path) }), `${parsedPath.name}_rd_${formatRoundedPercentage(radiusPercentage)}.png`);

  await vscode.workspace.fs.writeFile(outputFile, roundedBuffer);
  outputChannel.appendLine(`Generated rounded PNG ${fileUri.fsPath} -> ${outputFile.fsPath} (${radiusPercentage}%, ${radiusPixels.toFixed(2)}px)`);

  return {
    outputFile: outputFile.fsPath,
    radiusPercentage,
    radiusPixels,
    totalBytesBefore: originalBuffer.byteLength,
    totalBytesAfter: roundedBuffer.byteLength
  };
}

export async function inspectPngTransparency(fileUri: vscode.Uri): Promise<PngTransparencyInfo> {
  const extension = path.extname(fileUri.fsPath).toLowerCase();
  if (extension !== '.png') {
    throw new Error('Transparency inspection only supports .png files.');
  }

  const sharp = getSharp();
  const originalBuffer = await vscode.workspace.fs.readFile(fileUri);
  const stats = await sharp(originalBuffer).ensureAlpha().stats();
  const alphaChannel = stats.channels[3];
  const minAlpha = alphaChannel?.min ?? 255;

  return {
    hasTransparency: minAlpha < 255,
    hasFullyTransparentPixel: minAlpha === 0
  };
}

async function inspectPngBufferColorMode(buffer: Uint8Array): Promise<{ channels: number; hasAlpha: boolean }> {
  const sharp = getSharp();
  const metadata = await sharp(buffer).metadata();
  return {
    channels: metadata.channels ?? 0,
    hasAlpha: metadata.hasAlpha === true
  };
}

async function inspectPngFileColorMode(fileUri: vscode.Uri): Promise<{ channels: number; hasAlpha: boolean }> {
  const sharp = getSharp();
  const buffer = await vscode.workspace.fs.readFile(fileUri);
  const metadata = await sharp(buffer).metadata();

  return {
    channels: metadata.channels ?? 0,
    hasAlpha: metadata.hasAlpha === true
  };
}

function assertPngColorModeInfo(
  fileUri: vscode.Uri,
  colorMode: 'rgb' | 'rgba',
  info: { channels: number; hasAlpha: boolean }
): void {
  if (colorMode === 'rgba' && (!info.hasAlpha || info.channels !== 4)) {
    throw new Error(`toRGBA target file is not RGBA. target=${fileUri.fsPath}, channels=${info.channels}, hasAlpha=${info.hasAlpha}`);
  }

  if (colorMode === 'rgb' && (info.hasAlpha || info.channels !== 3)) {
    throw new Error(`toRGB target file is not RGB. target=${fileUri.fsPath}, channels=${info.channels}, hasAlpha=${info.hasAlpha}`);
  }
}

export async function convertPngColorMode(
  workspaceFolder: vscode.WorkspaceFolder,
  fileUri: vscode.Uri,
  colorMode: 'rgb' | 'rgba',
  backgroundColor: string | undefined,
  settings: CompressionSettings,
  outputChannel: vscode.OutputChannel
): Promise<PngColorModeSummary> {
  void workspaceFolder;

  const extension = path.extname(fileUri.fsPath).toLowerCase();
  if (extension !== '.png') {
    throw new Error(`to${colorMode.toUpperCase()} only supports .png files.`);
  }

  const sharp = getSharp();
  const originalBuffer = await vscode.workspace.fs.readFile(fileUri);
  let pipeline = sharp(originalBuffer).rotate().toColourspace('srgb');

  if (colorMode === 'rgba') {
    pipeline = pipeline.ensureAlpha();
  } else {
    pipeline = backgroundColor ? pipeline.flatten({ background: backgroundColor }) : pipeline.removeAlpha();
  }

  if (settings.preserveMetadata) {
    pipeline = pipeline.withMetadata();
  }

  const rawBuffer = await pipeline.raw().toBuffer({ resolveWithObject: true });
  outputChannel.appendLine(`Prepared raw ${colorMode.toUpperCase()} pixels for target ${fileUri.fsPath} with channels=${rawBuffer.info.channels}, width=${rawBuffer.info.width}, height=${rawBuffer.info.height}`);

  const convertedBuffer = await sharp(rawBuffer.data, {
    raw: {
      width: rawBuffer.info.width,
      height: rawBuffer.info.height,
      channels: rawBuffer.info.channels
    }
  }).png({ compressionLevel: settings.pngCompressionLevel, palette: false }).toBuffer();
  const parsedPath = path.parse(fileUri.fsPath);
  const outputFile = vscode.Uri.joinPath(fileUri.with({ path: path.dirname(fileUri.path) }), `${parsedPath.name}_${colorMode}.png`);
  const encodedInfo = await inspectPngBufferColorMode(convertedBuffer);

  outputChannel.appendLine(`Prepared encoded ${colorMode.toUpperCase()} buffer for target ${outputFile.fsPath} with channels=${encodedInfo.channels}, hasAlpha=${encodedInfo.hasAlpha}`);

  await vscode.workspace.fs.writeFile(outputFile, convertedBuffer);
  const outputInfo = await inspectPngFileColorMode(outputFile);
  outputChannel.appendLine(`Generated ${colorMode.toUpperCase()} PNG ${fileUri.fsPath} -> ${outputFile.fsPath}`);
  outputChannel.appendLine(`Detected target file ${outputFile.fsPath} with channels=${outputInfo.channels}, hasAlpha=${outputInfo.hasAlpha}`);
  assertPngColorModeInfo(outputFile, colorMode, outputInfo);

  return {
    outputFile: outputFile.fsPath,
    colorMode,
    outputChannels: outputInfo.channels,
    outputHasAlpha: outputInfo.hasAlpha,
    totalBytesBefore: originalBuffer.byteLength,
    totalBytesAfter: convertedBuffer.byteLength
  };
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