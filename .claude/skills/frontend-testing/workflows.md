# Workflows for Frontend Test Writing and Reviewing

Use parallel subagents for exploration and analysis. Launch each agent using the `Task` tool with `subagent_type="Explore"` and `model="sonnet"` (or `"general-purpose"` for deeper analysis). Sonnet gives the best quality-to-cost ratio for these read-and-summarize tasks — Opus is overkill for exploration. Each agent gets focused context and a specific lens, which produces deeper results than a single sequential pass.

**Coordination rule:** The parent agent orchestrates — it does NOT duplicate work that subagents handle (for example, do not also run coverage yourself if Agent 3 / Agent 1 already does it).

## Writing Tests Workflow

### Phase 1: Explore (3 parallel Task subagents)

Launch all three simultaneously in a single message with three `Task` tool calls:

**Agent 1 — Component/page tracer:**
Trace the code under test end-to-end: component or page source, imported hooks, data queries, router usage, conditional rendering paths, user interactions, and side effects (toasts, navigation, callback props). Return the list of key file paths and a summary of what each does.

**Agent 2 — Test pattern explorer:**
Find existing test files in the same feature area and neighboring slices. Identify local wrappers (`renderPage`, `renderWithProviders`, `setupPageLevelTest`, `setupTests`), shared mocks in `@repo/tacto-api/src/__mocks__/`, and data fixtures/builders used nearby. Return the list of key file paths and a summary of available test infrastructure.

**Agent 3 — Coverage analyzer:**
Generate coverage data from the relevant app or package (`cd frontend/apps/buyer-app && pnpm run test:ci src/path/to/test.tsx --coverage --coverage.reporter=lcov --coverage.reporter=text --coverage.include="src/path/to/component.tsx"`, or the equivalent package path). Also read the source code and any existing tests. Enumerate observable outcomes and cross-reference them against the tests. Return a prioritized checklist of untested outcomes — focus on fault models ("what could go wrong?"), not raw line numbers.

### Phase 2: Write Tests

After all agents return, read the key files they identified. Use the coverage analysis to prioritize:

1. Untested outcomes first (highest value)
2. Weak or implementation-coupled tests second
3. Missing loading, error, permission, navigation, and edge-case tests third

## Reviewing Tests Workflow

### Why subagents work for reviews

Each subagent gets the FULL context (both source and tests) but with a DIFFERENT lens. This produces deeper findings per dimension than a single pass trying to check everything at once.

"Review is analytical synthesis that requires single context" is a rationalization — giving focused concerns to parallel agents produces better results.

### Launch 3 parallel review agents (Task tool, single message)

**Agent 1 — Coverage gap analyzer:**
Generate coverage data from the relevant app or package (`cd frontend/apps/buyer-app && pnpm run test:ci src/path/to/test.tsx --coverage --coverage.reporter=lcov --coverage.reporter=text --coverage.include="src/path/to/component.tsx"`, or the equivalent package path). Also read the component, page, or hook source AND all existing tests. Enumerate observable outcomes and cross-reference them against tests. Return a prioritized list of untested outcomes — focus on fault models ("what could go wrong?"), not raw line numbers. This is the highest-value finding.

**Agent 2 — Test quality reviewer:**
Evaluate existing tests against the skill's Core Principles and the review checklist (`review-checklist.md`). Focus on: observable outcomes vs. implementation coupling, assertion quality, test naming, test structure, and whether the tests reflect real user behavior rather than mock choreography. Report issues by severity.

**Agent 3 — Test infrastructure reviewer:**
Check that shared mocks are used correctly, the right test wrapper/provider setup is in place, and browser/JSDOM constraints are respected before suggesting rewrites. Verify there is no duplicate inline MSW logic and no `vi.mock` usage for API modules, React Query hooks, or UI side-effect libraries when a real provider or shared mock should be used instead. Report issues by severity.

### After agents return

Consolidate findings. **Coverage gaps take priority** — missing tests for real outcomes are more important than style issues in existing tests. Follow the reporting format in `review-checklist.md`.
