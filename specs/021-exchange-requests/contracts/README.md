# Contracts: 020 (references, not copies)

The API contract (docs/rules/dev/common/api-contract.md) is the sole source of truth.
Per-function details live in docs/plans/api/; this feature implements them unchanged:

- Intents: docs/plans/api/09-intents.md (register, list sent/received, withdraw, accept, decline)
- Proposals: docs/plans/api/11-proposals.md (generation rules 1-6, reads)
- Consent/reject: docs/plans/api/12-consent-reject-proposal.md (version checks, serialized confirmation)
- Retrofits: docs/plans/api/07-edit-withdraw-clothing.md (PATCH steps 6-7, DELETE steps 6-7), docs/plans/api/03-close-event.md (pending invalidation)

Frontend paths follow docs/plans/api/README.md §2 (event-scoped collections under /events/{id}, top-level /intents/{id}, /proposals/{id}) with eventId-first apiFetch per data-fetching.md.

Decided for v1 (2026-11-03 clarify, overrides API open-decision notes in 09/11/README): confirming elsewhere invalidates pending proposals only (active requests stay); Exchanges ordering is newest first (`createdAt` desc). T028 updates the API docs in the same PR if implementation deviates.
