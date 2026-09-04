import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import controls from '../../infra/cloudflare/observability-controls.json' with { type: 'json' };
import {
  REQUIRED_CONTROL_IDS,
  validateObservabilityControls,
} from '../../scripts/cloudflare/check-observability-controls.mjs';

describe('Cloudflare observability control contract', () => {
  it('validates the checked-in native control catalog', () => {
    assert.deepEqual(validateObservabilityControls(controls), []);
    assert.deepEqual(
      controls.controls.map((control) => control.id),
      REQUIRED_CONTROL_IDS,
    );
  });

  it('emits a redacted repository receipt without claiming provider activation', () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/cloudflare/check-observability-controls.mjs', '--json'],
      { cwd: new URL('../..', import.meta.url), encoding: 'utf8' },
    );
    assert.deepEqual(JSON.parse(output), {
      schema_version: 'v1',
      status: 'ok',
      repository_contract: 'verified',
      provider_activation: 'pending',
      control_count: 7,
      active_control_count: 0,
      operator_mode: 'read_only',
      payload_retention: 'prohibited',
    });
  });

  it('fails closed when a provider-active receipt is required', () => {
    const errors = validateObservabilityControls(controls, { requireProviderActive: true });
    assert.equal(errors.length, REQUIRED_CONTROL_IDS.length);
    assert.match(errors[0], /provider control is not active/);
  });

  it('rejects a write-capable operator surface', () => {
    const unsafe = structuredClone(controls) as typeof controls;
    unsafe.operator_surface.mode = 'read_write';
    unsafe.operator_surface.denied_capabilities =
      unsafe.operator_surface.denied_capabilities.filter((capability) => capability !== 'deploy');
    assert.deepEqual(validateObservabilityControls(unsafe).slice(0, 2), [
      'operator_surface.mode must be read_only.',
      'Missing denied operator capability: deploy',
    ]);
  });
});
