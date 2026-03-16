# Security Policy

## Scope

TraeAPI is a local desktop bridge. It is designed for loopback or trusted local-network usage, not direct public Internet exposure.

## Supported Versions

Security fixes are best-effort on the latest branch. Older tagged versions may not receive patches.

## Deployment Guidance

- Bind the gateway to loopback unless you explicitly need LAN access.
- Enable `TRAE_GATEWAY_TOKEN` if any untrusted local process may reach the service.
- Do not expose the Trae remote debugging port directly to untrusted networks.
- Treat selector diagnostics and local logs as potentially sensitive because they may reflect project content.

## Reporting

If you find a security issue, open a private report through the repository owner when possible. If a private channel is unavailable, open a GitHub issue with only the minimum detail needed to start coordination and avoid posting secrets, tokens, or private project content.
