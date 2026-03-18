import * as vscode from 'vscode';

export const CONFIG_SECTION = 'sharkImage';
export const DEFAULT_RESOURCE_DIRECTORY = 'resources/preview-samples';
export const DEFAULT_OUTPUT_DIRECTORY = 'resources/compressed';

export type OutputMode = 'overwrite' | 'mirror';

export interface CompressionSettings {
  resourceDirectory: string;
  outputMode: OutputMode;
  outputDirectory: string;
  recursive: boolean;
  previewSampleCount: number;
  jpegQuality: number;
  pngQuality: number;
  pngCompressionLevel: number;
  webpQuality: number;
  webpEffort: number;
  preserveMetadata: boolean;
}

type ConfigurationScope = vscode.WorkspaceFolder | vscode.Uri | undefined;

function isWorkspaceFolder(scope: ConfigurationScope): scope is vscode.WorkspaceFolder {
  return Boolean(scope && 'uri' in scope && 'name' in scope && 'index' in scope);
}

function getConfiguration(scope?: ConfigurationScope): vscode.WorkspaceConfiguration {
  const resolvedScope = isWorkspaceFolder(scope) ? scope.uri : scope;
  return vscode.workspace.getConfiguration(CONFIG_SECTION, resolvedScope);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return value.toLowerCase() === 'true';
  }

  return fallback;
}

function toNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return clamp(parsed, min, max);
}

export function getSettings(scope?: ConfigurationScope): CompressionSettings {
  const config = getConfiguration(scope);
  return {
    resourceDirectory: config.get<string>('resourceDirectory', DEFAULT_RESOURCE_DIRECTORY),
    outputMode: config.get<OutputMode>('outputMode', 'mirror'),
    outputDirectory: config.get<string>('outputDirectory', DEFAULT_OUTPUT_DIRECTORY),
    recursive: config.get<boolean>('recursive', true),
    previewSampleCount: config.get<number>('previewSampleCount', 3),
    jpegQuality: config.get<number>('jpegQuality', 82),
    pngQuality: config.get<number>('pngQuality', 85),
    pngCompressionLevel: config.get<number>('pngCompressionLevel', 9),
    webpQuality: config.get<number>('webpQuality', 82),
    webpEffort: config.get<number>('webpEffort', 4),
    preserveMetadata: config.get<boolean>('preserveMetadata', false)
  };
}

export function normalizeSettings(candidate: Partial<CompressionSettings> | undefined, scope?: ConfigurationScope): CompressionSettings {
  const fallback = getSettings(scope);
  const resourceDirectory = String(candidate?.resourceDirectory ?? fallback.resourceDirectory).trim() || DEFAULT_RESOURCE_DIRECTORY;
  const outputDirectory = String(candidate?.outputDirectory ?? fallback.outputDirectory).trim() || DEFAULT_OUTPUT_DIRECTORY;
  const outputMode = candidate?.outputMode === 'overwrite' ? 'overwrite' : candidate?.outputMode === 'mirror' ? 'mirror' : fallback.outputMode;

  return {
    resourceDirectory,
    outputMode,
    outputDirectory,
    recursive: toBoolean(candidate?.recursive, fallback.recursive),
    previewSampleCount: toNumber(candidate?.previewSampleCount, fallback.previewSampleCount, 1, 3),
    jpegQuality: toNumber(candidate?.jpegQuality, fallback.jpegQuality, 1, 100),
    pngQuality: toNumber(candidate?.pngQuality, fallback.pngQuality, 1, 100),
    pngCompressionLevel: toNumber(candidate?.pngCompressionLevel, fallback.pngCompressionLevel, 0, 9),
    webpQuality: toNumber(candidate?.webpQuality, fallback.webpQuality, 1, 100),
    webpEffort: toNumber(candidate?.webpEffort, fallback.webpEffort, 0, 6),
    preserveMetadata: toBoolean(candidate?.preserveMetadata, fallback.preserveMetadata)
  };
}

export async function saveSettings(settings: CompressionSettings, scope?: ConfigurationScope): Promise<void> {
  const config = getConfiguration(scope);
  const entries = Object.entries(settings) as Array<[keyof CompressionSettings, CompressionSettings[keyof CompressionSettings]]>;
  const target = isWorkspaceFolder(scope) ? vscode.ConfigurationTarget.WorkspaceFolder : vscode.ConfigurationTarget.Workspace;

  for (const [key, value] of entries) {
    await config.update(key, value, target);
  }
}