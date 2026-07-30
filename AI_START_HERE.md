# AI Start Here

Before performing any work in this repository:

1. Read `OLNOO_PLAYBOOK.md` completely.
2. Read `WORKFLOW.md` completely.
3. Read `PRODUCT_CONTEXT.md` completely.
4. Read the native instruction file for the current environment, if present (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`, or `.github/copilot-instructions.md`).
5. Inspect the repository status, structure, documentation, and relevant implementation.
6. Report material instruction conflicts before implementation.

Mandatory behavior:

- Reuse OLNOO shared capabilities before creating product-specific duplicates.
- Evaluate relevant models, skills, tools, MCP servers, libraries, knowledge sources, evaluations, security, cost, and human review.
- Select only the smallest reliable combination; do not add tools merely because they exist.
- Do not claim verification unless a real verification step completed.
- Do not expose secrets or sensitive data.
- Do not push, deploy, publish, or modify production without explicit authorization.
- Run applicable checks and report limitations honestly.

## What this repository is

`olnoo-ai-router` **is** the shared "AI Gateway and provider adapters" capability referenced in `OLNOO_PLAYBOOK.md` §3. Every other OLNOO product is expected to call AI models through this service rather than a provider SDK directly. Changes here affect every downstream product — treat provider contract changes, auth changes, and breaking API changes as cross-product changes, not local ones.
