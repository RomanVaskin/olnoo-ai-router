import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Fixed routing of OLNOO services: `service + task` -> provider / model / model config.
//
// First stage: NO automatic model selection, no fallback between models, no scoring. Each (service, task) pair
// is bound by hand to exactly one preset, in this file only. Client apps send just their service id (plus the
// task-specific input) and never choose a preset's provider, model or pinned settings — to change a model, edit the
// preset here; no client changes are needed. New services/tasks are added as new entries.

export type ServiceTask = 'image' | 'text' | 'review';

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface ImagePreset {
  provider: 'openai';
  model: string;
  quality: ImageQuality;
}

export interface TextPreset {
  provider: 'deepseek' | 'openai' | 'gemini' | 'anthropic' | 'qwen';
  model: string;
  reasoningMode: 'off' | 'medium';
  allowFallback: false;
}

/** `"<service>.<task>"` -> preset. */
export const SERVICE_PRESETS: Readonly<Record<string, ImagePreset | TextPreset>> = {
  'driveset.image': { provider: 'openai', model: 'gpt-image-1-mini', quality: 'medium' },
  'content-factory.text': {
    provider: 'openai',
    model: 'gpt-5.4-mini-2026-03-17',
    reasoningMode: 'off',
    allowFallback: false,
  },
  'content-factory.review': {
    provider: 'openai',
    model: 'gpt-5.4-mini-2026-03-17',
    reasoningMode: 'medium',
    allowFallback: false,
  },
};

/** The only editable assignments; all other defaults remain code-owned. */
export const EDITABLE_TEXT_PRESETS = ['content-factory.text', 'content-factory.review'] as const;
type EditableKey = (typeof EDITABLE_TEXT_PRESETS)[number];
type Selection = Pick<TextPreset, 'provider' | 'model'>;
const selectionFile = () => process.env.AI_ROUTER_PRESET_SELECTION_PATH || '/opt/olnoo/ai-router-presets.json';

function readSelections(): Partial<Record<EditableKey, Selection>> {
  let data: string;
  try {
    data = readFileSync(selectionFile(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const parsed: unknown = JSON.parse(data);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid AI Router preset selection file');
  const result: Partial<Record<EditableKey, Selection>> = {};
  for (const key of EDITABLE_TEXT_PRESETS) {
    const item = (parsed as Record<string, unknown>)[key];
    if (item === undefined) continue;
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid AI Router preset selection');
    const obj = item as Record<string, unknown>;
    if (!['deepseek', 'openai', 'gemini', 'anthropic', 'qwen'].includes(String(obj.provider))
      || typeof obj.model !== 'string' || !obj.model || obj.model.length > 128) {
      throw new Error('Invalid AI Router preset selection');
    }
    result[key] = { provider: obj.provider as TextPreset['provider'], model: obj.model };
  }
  return result;
}

export function updateTextPresetSelection(key: EditableKey, selection: Selection): TextPreset {
  if (!EDITABLE_TEXT_PRESETS.includes(key)) throw new Error('Preset is not editable');
  const next = { ...readSelections(), [key]: { provider: selection.provider, model: selection.model } };
  const destination = selectionFile();
  mkdirSync(dirname(destination), { recursive: true });
  const tmp = destination + '.tmp-' + process.pid;
  writeFileSync(tmp, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  renameSync(tmp, destination);
  return resolveServicePreset(key.split('.')[0]!, key.split('.')[1] as 'text' | 'review')!;
}

export function listResolvedServicePresets(): Record<string, ImagePreset | TextPreset> {
  const selected = readSelections();
  return Object.fromEntries(Object.entries(SERVICE_PRESETS).map(([key, preset]) => [
    key, key in selected ? { ...preset, ...selected[key as EditableKey] } : preset,
  ]));
}

export function presetKey(service: string, task: ServiceTask): string {
  return `${service}.${task}`;
}

/** The preset bound to `service` + `task`, or `undefined` when none is configured. */
export function resolveServicePreset(service: string, task: 'image'): ImagePreset | undefined;
export function resolveServicePreset(service: string, task: 'text' | 'review'): TextPreset | undefined;
export function resolveServicePreset(
  service: string,
  task: ServiceTask,
): ImagePreset | TextPreset | undefined {
  const key = presetKey(service, task);
  return Object.hasOwn(SERVICE_PRESETS, key) ? listResolvedServicePresets()[key] : undefined;
}
