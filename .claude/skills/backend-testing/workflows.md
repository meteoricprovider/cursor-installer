# Workflows for Backend Test Writing and Reviewing

Use parallel subagents for exploration and analysis. Launch each agent using the `Task` tool with `subagent_type="Explore"` and `model="sonnet"` (or `"general-purpose"` for deeper analysis). Sonnet gives the best quality-to-cost ratio for these read-and-summarize tasks — Opus is overkill for exploration. Each agent gets focused context and a specific lens — this produces deeper results than sequential single-context work.

**Coordination rule:** The parent agent orchestrates — it does NOT duplicate work that subagents handle (e.g., do not also run coverage yourself if Agent 3 / Agent 1 does it).

## Writing Tests Workflow

### Phase 1: Explore (3 parallel Task subagents)

Launch all three simultaneously in a single message with three `Task` tool calls:

**Agent 1 — Endpoint/service tracer:**
Trace the code under test end-to-end: route definition, service methods, repository queries, serializers/schemas, domain transitions, and side effects (emails, events, Celery tasks). Return the list of key file paths and a summary of what each does.

**Agent 2 — Test pattern explorer:**
Find existing test files in the same feature area and neighboring slices. Identify factories, conftest fixtures (at all directory levels), mock helpers, and builder patterns used. Return the list of key file paths and a summary of available test infrastructure.

**Agent 3 — Coverage analyzer:**
Generate coverage data (`cd backend && uv run pytest --cov=app/path/to/module --cov-report=lcov:lcov.info tests/path/to/tests/`). Also read the source code and any existing tests. Enumerate observable outcomes and cross-reference against tests. Return a prioritized checklist of untested outcomes — focus on fault models ("what could go wrong?"), not raw line numbers.

### Phase 2: Write Tests

After all agents return, read the key files they identified. Use the coverage analysis to prioritize:

1. Untested outcomes first (highest value)
2. Weak or implementation-coupled tests second
3. Missing authz tests third

## Reviewing Tests Workflow

### Why subagents work for reviews

Each subagent gets the FULL context (both source and tests) but with a DIFFERENT lens. This produces deeper findings per dimension than a single pass trying to check everything at once.

"Review is analytical synthesis that requires single context" is a rationalization — giving focused concerns to parallel agents produces better results.

### Launch 3 parallel review agents (Task tool, single message)

**Agent 1 — Coverage gap analyzer:**
Generate coverage data (`cd backend && uv run pytest --cov=app/path/to/module --cov-report=lcov:lcov.info tests/path/to/tests/`). Also read the endpoint/service source AND all existing tests. Enumerate observable outcomes and cross-reference against tests. Return: a prioritized list of untested outcomes — focus on fault models ("what could go wrong?"), not raw line numbers. This is the highest-value finding.

**Agent 2 — Test quality reviewer:**
Evaluate existing tests against the skill's Core Principles and the review checklist (`review-checklist.md`). Focus on: outcome vs. implementation coupling, real DB vs. mocked repos, assertion quality, test naming, test structure. Report issues by severity.

**Agent 3 — Test infrastructure reviewer:**
Check that factories are used correctly, conftest fixtures are appropriate at each level, and `@pytest.mark.expect_authz` is used only for tests expected to call authz (while tests that should not call authz stay unmarked). Verify factory fields and DB relationships before suggesting rewrites. Report issues by severity.

### After agents return

Consolidate findings. **Coverage gaps take priority** — missing tests for real outcomes are more important than style issues in existing tests. Follow the reporting format in `review-checklist.md`.
