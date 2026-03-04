import assert from 'node:assert/strict';

import {
  assertAuthFailureShape,
  assertInvalidSessionLifecycleShape,
  createInvalidSessionLifecycleCases,
  createProtocolHeaderNegotiationCases,
  type InvalidSessionLifecycleCase,
  type ProtocolHeaderNegotiationCase,
} from './mcp-transport-contract.js';

interface ProtocolNegotiationHarnessOptions {
  supportedVersion: string;
  unsupportedVersion?: string;
  acceptedStatus?: number | readonly number[];
  filterCase?: (fixture: ProtocolHeaderNegotiationCase) => boolean;
  assertAcceptedResponse?: (
    response: Response,
    fixture: ProtocolHeaderNegotiationCase,
  ) => Promise<void> | void;
}

export async function runProtocolHeaderNegotiationContract(
  options: ProtocolNegotiationHarnessOptions,
  executeCase: (fixture: ProtocolHeaderNegotiationCase) => Promise<Response | null>,
): Promise<void> {
  const fixtures = createProtocolHeaderNegotiationCases(
    options.supportedVersion,
    options.unsupportedVersion,
  ).filter((fixture) => (options.filterCase ? options.filterCase(fixture) : true));
  const acceptedStatuses =
    options.acceptedStatus === undefined
      ? null
      : Array.isArray(options.acceptedStatus)
        ? options.acceptedStatus
        : [options.acceptedStatus];

  for (const fixture of fixtures) {
    const response = await executeCase(fixture);

    if (fixture.expectedStatus === null) {
      if (acceptedStatuses === null) {
        assert.equal(response, null, `${fixture.name} should pass without auth error`);
        continue;
      }

      assert.ok(response, `${fixture.name} should return a response`);
      assert.ok(
        acceptedStatuses.includes(response.status),
        `${fixture.name} should return accepted status ${acceptedStatuses.join(', ')}, got ${response.status}`,
      );
      if (options.assertAcceptedResponse) {
        await options.assertAcceptedResponse(response, fixture);
      }
      continue;
    }

    assert.ok(response, `${fixture.name} should return auth error response`);
    assert.equal(response.status, fixture.expectedStatus, `${fixture.name} should return expected status`);
    const payload = (await response.json()) as { error?: string };
    assert.equal(payload.error, fixture.expectedError, `${fixture.name} should return expected error code`);
  }
}

export interface AuthFailureContractCase {
  name: string;
  expectedStatus: number;
  expectedError: string;
}

interface AuthFailureHarnessOptions {
  assertFailureResponse?: (
    response: Response,
    fixture: AuthFailureContractCase,
  ) => Promise<void> | void;
}

export async function runAuthFailureContract(
  fixtures: readonly AuthFailureContractCase[],
  executeCase: (fixture: AuthFailureContractCase) => Promise<Response | null>,
  options: AuthFailureHarnessOptions = {},
): Promise<void> {
  for (const fixture of fixtures) {
    const response = await executeCase(fixture);
    assert.ok(response, `${fixture.name} should return auth error response`);
    await assertAuthFailureShape(response, fixture.expectedStatus, fixture.expectedError);
    if (options.assertFailureResponse) {
      await options.assertFailureResponse(response, fixture);
    }
  }
}

interface InvalidSessionLifecycleHarnessOptions {
  closedSessionId: string;
  expectedStatus?: number | readonly number[];
  assertFailureResponse?: (
    response: Response,
    fixture: InvalidSessionLifecycleCase,
  ) => Promise<void> | void;
}

export async function runInvalidSessionLifecycleContract(
  options: InvalidSessionLifecycleHarnessOptions,
  executeCase: (fixture: InvalidSessionLifecycleCase) => Promise<Response | null>,
): Promise<void> {
  const fixtures = createInvalidSessionLifecycleCases(options.closedSessionId);
  const expectedStatuses =
    options.expectedStatus === undefined
      ? [400]
      : Array.isArray(options.expectedStatus)
        ? options.expectedStatus
        : [options.expectedStatus];

  for (const fixture of fixtures) {
    const response = await executeCase(fixture);
    assert.ok(response, `${fixture.name} should return session lifecycle error response`);
    assert.ok(
      expectedStatuses.includes(response.status),
      `${fixture.name} should return expected status ${expectedStatuses.join(', ')}, got ${response.status}`,
    );
    assertInvalidSessionLifecycleShape(await response.json());
    if (options.assertFailureResponse) {
      await options.assertFailureResponse(response, fixture);
    }
  }
}
