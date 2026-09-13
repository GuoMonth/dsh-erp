#!/usr/bin/env bash
# Run in a local terminal. Never pass the token as a command-line argument.
set +x
set -euo pipefail
umask 077

erp_npm_token=${DSH_ERP_NPM_TOKEN:-}
if [[ -z "$erp_npm_token" ]]; then
  read -r -s -p 'NPM granular token (hidden): ' erp_npm_token </dev/tty
  printf '\n' >/dev/tty
fi
if [[ ! "$erp_npm_token" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'Token is empty or contains invalid characters.\n' >&2
  exit 1
fi

erp_auth_dir="$HOME/.config/dsh-erp"
if [[ -L "$erp_auth_dir" || -L "$erp_auth_dir/npmrc" ]]; then
  printf 'Refusing a symlink at the authentication destination.\n' >&2
  exit 1
fi
mkdir -p "$erp_auth_dir"
chmod 700 "$erp_auth_dir"
erp_auth_tmp=$(mktemp "$erp_auth_dir/npmrc.XXXXXX")
trap 'rm -f "$erp_auth_tmp"' EXIT
printf '//registry.npmjs.org/:_authToken=%s\n' "$erp_npm_token" > "$erp_auth_tmp"
chmod 600 "$erp_auth_tmp"
mv "$erp_auth_tmp" "$erp_auth_dir/npmrc"
unset erp_npm_token DSH_ERP_NPM_TOKEN
printf 'npm authentication configured in %s/npmrc (mode 600). No publish performed.\n' "$erp_auth_dir"
