# API Versioning Strategy

## Current Version

All Nexus RTP Platform APIs use **`/api/v1/`** prefix.

## Versioning Policy

| Aspect | Policy |
|---|---|
| **Scheme** | URI-based path versioning (`/api/v1/`, `/api/v2/`) |
| **Current version** | `v1` |
| **Deprecation notice** | Minimum 6 months before sunset via `Deprecation` + `Sunset` headers |
| **Breaking changes** | New major version; old version maintained in parallel |
| **Non-breaking changes** | Added to current version (additive fields, new endpoints) |

## What Constitutes a Breaking Change

- Removing an endpoint or HTTP method
- Removing or renaming a response field
- Changing a field type (e.g., `string` → `int`)
- Adding a new **required** request field
- Changing error response structure
- Changing authentication/authorization requirements

## What Is NOT a Breaking Change

- Adding new optional request fields
- Adding new response fields
- Adding new endpoints
- Adding new enum values to existing fields
- Performance improvements

## Deprecation Headers

When an API version is deprecated, responses include:

```
Deprecation: true
Sunset: Sat, 01 Jan 2027 00:00:00 GMT
Link: </api/v2/payments>; rel="successor-version"
```

## Migration Process

1. **Announce** deprecation in changelog and release notes
2. **Add** `Deprecation` and `Sunset` headers to v1 responses
3. **Publish** v2 spec in `docs/openapi.yaml`
4. **Run** both versions in parallel for ≥6 months
5. **Monitor** v1 traffic via Prometheus (`api_version_requests_total{version="v1"}`)
6. **Remove** v1 only after traffic drops below threshold

## OpenAPI Specification

The consolidated API spec is at [`docs/openapi.yaml`](openapi.yaml).

## Contract Testing

Contract tests validate that service implementations match the OpenAPI spec.
Run with:

```bash
# Install dredd
npm install -g dredd

# Run contract tests against local stack
dredd docs/openapi.yaml http://localhost:8000 --hookfiles=tests/contract/hooks.js
```
