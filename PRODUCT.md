# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are participants in a clothing exchange corner at neighborhood events or small flea markets. They join an event before or during it via QR code or entry code, register garments they can offer, browse and search other participants' garments, send and answer exchange requests, and give final consent to exchanges.

Secondary users are organizers. They create events, share QR or entry codes, and close events when finished.

The first version focuses on a clothing exchange corner within an event, not on managing an entire event or facilitating sales.

## Product Purpose

Vintage Relay is a mobile web app that connects multiple people's exchange intents when finding a direct exchange partner is difficult. Participants register garments they can offer and garments they want; the app links independently registered intents into two-person swaps or three-person cycles.

Success means participants complete one-for-one exchanges with unanimous final consent to the same proposal version, then inspect and hand over physical garments on site.

## Positioning

The product mechanism a neighboring product could not truthfully copy: it connects independently registered exchange intents into two-person swaps and three-person cycles regardless of selection order, while AI only structures discovery and never decides. AI estimates clothing features from photos and turns natural-language search into conditions; deterministic code ranks results and detects cycles; participants choose what to give and receive and consent to exchanges.

## Operating Context

Events become active immediately on creation; the organizer joins as a participant at creation. Other participants join before or during the event with a QR code or entry code and can register garments, browse, request, and consent beforehand or on site.

Core workflow: register garments with photos and details, browse the home grid of other participants' available garments newest first, search by natural language or manual filters, send an exchange request that names both the wanted garment and the offered garment, accept or decline received requests, consent to complete proposals, inspect physical garments on site, hand over, and cancel a confirmed exchange before event closure when needed. After the organizer closes the event, no exchange actions are allowed.

Authentication uses a per-event bearer participant token; an entry code only grants entry to an event.

## Capabilities and Constraints

Confirmed capabilities: event creation and join; multi-photo clothing registration; home grid of others' available garments; natural-language search interpreted into category, color, and measurement conditions with manual-filter fallback; visible exchange requests with accept and decline; automatic two-person and three-person cycle detection; unanimous consent to the same proposal version; cancellation of a confirmed exchange before event closure; closed-event read-only access.

Confirmed rules: one garment given and one received per participant per exchange; bundles excluded; two-person and three-person exchanges only; a garment cannot be confirmed in two exchanges; requesting and accepting are not final consent; consent is invalidated when clothing or intent changes alter a proposal; confirmation and physical handover are separate states.

Confirmed constraints: AI estimates (for example colors) are labeled as estimates and never presented as owner facts; AI never creates intents or final consent; category is a hard search filter and ranking is deterministic and explainable; UI text, user-facing API messages, and AI-generated application copy are in English; mobile web with Python FastAPI, SQLite, and server-side Meta Model API calls.

Explicitly undecided: session recovery on another device; photo and event record retention and deletion; handover completion records and cancellation after partial handover; post-event access; participant and garment limits; proposal ordering.

## Brand Commitments

Name: Vintage Relay. Voice: plain English for UI, user-facing API messages, and AI-generated application copy. Existing visual system: Astryx chocolate theme. No new brand assets, testimonials, or marketing claims are established in this record.

## Evidence on Hand

Real sources in this repository: PROJECT.md (product overview and operating rules), docs/superpowers/specs/2026-11-02-app-flow-redesign-design.md (approved navigation, requests, ranking, analysis, and roadmap), docs/flows/screen-flow-v1.md and docs/flows/mockup-flow-v2.html (screen IDs, navigation, and approved mockup), docs/plans/api/README.md and docs/plans/api/ (per-function API drafts, with proposed items still needing agreement), docs/plans/ai-features-v1.md (analysis and search behavior), docs/domain/idea.md (early ideas and validation background).

No testimonials, customers, benchmarks, pricing, licensing, or deployment claims exist. Future work must not fabricate them.

## Product Principles

1. Participants decide; software and AI assist. Requests, consent, and confirmation always come from explicit participant action.
2. One for one, fully visible. Each exchange gives one garment and receives one garment, shown as who gives and receives each garment.
3. Estimates stay estimates. AI output is labeled and never stated as a verified fact about condition, fit, authenticity, or price.
4. Ranking is explainable. Search and cycle detection use deterministic rules the app can show, not opaque AI choices.
5. On-site reality governs. Confirmation is separate from physical inspection and handover; closing an event stops further exchange actions.
