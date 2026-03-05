#!/usr/bin/env node

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BREAKING_CHANGE_GATES,
  evaluateAllBreakingChangeGates,
  evaluateBreakingChangeGate,
  getBreakingChangeMigrationNotes,
} from '../../src/infrastructure/breaking-change-governance.js';

describe('breaking change governance', () => {
  it('keeps BP8-BP10 gates and migration notes in sync', () => {
    assert.equal(BREAKING_CHANGE_GATES.length, 3);
    assert.deepEqual(
      BREAKING_CHANGE_GATES.map((gate) => gate.introducedBy).sort(),
      ['BP10', 'BP8', 'BP9'],
    );

    const notes = getBreakingChangeMigrationNotes();
    assert.equal(notes.length, BREAKING_CHANGE_GATES.length);
    for (const entry of notes) {
      assert.ok(entry.notes.length > 0);
      assert.ok(entry.minProtocolVersion.length > 0);
      assert.ok(entry.envFlag.startsWith('MCP_BREAKING_'));
    }
  });

  it('applies protocol version gates when explicit flags are absent', () => {
    const gate = BREAKING_CHANGE_GATES[0];
    const preGate = evaluateBreakingChangeGate(gate, {
      env: {},
      protocolVersion: '2024-11-05',
    });
    assert.equal(preGate.enabled, false);
    assert.equal(preGate.reason, 'protocol_gate');

    const inGate = evaluateBreakingChangeGate(gate, {
      env: {},
      protocolVersion: gate.minProtocolVersion,
    });
    assert.equal(inGate.enabled, true);
    assert.equal(inGate.reason, 'default_enabled');
  });

  it('lets explicit env flags override protocol/default behavior', () => {
    const gate = BREAKING_CHANGE_GATES[1];
    const forcedOff = evaluateBreakingChangeGate(gate, {
      env: { [gate.envFlag]: 'false' },
      protocolVersion: '2025-11-25',
    });
    assert.equal(forcedOff.enabled, false);
    assert.equal(forcedOff.reason, 'flag_disabled');

    const forcedOn = evaluateBreakingChangeGate(gate, {
      env: { [gate.envFlag]: 'true' },
      protocolVersion: '2024-11-05',
    });
    assert.equal(forcedOn.enabled, true);
    assert.equal(forcedOn.reason, 'flag_enabled');
  });

  it('evaluates the full gate set into deterministic decision records', () => {
    const decisions = evaluateAllBreakingChangeGates({
      protocolVersion: '2025-06-18',
      env: {
        MCP_BREAKING_BP10_EDGE_AUTH_PRECEDENCE: 'false',
      },
    });

    assert.equal(decisions.length, BREAKING_CHANGE_GATES.length);
    const bp10 = decisions.find((decision) => decision.id === 'bp10-edge-auth-precedence');
    assert.ok(bp10);
    assert.equal(bp10.enabled, false);
    assert.equal(bp10.reason, 'flag_disabled');
  });
});
