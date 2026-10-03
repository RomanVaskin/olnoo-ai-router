// Fixed routing of OLNOO services: `service + task` -> provider / model / model config.
//
// First stage: NO automatic model selection, no fallback between models, no scoring. Each (service, task) pair
// is bound by hand to exactly one preset, in this file only. Client apps send just their service id (plus the
// task-specific input) and never choose a provider, model or quality themselves — to change a model, edit the
// preset here; no client changes are needed. New services/tasks are added as new entries.

export type ServiceTask = 'image';

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface ImagePreset {
  provider: 'openai';
  model: string;
  quality: ImageQuality;
}

/** `"<service>.<task>"` -> preset. */
export const SERVICE_PRESETS: Readonly<Record<string, ImagePreset>> = {
  'driveset.image': { provider: 'openai', model: 'gpt-image-1-mini', quality: 'medium' },
};

export function presetKey(service: string, task: ServiceTask): string {
  return `${service}.${task}`;
}

/** The preset bound to `service` + `task`, or `undefined` when none is configured. */
export function resolveServicePreset(service: string, task: ServiceTask): ImagePreset | undefined {
  const key = presetKey(service, task);
  return Object.hasOwn(SERVICE_PRESETS, key) ? SERVICE_PRESETS[key] : undefined;
}
