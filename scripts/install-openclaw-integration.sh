#!/usr/bin/env bash
set -euo pipefail

write_step() {
  printf '[TraeAPI] %s\n' "$1"
}

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
openclaw_command="openclaw"
base_url="http://127.0.0.1:8787"
auto_start=1
skip_validate=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-root)
      repo_root="$2"
      shift 2
      ;;
    --openclaw-command)
      openclaw_command="$2"
      shift 2
      ;;
    --base-url)
      base_url="$2"
      shift 2
      ;;
    --no-auto-start)
      auto_start=0
      shift
      ;;
    --skip-validate)
      skip_validate=1
      shift
      ;;
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

resolved_repo_root="$(cd "$repo_root" && pwd)"
plugin_dir="$resolved_repo_root/integrations/openclaw-trae-plugin"
quickstart_command="$resolved_repo_root/start-traeapi.command"

if [[ ! -d "$plugin_dir" ]]; then
  printf 'Plugin directory not found: %s\n' "$plugin_dir" >&2
  exit 1
fi

if [[ -f "$quickstart_command" ]]; then
  chmod +x "$quickstart_command"
else
  node_binary="$(command -v node || true)"
  if [[ -z "$node_binary" ]]; then
    printf 'node is required when start-traeapi.command is not available.\n' >&2
    exit 1
  fi
  quickstart_command="$node_binary $resolved_repo_root/scripts/quickstart.js"
fi

capture_openclaw() {
  "$openclaw_command" "$@" 2>/dev/null
}

run_openclaw() {
  "$openclaw_command" "$@"
}

get_config_text() {
  local raw
  if ! raw="$(capture_openclaw config get "$1")"; then
    return 1
  fi

  raw="${raw%$'\n'}"
  if [[ -z "$raw" || "$raw" == "undefined" || "$raw" == "null" ]]; then
    return 1
  fi

  printf '%s' "$raw"
}

merge_string_arrays() {
  local current_raw="$1"
  local add_json="$2"
  CURRENT_RAW="$current_raw" ADD_JSON="$add_json" node -e 'function parseValue(raw){if(!raw||raw==="undefined"||raw==="null"){return [];}try{const parsed=JSON.parse(raw);if(Array.isArray(parsed)){return parsed.map((item)=>String(item));}if(typeof parsed === "string"){return [parsed];}}catch{}return [String(raw)];} const current=parseValue(process.env.CURRENT_RAW); const add=JSON.parse(process.env.ADD_JSON || "[]"); const seen=new Set(); const output=[]; for (const value of [...current, ...add]) { const normalized=String(value || "").trim(); if (!normalized || seen.has(normalized.toLowerCase())) { continue; } seen.add(normalized.toLowerCase()); output.push(normalized); } process.stdout.write(JSON.stringify(output));'
}

set_config_value() {
  local config_path="$1"
  local value="$2"
  local strict_json="${3:-0}"
  if [[ "$strict_json" == "1" ]]; then
    run_openclaw config set "$config_path" "$value" --strict-json
  else
    run_openclaw config set "$config_path" "$value"
  fi
}

update_tool_policy() {
  local allow_path="$1"
  local also_allow_path="$2"
  local tool_json="$3"
  local allow_raw=""
  local also_allow_raw=""

  allow_raw="$(get_config_text "$allow_path" || true)"
  also_allow_raw="$(get_config_text "$also_allow_path" || true)"

  if [[ -n "$allow_raw" ]]; then
    set_config_value "$allow_path" "$(merge_string_arrays "$allow_raw" "$tool_json")" 1
    printf 'allow'
    return
  fi

  set_config_value "$also_allow_path" "$(merge_string_arrays "$also_allow_raw" "$tool_json")" 1
  printf 'alsoAllow'
}

write_step "Checking whether the plugin is already installed."
plugin_info="$(capture_openclaw plugins info trae-ide || true)"
if [[ -z "$plugin_info" ]]; then
  write_step "Installing the OpenClaw plugin from the local repository."
  run_openclaw plugins install --link "$plugin_dir"
else
  write_step "Plugin trae-ide is already installed. Reusing the existing install."
fi

write_step "Enabling the plugin."
run_openclaw plugins enable trae-ide || true
set_config_value "plugins.entries.trae-ide.enabled" "true" 1
set_config_value "plugins.entries.trae-ide.config.baseUrl" "$base_url"
if [[ "$auto_start" == "1" ]]; then
  set_config_value "plugins.entries.trae-ide.config.autoStart" "true" 1
else
  set_config_value "plugins.entries.trae-ide.config.autoStart" "false" 1
fi
set_config_value "plugins.entries.trae-ide.config.quickstartCommand" "$quickstart_command"
set_config_value "plugins.entries.trae-ide.config.quickstartCwd" "$resolved_repo_root"

tool_json='["trae-ide","trae_status","trae_delegate"]'
root_policy_mode="$(update_tool_policy "tools.allow" "tools.alsoAllow" "$tool_json")"
write_step "Updated root tool policy via tools.${root_policy_mode}."

agents_raw="$(get_config_text "agents.list" || true)"
agent_count="$(AGENTS_RAW="$agents_raw" node -e 'const raw = process.env.AGENTS_RAW || ""; if (!raw) { process.stdout.write("0"); process.exit(0); } try { const parsed = JSON.parse(raw); process.stdout.write(String(Array.isArray(parsed) ? parsed.length : 0)); } catch { process.stdout.write("0"); }')"
if [[ "$agent_count" =~ ^[0-9]+$ ]] && [[ "$agent_count" -gt 0 ]]; then
  for ((i = 0; i < agent_count; i += 1)); do
    mode="$(update_tool_policy "agents.list[$i].tools.allow" "agents.list[$i].tools.alsoAllow" '["trae_status","trae_delegate"]')"
    write_step "Updated agent[$i] tool policy via ${mode}."
  done
fi

if [[ "$skip_validate" != "1" ]]; then
  write_step "Validating OpenClaw config."
  run_openclaw config validate
fi

printf '\n'
printf 'TraeAPI + OpenClaw integration install completed.\n'
printf -- '- Repo root: %s\n' "$resolved_repo_root"
printf -- '- Plugin id: trae-ide\n'
printf -- '- Base URL: %s\n' "$base_url"
printf -- '- Quickstart: %s\n' "$quickstart_command"
printf -- '- Next step: restart OpenClaw Gateway\n'
printf -- '- Verify: openclaw plugins info trae-ide\n'
printf -- '- Verify after restart: ask OpenClaw to use trae_status\n'
printf '\n'