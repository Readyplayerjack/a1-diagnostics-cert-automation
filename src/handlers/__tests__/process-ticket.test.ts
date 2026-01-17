/* eslint-disable @typescript-eslint/no-floating-promises */
import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../process-ticket.js';

/**
 * Mock Vercel request object.
 */
interface MockRequest {
  method?: string;
  body?: unknown;
}

/**
 * Mock Vercel response object.
 */
class MockResponse {
  statusCode = 200;
  responseBody: unknown = null;

  status(code: number): MockResponse {
    this.statusCode = code;
    return this;
  }

  json(body: unknown): void {
    this.responseBody = body;
  }
}

// Note: These tests focus on input validation and error handling.
// Full integration tests would require a test database and mocked external services.
// For now, we test the validation logic which is the handler's primary responsibility.
//
// Integration tests for service behavior (already_processed, processed, needs_review, system errors)
// should be written with proper test infrastructure that can mock:
// - ProcessedTicketsRepository
// - TicketProcessingService
// - Database queries

test('returns 400 MISSING_TICKET_ID when ticketId is missing', async () => {
  const req: MockRequest = {
    method: 'POST',
    body: {},
  };
  const res = new MockResponse();

  await handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1]
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.responseBody, {
    error: 'MISSING_TICKET_ID',
  });
});

test('returns 400 INVALID_TICKET_ID when ticketId is empty string', async () => {
  const req: MockRequest = {
    method: 'POST',
    body: { ticketId: '' },
  };
  const res = new MockResponse();

  await handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1]
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.responseBody, {
    error: 'INVALID_TICKET_ID',
  });
});

test('returns 400 INVALID_TICKET_ID when ticketId is whitespace only', async () => {
  const req: MockRequest = {
    method: 'POST',
    body: { ticketId: '   ' },
  };
  const res = new MockResponse();

  await handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1]
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.responseBody, {
    error: 'INVALID_TICKET_ID',
  });
});

test('returns 400 INVALID_TICKET_ID when ticketId is not a string', async () => {
  const req: MockRequest = {
    method: 'POST',
    body: { ticketId: 123 },
  };
  const res = new MockResponse();

  await handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1]
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.responseBody, {
    error: 'INVALID_TICKET_ID',
  });
});

test('returns 400 BAD_REQUEST when body is invalid JSON', async () => {
  const req: MockRequest = {
    method: 'POST',
    body: null,
  };
  const res = new MockResponse();

  await handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1]
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.responseBody, {
    error: 'BAD_REQUEST',
    message: 'Invalid JSON body',
  });
});

test('returns 400 BAD_REQUEST when body is not an object', async () => {
  const req: MockRequest = {
    method: 'POST',
    body: 'not an object',
  };
  const res = new MockResponse();

  await handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1]
  );

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.responseBody, {
    error: 'BAD_REQUEST',
    message: 'Invalid JSON body',
  });
});

// Integration tests for service behavior would require:
// - Mocked TicketProcessingService
// - Mocked ProcessedTicketsRepository
// - Mocked database queries
// These are better suited for integration test suites with proper test infrastructure.

test('returns 405 for non-POST methods', async () => {
  const req: MockRequest = {
    method: 'GET',
    body: { ticketId: 'test-ticket-123' },
  };
  const res = new MockResponse();

  await handler(
    req as unknown as Parameters<typeof handler>[0],
    res as unknown as Parameters<typeof handler>[1]
  );

  assert.equal(res.statusCode, 405);
});

