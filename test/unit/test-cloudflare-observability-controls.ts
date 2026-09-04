import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import controls from '../../infra/cloudflare/observability-controls.json' with { type: 'json' };
import {
  REQUIRED_CONTROL_IDS,
  validateObservabilityControls,
} from '../../scripts/cloudflare/check-observability-controls.mjs';

describe('Cloudflare observability control contract', () => {
  it('checks heading fragments outside examples and rejects symlink escapes', () => {
    const repositoryRoot = mkdtempSync(join(tmpdir(), 'observability-runbooks-'));
    try {
      writeFileSync(
        join(repositoryRoot, 'runbook.md'),
        '# Recover now\n## Recover now\n```md\n## Fake heading\n```\n',
      );
      symlinkSync(
        new URL('../../docs/repo/OBSERVABILITY_BASELINE.md', import.meta.url),
        join(repositoryRoot, 'escape.md'),
      );
      for (const [runbook, accepted] of [
        ['runbook.md#recover-now', true],
        ['runbook.md#recover-now-1', true],
        ['runbook.md#fake-heading', false],
        ['escape.md', false],
      ] as const) {
        const manifest = structuredClone(controls);
        for (const control of manifest.controls) control.runbook = runbook;
        assert.equal(
          validateObservabilityControls(manifest, { repositoryRoot }).length === 0,
          accepted,
          runbook,
        );
      }
    } finally {
      rmSync(repositoryRoot, { recursive: true, force: true });
    }
  });
  it('binds every required control to its expected signal', () => {
    for (let index = 0; index < controls.controls.length; index += 1) {
      const invalid = structuredClone(controls);
      invalid.controls[index].signal = 'not_a_signal';
      assert.ok(
        validateObservabilityControls(invalid).some((error) => error.includes('signal must be')),
      );
    }
  });

  it('rejects invalid threshold operators, units, ranges, and event counts', () => {
    for (const patch of [
      { operator: 'typo' },
      { operator: '<' },
      { unit: 'nonsense' },
      { unit: 'seconds' },
      { value: -999 },
      { value: 101 },
      { value: Number.NaN },
      { value: Infinity },
      { minimum_events: 0 },
      { minimum_events: 1.5 },
    ]) {
      const invalid = structuredClone(controls);
      Object.assign(invalid.controls[2].threshold, patch);
      assert.ok(
        validateObservabilityControls(invalid).some((error) => error.includes('threshold')),
        JSON.stringify(patch),
      );
    }
    const invalid = structuredClone(controls);
    invalid.controls[3].threshold.value = 0.5;
    assert.ok(validateObservabilityControls(invalid).some((error) => error.includes('threshold')));
  });

  it('allows meaningful threshold tuning within the signal domain', () => {
    for (const value of [0, 0.5, 100]) {
      const valid = structuredClone(controls);
      valid.controls[2].threshold.value = value;
      assert.deepEqual(validateObservabilityControls(valid), []);
    }
  });

  it('rejects missing runbooks, missing fragments, and non-local references', () => {
    for (const runbook of [
      'docs/repo/does-not-exist.md',
      'docs/repo/OBSERVABILITY_BASELINE.md#missing-heading',
      'docs/repo/OBSERVABILITY_BASELINE.md#',
      'docs/repo/OBSERVABILITY_BASELINE.md#%ZZ',
      '/tmp/runbook.md',
      '../runbook.md',
      'https://example.com/runbook.md',
    ]) {
      const invalid = structuredClone(controls);
      invalid.controls[2].runbook = runbook;
      assert.ok(
        validateObservabilityControls(invalid).some((error) => error.includes('runbook')),
        runbook,
      );
    }
  });

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
