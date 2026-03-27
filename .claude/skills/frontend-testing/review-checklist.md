# Review Checklist for Frontend Tests

Loaded when reviewing existing tests. Evaluate each test file against these dimensions (in priority order).

## Review Checklist

1. **Coverage gaps** — Think in fault models: "what could go wrong?" Read the component, page, or hook source, enumerate observable outcomes, and cross-reference them against existing tests. Use the coverage command from the [Coverage Data section in SKILL.md](./SKILL.md#coverage-data) if needed. Do not suggest tests purely to increase coverage numbers. This is the most valuable review finding.
2. **Observable outcomes vs. implementation coupling** — We only want to test observable outcomes (apart from pure logic hook/function testing) rather than implementation details. Tests should assert on rendered UI, accessible state, navigation, and callback contracts — not on internal mock calls, DOM structure, or CSS classes.
3. **Shared mocks vs. bypassing real logic** — Is the test using `vi.mock` for API modules or React Query hooks instead of shared MSW mocks? Are there raw `server.use(...)` calls or inline URLs instead of helpers from `@repo/tacto-api/src/__mocks__/`? Is a toast or notification library mocked instead of rendering the real provider?
4. **Assertion quality** — Are happy-path assertions presence-first? For 1-2 narrow checks, plain `expect(...)` is fine. For multiple related fields, prefer `toHaveFormValues`, `objectContaining`, or focused helper assertions over broad exact-equality. Async UI should use `findBy*` / `waitFor`, not `getBy*`. Order assertions should only be exact when the product code guarantees order.
   **Acceptable absence-only exceptions:**
   - **JSDOM limitation** — Canvas-based libraries (Highcharts) or virtualized grids produce nothing meaningfully queryable, so "loading indicator gone + no error" may be the best available signal. Call out the trade-off explicitly.
   - **Deletion** — When the behavior IS removal, there may be nothing positive to assert.
   - **Side-channel cleanliness** — Confirming no error alert alongside a success assertion, always as a secondary assertion after a presence check.
5. **Test infrastructure** — Is the correct wrapper and setup used (`renderPage`, `setupPageLevelTest`, local `renderWithProviders`, `setupTests`, query providers, router providers, toaster/snackbar providers)? A rewrite that assumes missing providers is wrong.
6. **Scenario coverage** — Are loading, empty, error, permission/read-only, navigation guard, success/failure, and callback-contract behaviors covered where relevant?
7. **Test naming** — Do names describe outcomes (`shows validation error after submit`) or internal methods (`calls setError`)?
8. **Test structure** — Are tests self-contained (DAMP), or is important setup hidden in `beforeEach`? Is there conditional logic or branching inside the test itself that makes the scenario harder to read?
9. **Complex library / JSDOM constraints** — For TipTap, Highcharts, or AG Grid, is the test fighting JSDOM instead of testing the integration seam around the library?
10. **Flakiness** — Non-deterministic patterns:
    - `getBy*` on async content instead of `findBy*` / `waitFor`
    - Missing `await` on `userEvent` calls
    - Timers without `vi.useFakeTimers()` + `vi.advanceTimersByTime()`
    - Shared mutable state between tests (`queryClient` not reset, module-level state)
    - `waitFor` callbacks with side effects inside them
    - Assertions on order when the UI or API does not guarantee order

## Reporting Format

For each issue found, provide:

- **The specific test** (function name and line)
- **What's wrong** (which principle it violates)
- **Concrete fix** — show the before/after code, not just a description

Group findings by severity:

- **Critical:** Coverage gaps — outcomes with no test at all. List the missing outcome and provide a skeleton test.
- **High impact:** Tests that are actively misleading (mocked API/query hooks that bypass real logic, raw `server.use(...)` or spy assertions that test plumbing instead of UI behavior, tests that pass when the real user-visible behavior is broken).
- **Medium impact:** Tests that work but are fragile or hard to maintain. Hidden setup, brittle query strategy, missing provider context, or JSDOM-hostile assertions.
- **Low impact:** Style improvements. Naming consistency, grouping, small query or assertion cleanups.

## Verify Before Suggesting

A suggested rewrite that fails is worse than the original test. Before proposing any code change:

1. **Read the wrapper and setup** — Understand what providers are rendered (`QueryClientProvider`, router, toaster/snackbar, permission context, and so on). Do not suggest assertions that rely on providers the wrapper does not include.
2. **Check available shared mocks** — Before replacing a raw `server.use(...)` with a shared mock call, verify the helper exists in `@repo/tacto-api/src/__mocks__/`. If it does not, say so — do not invent a mock name.
3. **Trace the render output or hook contract** — Before changing assertions, confirm the component, page, or hook actually exposes the behavior you plan to assert.
4. **Respect async and routing boundaries** — If the original test uses `findBy*`, `waitFor`, router mocks, or query-provider setup, the rewrite must preserve those async and provider boundaries.
5. **Check JSDOM and browser constraints** — If the behavior depends on a missing browser API or a complex library, confirm the required polyfills or test utilities already exist before suggesting a rewrite.
6. **Run the tests** — After presenting the review, offer to apply the changes and run the affected tests to confirm they pass. If a suggested change cannot be verified to work, mark it as **unverified** and explain what still needs to be checked.

If you're unsure whether a rewrite would work, **say so explicitly** rather than presenting it as a confident fix.

## Review Scope

- If the user points to specific test files, review those.
- If the user asks to review tests for a feature, page, or component, find all related test files first.
- **Always analyze coverage gaps**, even when reviewing specific files — read the source code to understand what behaviors exist beyond what is already tested.
- When suggesting fixes, provide complete rewritten tests, not just descriptions of changes.
