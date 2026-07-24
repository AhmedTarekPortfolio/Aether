# Phase 0 AI Transport Test Backlog

This document records the remaining non-blocking test coverage gaps identified during the Phase 0 baseline verification.

All items listed below are **non-blocking for starting Phase 1 implementation**, but are required before claiming 100% production-path test coverage in these specific operational areas.

---

## Item AETHER-TEST-001 — Ollama Endpoint-Routing Coverage

- **Status**: Deferred / Backlog (Non-blocking for Phase 1 start)
- **Description**: Add a targeted unit test verifying actual Ollama endpoint selection and request routing paths beyond the generic `providerType: 'local'` shared fallback.
- **Acceptance Criteria**:
  1. Ollama-specific endpoint configuration (`http://localhost:11434/v1` or custom host) is explicitly exercised.
  2. The real production routing and URL construction logic is invoked.
  3. External network requests are mocked.
  4. The expected request URL, headers, and payload structure are asserted.

---

## Item AETHER-TEST-002 — LM Studio Endpoint-Routing Coverage

- **Status**: Deferred / Backlog (Non-blocking for Phase 1 start)
- **Description**: Add a targeted unit test verifying actual LM Studio endpoint selection and request routing paths beyond the generic `providerType: 'local'` shared fallback.
- **Acceptance Criteria**:
  1. LM Studio-specific endpoint configuration (`http://localhost:1234/v1` or custom host) is explicitly exercised.
  2. The real production routing and URL construction logic is invoked.
  3. External network requests are mocked.
  4. The expected request URL, headers, and payload structure are asserted.

---

## Item AETHER-TEST-003 — Express Client-Disconnect Cleanup

- **Status**: Deferred / Backlog (Non-blocking for Phase 1 start)
- **Description**: Add an integration test verifying that Express request disconnection cleanly triggers stream cancellation and resource teardown.
- **Acceptance Criteria**:
  1. Mount the actual production Express `aiRouter`.
  2. Start an active streamed HTTP request (`/api/ai/chat` with `stream: true`).
  3. Simulate HTTP client disconnection or socket end.
  4. Verify the associated `AbortController` or cleanup handler fires.
  5. Verify no stream reader, request controller, or event listener remains active.
