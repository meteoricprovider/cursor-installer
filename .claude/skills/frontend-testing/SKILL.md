---
name: frontend-testing
description: Use when writing or reviewing any frontend test — components, pages, hooks, utility functions, Playwright e2e tests, or feature flows. Also use when encountering vi.mock usage, flaky tests, or implementation-coupled test assertions.
---

# Writing Frontend Tests

## Overview

Verify **observable outcomes** (rendered UI, accessible state, navigation, callback contracts), not implementation details. A well-written test should survive refactors that do not change behavior. Only mock at the network boundary with shared MSW helpers from `@repo/tacto-api/src/__mocks__/` — do not `vi.mock` API modules or React Query hooks.

**Exceptions:** Callback props (`onSave`, `onChange`, `onSubmit`) ARE the public API contract, so asserting their payloads is valid. Missing browser APIs in JSDOM (`ResizeObserver`, `IntersectionObserver`, ProseMirror range APIs, and similar) may be stubbed narrowly. For UI side-effect libraries such as toast providers, render the real provider and assert on visible output instead of spying on library calls.

## When to Use

- Writing new test files for React components, pages, hooks, or feature flows
- Reviewing existing tests for coverage gaps or convention violations
- Pure utility functions (date formatters, string helpers, etc.) — test inputs and outputs directly
- Playwright end-to-end tests
- NOT for backend Python tests
- NOT for Storybook interaction tests

## Test Infrastructure

Read the local test wrapper before changing tests. Frontend suites vary by app and package, and the wrapper determines which providers are available.

| Helper / pattern                              | Purpose                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| local `setupTests` re-export                  | Shared matchers, DOM setup, and the package/app's preferred test imports |
| `renderPage(...)`                             | Route-level tests with the production app providers                      |
| `setupPageLevelTest()`                        | Standard page-suite setup and teardown                                   |
| local `renderWithProviders(...)` helpers      | Feature/component tests that need query, router, or permission context   |
| `userEvent.setup()`                           | Realistic user interactions                                              |
| `QueryClientTestWrapper` or provider wrappers | Query client isolation for component and hook tests                      |

Use the wrapper that already exists in the local test area. Do not invent a new one unless there is no suitable wrapper nearby.

## Shared Mocks

**Always use shared mock helpers** from `@repo/tacto-api/src/__mocks__/` instead of raw `server.use()` calls.

```tsx
// BAD: vi.mock — bypasses real query logic
vi.mock("@/api/users");

// BAD: raw server.use — duplicates URL and serialization logic
server.use(http.get("[REDACTED]/api/v1/notes/abc", () => HttpResponse.json(mockNote)));

// GOOD: shared mock helper
import { GETNoteByKeyMock } from "@repo/tacto-api/src/__mocks__/notes/get-mocks";
GETNoteByKeyMock({ noteKey: "abc", data: mockNote });
GETNoteByKeyMock({ noteKey: "abc", serverError: true }); // 500
GETNoteByKeyMock({ noteKey: "abc", unauthorized: true }); // 401
GETNoteByKeyMock({ noteKey: "abc", networkError: true }); // 400
```

**If a shared mock doesn't exist**, create one in `frontend/packages/tacto-api/src/__mocks__/{resource}/`. Convention: `{HTTP_METHOD}{ResourceName}Mock`.

```tsx
// frontend/packages/tacto-api/src/__mocks__/suppliers/get-mocks.ts
import { http } from "msw";
import type { Supplier } from "../../api";
import { SupplierToJSON } from "../../api";
import { type MockOptionArgs, server, withBaseUrl, withErrorHandling } from "../../test-utils";

export const GETSupplierByIdMock = (supplierId: string, options: MockOptionArgs<Supplier> = {}) => {
  server.use(
    http.get(
      withBaseUrl(`/suppliers/${supplierId}/`),
      withErrorHandling({ ...options, jsonifyResponseFn: SupplierToJSON }),
      options?.requestHandlerOptions,
    ),
  );
};
```

**UI side-effect libraries** (toast, notifications): render the real provider in the test wrapper and assert on visible text. Do not `vi.mock("sonner")` or assert on `enqueueSnackbar` / `toast.success` calls unless that callback is itself the public API under test.

## Fixtures and Builders

Use existing data builders and fixtures (`*Fixture`, API fixtures, or local object builders) to keep tests small and readable. Prefer building the smallest valid payload over hand-writing large API responses in every test.

Before reusing or extending a fixture, read its definition to confirm the available fields and defaults.

## General Principles

- **Always** write tests for components.
- **Always** write accessibility tests using `vitest-axe`.
- Structure tests with **Arrange–Act–Assert**: separate setup, action, and assertion blocks with blank lines.
- Centralize environment mocks in `setupTests` (e.g., `ResizeObserver`, `scrollIntoView`, `getComputedStyle`
  pseudo-element handling). Avoid per-test DOM API mocks unless absolutely needed.

## Query Priority

Prefer semantic queries in this order:

1. `getByRole()` — buttons, inputs, links, etc.
2. `getByLabelText()` — form controls with associated labels
3. `getByPlaceholderText()` — only when no label exists
4. `getByText()` — visible text content
5. `getByDisplayValue()` — form elements with current values
6. `getByAltText()` — images with alt text
7. `getByTitle()` — elements with title attributes

When multiple elements share a role, include `name`: `getByRole('button', { name: 'Submit' })`.
Add `aria-label` to elements that need testing but lack semantic meaning.
**Avoid** `data-testid` / `getByTestId()` unless no semantic alternative exists.

## State Coverage

Cover core states explicitly:

- **Loading** — element absent, skeleton or spinner present
- **Disabled** — `toBeDisabled()`
- **Read-only** — `readonly` attribute / behavior
- **Error** — `aria-invalid`, error message visible
- **Focus** — focus ring or visual state applied

For controlled inputs, assert on observable outcomes after value change or rerender with new props.
Trigger effects with real user interactions rather than synthetic `act` calls when possible.

## Conventions

| Don't                                          | Do Instead                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Assert on mock call args                       | Assert on rendered UI or accessible state                                                  |
| `vi.mock` API modules or query hooks           | Shared MSW mocks from `@repo/tacto-api/src/__mocks__/`                                     |
| Raw `server.use(http.get(...))` in test files  | Shared mock helpers (create one if missing)                                                |
| Name tests after internals or method calls     | Name tests after user-visible outcomes                                                     |
| `container.querySelector` or brittle DOM scans | `screen.getByRole`, `screen.findByRole`, `screen.findByText`                               |
| Hide all setup in `beforeEach`                 | Keep scenario-specific setup in each test; reserve `beforeEach` for true suite scaffolding |
| Assert on Tailwind classes or library DOM      | Assert on accessible state, visible text, or your own callbacks                            |
| Conditional logic inside MSW handlers          | One simple response per handler                                                            |
| `fireEvent` for normal interaction flows       | `userEvent`                                                                                |
| Absence-only happy-path assertions             | Presence assertions first, then absence as secondary cleanup                               |

`beforeEach` is acceptable for suite-wide boilerplate such as auth/session defaults in page tests. Do not hide the scenario-specific mock setup that tells the story of the test.

### Assertion Style

**1-2 narrow checks** — plain assertions are fine:

```tsx
expect(await screen.findByRole("heading", { name: "Supplier update" })).toBeInTheDocument();
expect(screen.getByRole("button", { name: "common:Save" })).toBeDisabled();
```

**Multiple related form or callback properties** — prefer focused helpers over broad snapshot-style equality:

```tsx
expect(form).toHaveFormValues({
  title: "Updated title",
  description: "Draft",
});

expect(onSubmit).toHaveBeenCalledWith(
  expect.objectContaining({
    title: "Updated title",
    description: "Draft",
  }),
);
```

**Async UI transitions** — use `findBy*` or `waitFor`. Do not switch an async assertion to `getBy*` just to make the test shorter.

**Lists with non-deterministic order** — either fix the product code to guarantee order or assert on the rendered set of items rather than exact array position.

**Presence before absence** — absence tests can pass vacuously when nothing rendered. Assert what should appear first, then optionally assert the old state disappeared.

## Canonical Test File

```tsx
import { screen } from "@/setupTests";
import userEvent from "@testing-library/user-event";
import { GETNoteTemplateByIdMock } from "@repo/tacto-api/src/__mocks__/notes/get-mocks";
import { PUTUpdateNoteTemplateMock } from "@repo/tacto-api/src/__mocks__/notes/put-mocks";
import { renderWithProviders } from "@/test-utils"; // use the local wrapper that exists in this app/package
import { NoteTemplateEditor } from "./NoteTemplateEditor";

const templateId = "abc";
const mockTemplate = {
  id: templateId,
  title: "Supplier update",
  content: "Hello world",
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  createdByUserId: 1,
};

test("displays template content after loading", async () => {
  GETNoteTemplateByIdMock(templateId, { data: mockTemplate });
  renderWithProviders(<NoteTemplateEditor templateId={templateId} />);
  expect(await screen.findByText("Hello world")).toBeInTheDocument();
});

test("saves updated content and exits edit mode", async () => {
  const user = userEvent.setup();
  GETNoteTemplateByIdMock(templateId, { data: { ...mockTemplate, content: "Hello" } });
  PUTUpdateNoteTemplateMock(templateId, {
    data: { ...mockTemplate, content: "Updated", updatedAt: "2025-01-02T00:00:00Z" },
  });
  renderWithProviders(<NoteTemplateEditor templateId={templateId} />);

  await screen.findByText("Hello");
  await user.click(screen.getByRole("button", { name: /edit/i }));
  await user.clear(screen.getByLabelText("Content"));
  await user.type(screen.getByLabelText("Content"), "Updated");
  await user.click(screen.getByRole("button", { name: /save/i }));

  expect(await screen.findByText("Updated")).toBeInTheDocument();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

test("shows error message on save failure", async () => {
  const user = userEvent.setup();
  GETNoteTemplateByIdMock(templateId, { data: { ...mockTemplate, content: "Hello" } });
  PUTUpdateNoteTemplateMock(templateId, { serverError: true });
  renderWithProviders(<NoteTemplateEditor templateId={templateId} />);

  await screen.findByText("Hello");
  await user.click(screen.getByRole("button", { name: /edit/i }));
  await user.click(screen.getByRole("button", { name: /save/i }));

  expect(await screen.findByText(/failed/i)).toBeInTheDocument();
});
```

Order: happy path, then interactions, then error cases.

## Workflow

**Default: use the subagent workflow** in [workflows.md](workflows.md) for writing and reviewing tests. Parallel subagents give better depth and context management than a single sequential pass. Skip subagents only for trivially scoped tasks (for example, reviewing a single short test file where all context fits in one read).

## Test Scopes

### Small tests (unit tests)

Isolated tests with no network call mocking — used in packages like `ui` and `utils`.

Examples: `packages/ui/src/components/tags/Tag.test.tsx`, `packages/ui/src/components/inputs/TextArea.test.tsx`,
`packages/ui/src/components/form/formFields/CheckboxField.test.tsx`.

### Page tests (integration tests)

Match the pattern `*.page.test.tsx`.

## Page and Hook Tests

Page tests exercise route-level behavior through `renderPage(...)` and `setupPageLevelTest()`. Assert loading, empty, error, permission/read-only, and navigation outcomes explicitly.

Hook tests assert on the **public return value** or callback contract, not internal refs, effects, or cleanup implementation details.

```tsx
test("returns results after debounce delay", async () => {
  const { result } = renderHook(() => useDebounceSearch());
  act(() => result.current.handleSearch("acme"));
  vi.advanceTimersByTime(300);

  await waitFor(() => {
    expect(result.current.results).toHaveLength(2);
  });
});
```

## Other Layers

- **Accessibility**: include `axe` checks in component and page suites when the local setup supports it.
- **Query hooks and async flows**: mock the network with shared MSW helpers, then assert on the returned loading, success, and error states.
- **Complex libraries**: for TipTap, Highcharts, and AG Grid, read [complex-libraries.md](complex-libraries.md). JSDOM cannot faithfully render these libraries end-to-end, so test around the integration seams.

## Coverage Data

Coverage is a **diagnostic tool** for spotting blind spots, not a target to maximize. Do not add tests or assertions purely to increase numbers.

Prioritize:

1. **Critical paths** — the behaviors users rely on most
2. **Complex or failure-prone logic** — branching, loading/error handling, permissions, navigation guards
3. **Fault models** — think "what could go wrong?" rather than "which lines are uncovered?"

To identify blind spots, generate `lcov.info` from the relevant app or package directory:

```bash
cd frontend/apps/buyer-app && pnpm run test:ci src/pages/settings/organization/notes/templates/[id].page.test.tsx --coverage --coverage.reporter=lcov --coverage.reporter=text --coverage.include="src/pages/settings/organization/notes/templates/[id].page.tsx"
```

Adjust the working directory and paths for the app or package under test. When using the subagent workflow (see [workflows.md](workflows.md)), the coverage analyzer agent handles this — do not also run it yourself.

## Flakiness Patterns to Avoid

See the full list in [review-checklist.md](review-checklist.md) under "Flakiness". Key patterns: `getBy*` on async content, missing `await` on `userEvent`, timers without fake timer control, shared query client state, side effects inside `waitFor`, and assertions on list order without a real ordering guarantee.

## Reviewing Tests

When reviewing existing tests, read [review-checklist.md](review-checklist.md) for the full review checklist, reporting format, and verification steps.
