# OLNOO Product Development Playbook

Version: 1.0.0
Status: Active
Last Updated: 2026-07-20
Scope: All OLNOO products, repositories, contributors, and AI assistants

## 1. Purpose

This playbook defines the mandatory process for creating and developing every OLNOO product, including Architect, Legal, Marketing, Studio, Life, Business, Invest, and future products.

Every human contributor and AI assistant must read this document before planning, modifying, reviewing, or releasing an OLNOO product.

## 2. Authority

Instruction priority:

1. Explicit user instruction.
2. Security, privacy, legal, and safety requirements.
3. This playbook.
4. Product-specific `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, and `PRODUCT_CONTEXT.md`.
5. Product documentation and existing implementation conventions.

Conflicts must be reported before implementation. Product rules may extend this playbook but must not silently weaken it.

## 3. One Platform, Multiple Products

OLNOO products must reuse a shared core where practical:

- identity, organizations, roles, and permissions;
- projects, files, versions, and collaboration;
- AI Gateway and provider adapters;
- skills, tools, and MCP registry;
- knowledge, retrieval, and memory;
- workflow orchestration and queues;
- billing, usage, audit, and observability;
- security controls and the OLNOO design system.

Products should add domain-specific workflows, knowledge, skills, tools, evaluations, and interfaces without duplicating the shared core.

## 4. Mandatory Product Lifecycle

### 4.1 Define the product

Before implementation, define:

- target users and their problem;
- primary user journey and expected result;
- success criteria and non-goals;
- professional, legal, and safety limitations;
- what belongs to the shared platform and what is product-specific.

### 4.2 Assess relevant capabilities

Evaluate every relevant category before choosing an implementation:

- existing OLNOO services and components;
- deterministic libraries and algorithms;
- AI models and provider APIs;
- Agent Skills;
- tools and MCP servers;
- external data sources and integrations;
- structured data and storage;
- knowledge bases and RAG;
- memory and context requirements;
- workflow orchestration and background jobs;
- evaluation and human review;
- security, privacy, cost, latency, availability, and provider risk.

The requirement is to evaluate relevant categories, not to add every available tool. Select the smallest reliable combination.

### 4.3 Choose build, buy, reuse, or adapt

For every major capability, choose explicitly:

1. Reuse OLNOO core.
2. Use an approved external service.
3. Adapt an audited skill or open-source component.
4. Build an OLNOO-specific implementation.

Reuse is preferred over duplication. External dependencies must have a clear owner, license, data policy, cost model, and replacement path.

### 4.4 Define contracts before implementation

Define structured inputs, outputs, schemas, permissions, failure states, recovery behavior, audit events, and human-review checkpoints. Critical product state must not live only in chat history or model context.

### 4.5 Create evaluations before scaling

Every material AI capability must have a representative evaluation dataset and measurable criteria:

- correctness and constraint compliance;
- consistency and user acceptance;
- latency and cost;
- failure and recovery rate;
- specialist-review rate;
- comparison with the previous version.

Model, prompt, skill, tool, and workflow changes must be evaluated against the same cases.

### 4.6 Implement and verify

Implementation must preserve existing functionality, follow repository architecture, validate external inputs and AI outputs, and keep provider-specific code behind adapters.

Before completion, run applicable tests, type checking, linting, production build, primary user journeys, failure recovery, responsive checks, security checks, and AI evaluations.

### 4.7 Release and learn

Released AI operations should record safe operational metadata:

- provider, model, prompt, skill, and workflow versions;
- attempt and project identifiers;
- latency, estimated cost, and outcome;
- validation and human-review result;
- user selection, rejection, or correction where authorized.

Improvement data must respect consent, access controls, retention rules, and privacy requirements.

## 5. Shared AI Architecture

```text
User Intent
    -> Product Workflow
    -> Context Builder
    -> Skills + Knowledge + Tools
    -> Model Router
    -> Provider Adapter
    -> Validation + Evaluation
    -> Human Review when required
    -> Structured Project Result
```

Product UI components must not call AI providers directly. Provider calls go through the shared gateway or an approved server-side adapter.

## 6. Model Selection

Models are selected by measured task performance rather than provider preference. The router should consider modality, quality, constraint adherence, tool support, context, latency, price, availability, data policy, and regional restrictions.

An `Auto` mode must use evaluation results and routing rules. User-facing modes such as Fast, Balanced, and Maximum Quality may be provided when their differences are clear.

## 7. Skills

Before adopting a skill:

- read the complete `SKILL.md` and required references;
- inspect scripts, commands, external services, and required secrets;
- verify author, maintenance, and license;
- test it in isolation;
- measure usefulness on product evaluation cases;
- pin the approved version.

OLNOO-specific skills must define activation conditions, inputs, outputs, constraints, allowed tools, failure behavior, human-review rules, evaluation cases, and version metadata.

## 8. Tools and MCP

Use deterministic tools when they are more reliable than model reasoning, including calculations, database queries, file conversion, BIM/IFC, mapping, weather, document generation, validation, and business integrations.

Tools require structured inputs and outputs, least-privilege permissions, timeouts, rate limits, safe errors, and audit logging. Prefer read-only access whenever write access is unnecessary.

## 9. Knowledge and RAG

Professional knowledge must come from identified, versioned sources. Record source, jurisdiction, publication and effective dates, permissions, applicability, confidence, and supersession status.

Outputs must distinguish retrieved facts, deterministic calculations, AI interpretation, and unresolved uncertainty. High-impact legal, financial, engineering, or safety conclusions require sources and human review.

## 10. Structured Data and Memory

Chat is not the source of truth. Store users, organizations, projects, files, requirements, constraints, decisions, versions, AI runs, evaluations, approvals, usage, cost, and audit events as structured state.

Memory must be scoped by organization, user, product, and project. No state may leak between tenants or unrelated projects.

## 11. Human Control

AI must never claim that a result is verified unless a real verification step completed.

Use explicit states:

- AI-generated;
- automatically checked;
- requires specialist review;
- specialist approved;
- rejected;
- superseded.

Users must be able to inspect changes, compare versions, correct results, reject output, and restore earlier states.

## 12. Security and Privacy

Mandatory controls include server-side secrets, authorization, tenant isolation, input and output validation, upload limits, file-type verification, safe diagnostics, audit logs, dependency review, and threat modeling before production.

Never expose API keys, raw internal traces, sensitive prompts, or unfiltered provider errors to end users.

## 13. Cost and Reliability

Every paid AI operation requires an attempt identifier, persisted state, duplicate-request protection, clear retry and recovery behavior, partial-success handling, provider metadata, and cost tracking.

A storage failure must not automatically repeat a paid generation. Use caching, batching, reusable analysis, and lower-cost models only when measurements show a benefit.

## 14. UX and Brand

Every product follows the approved OLNOO brand and design system. Interfaces must be simple, premium, calm, readable, accessible, responsive, and transparent about AI status.

Describe user outcomes rather than internal architecture. A user should not need to understand AI models or professional software to complete the primary journey.

## 15. Working Rules

Terminal-first execution is the default when technically appropriate.

Before work:

1. Read `AI_START_HERE.md`, this playbook, `WORKFLOW.md`, and product-specific instructions.
2. Inspect repository status and relevant architecture.
3. Identify affected components, risks, tools, models, and evaluations.
4. Confirm the task does not duplicate shared OLNOO functionality.

During work:

- preserve unrelated changes;
- make focused, reversible changes;
- do not expose secrets;
- do not perform destructive or external publishing actions without authority;
- test progressively and report uncertainty honestly.

After work:

- run relevant checks and evaluations;
- inspect the final diff;
- update documentation only when materially required;
- create a focused commit when requested;
- never push, deploy, publish, or modify production without explicit authorization.

## 16. Definition of Done

A task is complete only when the user outcome is implemented, relevant checks pass, failures and recovery are handled, AI output is validated, security and cost implications are addressed, no unrelated files were modified, and remaining limitations are reported honestly.

## 17. Continuous Improvement

Repeated problems and successful workflows should improve the shared core, skills, tools, evaluation sets, routing, and this playbook.

Playbook changes require a version update, documented reason, review of affected products, and synchronization across OLNOO repositories.
