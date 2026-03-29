# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

## 0.3.1 - 2026-03-29

### Added

- End-user install guides in English and Chinese.
- End-user FAQ in English and Chinese.
- Extra README entry points for install, FAQ, and OpenClaw integration docs.

### Changed

- Renamed the OpenClaw plugin id from `trae-ide` to `traeclaw` across manifests, install scripts, examples, and docs.
- Kept plugin config migration compatibility so legacy `trae-ide` entries can still supply fallback settings during upgrades.

### Notes

- Existing users should verify the new plugin id with `openclaw plugins info traeclaw` after upgrading.

## 0.3.0 - 2026-03-19

### Added

- `trae_open_project`, `trae_switch_mode`, and `trae_update_self` tools for the OpenClaw plugin.
- Plugin-side npm update checks surfaced through `trae_status`.
- Optional background auto-update flow for npm-installed OpenClaw plugin users.

### Changed

- Trae mode switching now waits through UI transition states and is more stable in real desktop automation.
- OpenClaw install scripts, dev hot-plugin config, and examples now allow the new plugin update tool.

### Notes

- The self-update and auto-update flow is intended for npm-installed plugin users. Local linked installs may still require manual refresh.

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
