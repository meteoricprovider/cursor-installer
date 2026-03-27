---
name: backend-testing
description: Use when writing or reviewing backend Python tests for API endpoints, services, or repositories in the Tacto backend. NOT for frontend tests.
---

# Writing Backend Tests

## Overview

Verify **observable outcomes** (API responses, DB state, side effects), not implementation details. Real Postgres with per-test transaction rollback is provided — never mock the database layer. Only mock external HTTP calls (`pytest-httpx`, `aiohttp_mock`).

**Exception:** When testing service-layer logic in isolation, asserting on repository calls or domain events is acceptable — those ARE the service's observable outputs.

## When to Use

- Writing new test files for endpoints, services, or domain logic
- Reviewing existing tests for coverage gaps or convention violations
- NOT for frontend tests

## Fixtures (Async — most common)

| Fixture              | Type                              | Purpose                                        |
| -------------------- | --------------------------------- | ---------------------------------------------- |
| `aac`                | `AsyncClient`                     | Authenticated HTTP client (already logged in)  |
| `async_session`      | `AsyncSession`                    | Database session (auto-rolled-back)            |
| `auth_user_async`    | `models.User`                     | The authenticated user                         |
| `organization_async` | `models.Organization`             | The user's organization                        |
| `logged_user_async`  | `LoggedUser`                      | User + token combo                             |
| `supplier_async`     | `models.Supplier`                 | A supplier in the org                          |
| `expect_authz`       | `AuthorizationExpectationManager` | Authorization expectations                     |
| `set_feature_flag`   | `Callable[..., None]`             | Toggle feature flags                           |
| `mailer`             | `FakeMailer`                      | Email assertions (`.outbox`, `.last_delivery`) |

Legacy sync fixtures: `client` (TestClient), `session` (orm.Session), `auth_user`.

## Factories

```python
supplier = await SupplierFactory.acreate(organization_id=organization_async.id)  # async
supplier = SupplierFactory.create()   # sync
supplier = SupplierFactory.build()    # no DB
```

Factories manage their own session — **never pass session as an argument**. Located at `tests.factories.<entity>`.

## Authorization

Use `@pytest.mark.expect_authz` when a test is expected to trigger authorization checks.
Leave endpoint tests unmarked when no authz call is expected so the plugin can fail on unexpected checks.

```python
# Endpoint does authz, but this test is not validating authz behavior:
@pytest.mark.expect_authz(allow_any=True)
async def test_update_note_returns_200(aac: AsyncClient, supplier_async: models.Supplier) -> None:
    ...

# Permission denied test — explicit deny:
@pytest.mark.expect_authz
async def test_update_note_returns_403_without_edit_permission(
    aac: AsyncClient,
    auth_user_async: models.User,
    supplier_async: models.Supplier,
    expect_authz: AuthorizationExpectationManager,
) -> None:
    expect_authz.on(authz.Supplier(supplier_async.id)).by(
        authz.User(auth_user_async.id)
    ).deny_permission("edit")

    response = await aac.patch(f"/suppliers/{supplier_async.id}/notes/...", json={...})
    assert response.status_code == status.HTTP_403_FORBIDDEN
```

Write explicit 403 tests first for protected endpoints; only use `allow_any=True` for follow-up tests where authz behavior is not the focus.

## Conventions

| Don't                                                 | Do Instead                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `@pytest.mark.asyncio`                                | Nothing — anyio auto mode handles it                                                                                   |
| `headers={"Authorization": ...}`                      | `aac` is already authenticated                                                                                         |
| Test classes                                          | Flat `async def test_*` functions                                                                                      |
| `authenticated_user`, `db_session`                    | `auth_user_async`, `async_session`                                                                                     |
| `mocker.patch` on repos                               | Factories + real Postgres                                                                                              |
| `Factory.create(session)`                             | `Factory.create()` / `await Factory.acreate()`                                                                         |
| Blindly replacing missing IDs with `generate_uuid7()` | Match endpoint ID type: use `generate_uuid7()` for UUID IDs; use integer sentinels (for example `99999`) for `int` IDs |
| `from app.models.supplier import Supplier`            | `from app.repository import models`                                                                                    |
| Drop 401 coverage because `aac` is authenticated      | Keep 401 and 403 assertions based on the endpoint auth flow                                                            |
| Manual `session.commit()`                             | Factories + transaction rollback handle it                                                                             |
| AAA comments / docstrings                             | Descriptive function names + blank line separation                                                                     |
| Broad exact-match assertions on full JSON             | Narrow assertions — see guidance below                                                                                 |

### Assertion Style

**1-2 narrow checks** — plain `assert` is fine:

```python
assert response.json()["name"] == "Acme"
assert response.json()["status"] == "active"
```

**Multiple properties or deep structure** — prefer `IsPartialDict` / `HasAttributes` to avoid brittle full-object equality:

```python
assert response.json() == IsPartialDict(name="Acme", status="active", id=str(supplier.id))
```

**Lists with non-deterministic order** — use `IsList` with `check_order=False` (but first check if the code under test could guarantee order cheaply via `ORDER BY`):

```python
assert response.json() == IsList(
    IsPartialDict(name="Acme"), IsPartialDict(name="Globex"), check_order=False
)
```

**Timestamps and floats** — always use `IsDatetime` / `pytest.approx()` rather than exact values.

## Canonical Test File

```python
from typing import TYPE_CHECKING

import pytest
from dirty_equals import IsPartialDict
from httpx import AsyncClient
from starlette import status

from app.helpers.uuid import generate_uuid7
from app.infra.authz import resources as authz
from app.repository import models
from tests.factories.note import NoteFactory
from tests.utils.authz.expectations import AuthorizationExpectationManager

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.expect_authz(allow_any=True)
async def test_get_notes_returns_supplier_notes(
    aac: AsyncClient, supplier_async: models.Supplier
) -> None:
    note = await NoteFactory.acreate(supplier_id=supplier_async.id)
    response = await aac.get(f"/suppliers/{supplier_async.id}/notes/")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == [IsPartialDict(id=str(note.id))]


@pytest.mark.expect_authz
async def test_get_notes_returns_403_without_view_permission(
    aac: AsyncClient,
    auth_user_async: models.User,
    supplier_async: models.Supplier,
    expect_authz: AuthorizationExpectationManager,
) -> None:
    expect_authz.on(authz.Supplier(supplier_async.id)).by(
        authz.User(auth_user_async.id)
    ).deny_permission("view")

    response = await aac.get(f"/suppliers/{supplier_async.id}/notes/")
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.expect_authz(allow_any=True)
async def test_get_notes_returns_404_for_nonexistent_supplier(aac: AsyncClient) -> None:
    response = await aac.get(f"/suppliers/{generate_uuid7()}/notes/")
    assert response.status_code == status.HTTP_404_NOT_FOUND
```

Order: happy path, then authorization, then error cases.

## Workflow

**Default: use the subagent workflow** in [workflows.md](workflows.md) for writing and reviewing tests. Parallel subagents give better depth and context management than a single sequential pass. Skip subagents only for trivially scoped tasks (e.g., reviewing a single, short test file where all context fits in one read).

## Service Tests

Service tests call service methods directly — they don't go through HTTP, so `@pytest.mark.expect_authz` is not needed. Instantiate with real repos — no mocking:

```python
async def test_service_creates_note(async_session: AsyncSession, logged_user_async: LoggedUser) -> None:
    repo = NoteWriteRepo(async_session)
    service = NoteService(repo)
    note = await service.create(user=logged_user_async, content="Test")
    assert note.content == "Test"
```

## Other Layers

- **Domain tests**: Pure unit tests, no DB — `def test_*`, use `build()` or direct instantiation
- **Feature flags**: Use `set_feature_flag("flag_name", True)` fixture
- **Celery tasks**: Run sync in tests (`task_always_eager=True`), use `patch_celery_task`
- **Email**: Assert on `mailer.outbox` and `mailer.last_delivery.subject`

## Coverage Data

Coverage is a **diagnostic tool** for spotting blind spots, not a target to maximize. Do not add tests or assertions purely to increase numbers.

Prioritize:

1. **Critical paths** — the happy path that users hit most
2. **Complex or failure-prone logic** — branching, error handling, edge cases
3. **Fault models** — think "what could go wrong?" rather than "which lines are uncovered?"

To identify blind spots, generate `lcov.info` (gitignored) for the module under test:

```bash
cd backend && uv run pytest --cov=app/path/to/module --cov-report=lcov:lcov.info tests/path/to/tests/
```

When using the subagent workflow (see [workflows.md](workflows.md)), the coverage analyzer agent handles this — do not also run it yourself.

## Flakiness Patterns to Avoid

See the full list in [review-checklist.md](review-checklist.md) under "Flakiness". Key patterns: non-deterministic list order without `check_order=False`, time-dependent logic without frozen time, unmocked external HTTP calls.

## Reviewing Tests

When reviewing existing tests, read [review-checklist.md](review-checklist.md) for the full review checklist, reporting format, and verification steps.
