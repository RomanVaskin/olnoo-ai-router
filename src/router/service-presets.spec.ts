import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveServicePreset,
  listResolvedServicePresets,
  updateTextPresetSelection,
} from './service-presets.js';

const originalPath = process.env.AI_ROUTER_PRESET_SELECTION_PATH;
const dir = mkdtempSync(join(tmpdir(), 'olnoo-presets-test-'));
process.env.AI_ROUTER_PRESET_SELECTION_PATH = join(dir, 'overrides.json');

afterEach(() => {
  rmSync(process.env.AI_ROUTER_PRESET_SELECTION_PATH!, { force: true });
});

describe('Content Factory model switch', () => {
  it('keeps defaults when no runtime selection exists', () => {
    expect(resolveServicePreset('content-factory', 'text')?.provider).toBe('openai');
    expect(resolveServicePreset('content-factory', 'review')?.reasoningMode).toBe('medium');
  });

  it('persists a selected model without changing other presets', () => {
    updateTextPresetSelection('content-factory.text', { provider: 'gemini', model: 'gemini-3.5-flash' });
    expect(resolveServicePreset('content-factory', 'text')).toMatchObject({
      provider: 'gemini', model: 'gemini-3.5-flash', reasoningMode: 'off', allowFallback: false,
    });
    expect(resolveServicePreset('content-factory', 'review')).toMatchObject({
      provider: 'openai', model: 'gpt-5.4-mini-2026-03-17', reasoningMode: 'medium',
    });
    expect(listResolvedServicePresets()['driveset.image']).toMatchObject({ provider: 'openai' });
    expect(JSON.parse(readFileSync(process.env.AI_ROUTER_PRESET_SELECTION_PATH!, 'utf8'))['content-factory.text']).toEqual({
      provider: 'gemini', model: 'gemini-3.5-flash',
    });
  });
});

import { afterAll } from 'vitest';
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  if (originalPath === undefined) delete process.env.AI_ROUTER_PRESET_SELECTION_PATH;
  else process.env.AI_ROUTER_PRESET_SELECTION_PATH = originalPath;
});
