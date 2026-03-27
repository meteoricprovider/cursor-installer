# Review Checklist for Backend Tests

Loaded when reviewing existing tests. Evaluate each test file against these dimensions (in priority order).

## Review Checklist

1. **Coverage gaps** — Think in fault models: "what could go wrong?" Read the endpoint/service source, enumerate observable outcomes, and cross-reference against existing tests. Use the coverage command from SKILL.md's "Coverage Data" section to generate `lcov.info` if needed. Do not suggest tests purely to increase coverage numbers. This is the most valuable review finding.
2. **Outcome vs. implementation coupling** — Are tests asserting on API responses / DB state, or on internal mock calls (`mock_repo.save.assert_called_once`)?
3. **Real DB vs. mocked repos** — Is the test using `mocker.patch` on repositories instead of factories + real Postgres? Does it use patching that bypasses real logic?
4. **Assertion quality** — Are assertions appropriately narrow? 1-2 property checks → plain `assert` is fine. Multiple properties or deep structure → `IsPartialDict` / `HasAttributes`. Unordered lists → `IsList(..., check_order=False)` (but first check if the query could guarantee order). Full-object exact-match assertions are a smell unless the test genuinely cares about every field.
5. **Authorization testing** — Do tests that call authz use `@pytest.mark.expect_authz` correctly? Are there explicit 403 tests, and are `allow_any=True` markers limited to non-authz-focused cases? Are tests that should not call authz left unmarked to catch unexpected checks?
6. **Test naming** — Do names describe outcomes (`returns_201_with_tag_data`) or methods (`calls_repo_save`)?
7. **Test structure** — Flat async functions, or unnecessary test classes? Self-contained, or hidden context in fixtures?
8. **Fixture usage** — Using the right fixtures (`aac` not hand-rolled client, `async_session` not `session` for async tests)? Using factories instead of manual model construction?
9. **Anti-patterns** — Manual `@pytest.mark.asyncio`, explicit auth headers, AAA comments, integer IDs?
10. **Flakiness** — Non-deterministic patterns:
    - List order assertions without `ORDER BY` — use `IsList(..., check_order=False)`
    - Time-dependent logic without frozen time (`freezegun` / `time_machine`)
    - Tests depending on execution order or shared state (missing factory isolation)
    - Float comparisons without tolerance (`pytest.approx()`)
    - Exact timestamp assertions instead of `IsDatetime`
    - Unmocked external HTTP calls (`httpx`, `aiohttp`) — network flakes in CI

## Reporting Format

For each issue found, provide:

- **The specific test** (function name and line)
- **What's wrong** (which principle it violates)
- **Concrete fix** — show the before/after code, not just a description

Group findings by severity:

- **Critical:** Coverage gaps — outcomes with no test at all. List the missing outcome and provide a skeleton test.
- **High impact:** Tests that are actively misleading (mock repos that bypass real query logic, missing authz markers, tests that pass but don't test what they claim). These mask real bugs.
- **Medium impact:** Tests that work but are fragile or hard to maintain. Brittle exact-match assertions, unnecessary test classes, poor naming.
- **Low impact:** Style improvements. Naming consistency, import ordering, fixture choice.

## Verify Before Suggesting

A suggested rewrite that fails is worse than the original test. Before proposing any code change:

1. **Read the fixtures and conftest** — Understand what `conftest.py` provides. Don't suggest using a fixture that doesn't exist or passing arguments a factory doesn't accept.
2. **Check factory fields** — Before writing `await SomeFactory.acreate(field=value)`, verify the factory supports that field. Read the factory definition if unsure.
3. **Trace the endpoint** — Before changing assertions, read the actual endpoint/service code to confirm what it returns. Don't assume a 200 response shape — check the serializer/schema.
4. **Respect authz requirements** — If replacing a mocked-repo test with a real-DB test, check whether the endpoint performs authz calls. Add `@pytest.mark.expect_authz` when it does; leave tests unmarked when it should not.
5. **Check DB relationships** — If the rewrite creates data with factories, ensure required foreign keys are satisfied (e.g., a tag needs a supplier, a supplier needs an organization). Missing relationships cause IntegrityError, not test failures.
6. **Run the tests** — After presenting the review, offer to apply the changes and run the affected tests to confirm they pass. If a suggested change can't be verified to work, mark it as **unverified** and explain what would need to be checked.

If you're unsure whether a rewrite would work, **say so explicitly** rather than presenting it as a confident fix.

## Review Scope

- If the user points to specific test files, review those.
- If the user asks to review tests for a feature/endpoint, find all related test files first.
- **Always analyze coverage gaps**, even when reviewing specific files — read the endpoint/service source to understand what outcomes exist beyond what's tested.
- When suggesting fixes, provide complete rewritten tests, not just descriptions of changes.
