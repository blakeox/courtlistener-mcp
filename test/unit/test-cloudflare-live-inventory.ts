import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateLiveInventory } from '../../scripts/cloudflare/check-live-inventory.mjs';

const expected = {
  accountId: 'account-1',
  workerNames: {
    edge: 'courtlistener-mcp',
    mcp: 'courtlistener-mcp-mcp',
    auth_limiter: 'courtlistener-mcp-auth-limiter',
  },
  queueName: 'courtlistener-mcp-async-tool-jobs',
  deadLetterQueue: 'courtlistener-mcp-async-tool-jobs-dlq',
  consumerWorker: 'courtlistener-mcp-mcp',
  maxRetries: 3,
};

function inventory() {
  return {
    account: { id: 'account-1' },
    workers: Object.values(expected.workerNames).map((name) => ({ name })),
    queues: [
      { name: expected.queueName },
      {
        name: expected.deadLetterQueue,
      },
    ],
  };
}

describe('Cloudflare live inventory preflight', () => {
  it('accepts the intended single-consumer queue topology', () => {
    const state = inventory();
    state.queues[0].consumers = [
      {
        script_name: expected.consumerWorker,
        dead_letter_queue: expected.deadLetterQueue,
        settings: { max_retries: expected.maxRetries },
      },
    ];

    const receipt = evaluateLiveInventory({ ...state, expected });
    assert.equal(receipt.status, 'ok');
    assert.ok(receipt.checks.every((check) => check.severity === 'info'));
  });

  it('fails closed on missing DLQ and duplicate consumers', () => {
    const state = inventory();
    state.queues = [
      {
        name: expected.queueName,
        consumers: [
          {
            script_name: expected.consumerWorker,
            dead_letter_queue: '',
            settings: { max_retries: 3 },
          },
          { script_name: 'legacy-worker', dead_letter_queue: '', settings: { max_retries: 3 } },
        ],
      },
    ];

    const receipt = evaluateLiveInventory({ ...state, expected });
    assert.equal(receipt.status, 'error');
    assert.ok(
      receipt.checks.some((check) => check.id === 'queue.dlq_exists' && check.severity === 'error'),
    );
    assert.ok(
      receipt.checks.some(
        (check) => check.id === 'queue.consumer_count' && check.severity === 'error',
      ),
    );
  });

  it('accepts the Cloudflare API queue_name and queue_id shape', () => {
    const state = inventory();
    state.queues = [
      {
        queue_name: expected.queueName,
        queue_id: 'queue-1',
        consumers: [
          {
            script: expected.consumerWorker,
            dead_letter_queue: expected.deadLetterQueue,
            settings: { max_retries: expected.maxRetries },
          },
        ],
      },
      { queue_name: expected.deadLetterQueue, queue_id: 'queue-dlq' },
    ];

    const receipt = evaluateLiveInventory({ ...state, expected });
    assert.equal(receipt.status, 'ok');
  });
});
