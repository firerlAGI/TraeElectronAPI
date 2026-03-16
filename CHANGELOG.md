# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added

- End-user install guides in English and Chinese.
- End-user FAQ in English and Chinese.
- Extra README entry points for install, FAQ, and OpenClaw integration docs.

## 0.2.1 - 2026-03-16

### Added

- OpenClaw native plugin with `trae_status` and `trae_delegate` tools.
- OpenClaw integration guides in English and Chinese.
- Built-in `/chat` page for quick local testing.
- OpenAPI export endpoints and generated OpenAPI files.
- Simplified `POST /v1/chat` and `POST /v1/chat/stream` endpoints.

### Changed

- Quickstart now prefers attach-first startup and falls back to a dedicated Trae profile automatically.
- Trae composer selection and input fallback logic are more stable in real UI automation.
- README is now bilingual and oriented toward end users instead of only repository contributors.

### Notes

- This remains a local desktop bridge based on Trae UI automation, not an official Trae API.
