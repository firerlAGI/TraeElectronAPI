#!/usr/bin/env bash
set -euo pipefail

write_step() {
  printf '[TraeAPI] %s\n' "$1"
}

repo_zip_url="https://github.com/firerlAGI/TraeElectronAPI/archive/refs/heads/main.zip"
install_root="${HOME}/.openclaw/tools/TraeElectronAPI"
openclaw_command="openclaw"
base_url="http://127.0.0.1:8787"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo-zip-url)
      repo_zip_url="$2"
      shift 2
      ;;
    --install-root)
      install_root="$2"
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
    *)
      printf 'Unknown argument: %s\n' "$1" >&2
      exit 1
      ;;
  esac
done

temp_root="$(mktemp -d "${TMPDIR:-/tmp}/traeapi-bootstrap-XXXXXX")"
archive_path="$temp_root/TraeElectronAPI.zip"
extract_root="$temp_root/extract"
mkdir -p "$extract_root"

cleanup() {
  rm -rf "$temp_root"
}
trap cleanup EXIT

write_step "Downloading repository archive from GitHub."
if command -v curl >/dev/null 2>&1; then
  curl -L "$repo_zip_url" -o "$archive_path"
elif command -v wget >/dev/null 2>&1; then
  wget -O "$archive_path" "$repo_zip_url"
else
  printf 'curl or wget is required to download the repository archive.\n' >&2
  exit 1
fi

write_step "Extracting repository archive."
unzip -q "$archive_path" -d "$extract_root"

repo_dir="$(find "$extract_root" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do if [[ -f "$dir/start-traeapi.command" || -f "$dir/start-traeapi.cmd" || -f "$dir/package.json" ]]; then printf '%s' "$dir"; break; fi; done)"
if [[ -z "$repo_dir" ]]; then
  printf 'Could not find the extracted repository root.\n' >&2
  exit 1
fi

install_parent="$(dirname "$install_root")"
mkdir -p "$install_parent"

if [[ -e "$install_root" ]]; then
  backup_path="$install_root.bak-$(date +%Y%m%d%H%M%S)"
  write_step "Existing install found. Moving it to $backup_path"
  mv "$install_root" "$backup_path"
fi

write_step "Moving repository into the local install directory."
mv "$repo_dir" "$install_root"
chmod +x "$install_root/start-traeapi.command" "$install_root/scripts/install-openclaw-integration.sh" "$install_root/scripts/bootstrap-openclaw-integration.sh" 2>/dev/null || true

write_step "Running the local install script."
"$install_root/scripts/install-openclaw-integration.sh" --repo-root "$install_root" --openclaw-command "$openclaw_command" --base-url "$base_url"

printf '\n'
printf 'Bootstrap install completed.\n'
printf -- '- Install root: %s\n' "$install_root"
printf -- '- Next step: restart OpenClaw Gateway\n'
printf '\n'