#!/usr/bin/env bash
set -euo pipefail
umask 077

# Installs only this project's prebuilt release. Model credentials are never read.
if [[ "${1:-}" == "--help" ]]; then
  printf '%s\n' '抱抱龙 Pets: install.sh [--codex | --dsh | --desktop] [--profile NAME]' '不带参数：自动识别本机 Codex 与 DSH；两者都没有时，macOS 安装桌面版。' 'Restore: install.sh uninstall --codex | --dsh | --desktop [--profile NAME]' 'Codex：官方九状态兼容图集；DSH 与桌面版：完整66套动作。'
  exit 0
fi
for pet_tool in curl tar awk mktemp; do
  command -v "$pet_tool" >/dev/null || { printf '缺少系统工具: %s\n' "$pet_tool" >&2; exit 1; }
done
case "$(uname -s)" in
  Darwin) pet_os=darwin; pet_home="${PIXEL_PETS_INSTALL_HOME:-$HOME/Library/Application Support/抱抱龙/Pets}" ;;
  Linux) pet_os=linux; pet_home="${PIXEL_PETS_INSTALL_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/baobaolong-pets}" ;;
  *) printf '%s\n' 'DSH 一键安装入口支持 macOS 和 Linux。' >&2; exit 1 ;;
esac
case "$(uname -m)" in
  arm64|aarch64) pet_arch=arm64 ;;
  x86_64|amd64) pet_arch=x64 ;;
  *) printf '%s\n' '暂不支持这台电脑的处理器架构。' >&2; exit 1 ;;
esac
pet_tmp="$(mktemp -d "${TMPDIR:-/tmp}/baobaolong-install.XXXXXXXX")"
trap '[[ ! -d "$pet_tmp/mnt" ]] || hdiutil detach -quiet -force "$pet_tmp/mnt" </dev/null >/dev/null 2>&1 || true; rm -rf -- "$pet_tmp"' EXIT
pet_sha() {
  if command -v shasum >/dev/null; then shasum -a 256 "$1" | awk '{print $1}'
  elif command -v sha256sum >/dev/null; then sha256sum "$1" | awk '{print $1}'
  else printf '%s\n' '需要 shasum 或 sha256sum。' >&2; return 1; fi
}
pet_download() { curl --fail --location --silent --show-error --retry 3 --proto '=https' --tlsv1.2 "$1" --output "$2"; }
pet_base='https://github.com/plbbl/pixel-agent-pets/releases/latest/download'
pet_archive='Pixel-Agent-Pets-Installer.tar.gz'
pet_codex_only=false
pet_codex_requested=false
pet_dsh_requested=false
pet_desktop_requested=false
pet_command=install
case "${1:-}" in doctor|uninstall) pet_command="$1" ;; esac
pet_args=()
for pet_arg in "$@"; do
  case "$pet_arg" in
    --codex) pet_codex_requested=true ;;
    --dsh) pet_dsh_requested=true ;;
    --both) pet_codex_requested=true; pet_dsh_requested=true ;;
    --desktop) pet_desktop_requested=true; continue ;;
  esac
  pet_args+=("$pet_arg")
done
# No target: install into whatever this machine already runs.
if [[ "$pet_command" == install && "$pet_codex_requested$pet_dsh_requested$pet_desktop_requested" == falsefalsefalse ]]; then
  if [[ -d "${CODEX_HOME:-$HOME/.codex}" ]]; then pet_codex_requested=true; pet_args+=(--codex); fi
  if grep -qs '"@deepseek-ai/dsh-web-app"' "${DSH_HOME:-$HOME/.dsh}"/profiles/*/package.json; then pet_dsh_requested=true; pet_args+=(--dsh); fi
  if [[ "$pet_codex_requested$pet_dsh_requested" == falsefalse ]]; then
    [[ "$pet_os" == darwin ]] || { printf '%s\n' '没有找到 Codex 或 DSH 网页版。桌面版下载：https://github.com/plbbl/pixel-agent-pets/releases/latest' >&2; exit 1; }
    pet_desktop_requested=true
    printf '%s\n' '没有找到 Codex 或 DSH 网页版，安装桌面版。'
  else
    printf '已识别：%s\n' "$([[ "$pet_codex_requested" == true ]] && printf 'Codex ')$([[ "$pet_dsh_requested" == true ]] && printf 'DSH')"
  fi
fi
pet_desktop() {
  [[ "$pet_os" == darwin ]] || { printf '%s\n' '桌面版一键安装支持 macOS；Windows 请下载 https://github.com/plbbl/pixel-agent-pets/releases/latest' >&2; return 1; }
  local app_name='抱抱龙桌宠.app' dir=/Applications
  [[ -w "$dir" ]] || dir="$HOME/Applications"
  if [[ "$pet_command" == doctor ]]; then
    for dir in /Applications "$HOME/Applications"; do
      [[ ! -d "$dir/$app_name" ]] || { printf '桌面版：%s\n' "$dir/$app_name"; return 0; }
    done
    printf '%s\n' '桌面版：未安装'
    return 0
  fi
  if [[ "$pet_command" == uninstall ]]; then
    pkill -f "/$app_name/Contents/MacOS/" </dev/null >/dev/null 2>&1 || true
    rm -rf -- "/Applications/$app_name" "$HOME/Applications/$app_name"
    printf '%s\n' '桌面版已移除。'
    return 0
  fi
  local dmg="Pixel-Agent-Pets-macOS-$pet_arch.dmg"
  printf '%s\n' '正在下载抱抱龙桌宠…'
  pet_download "$pet_base/$dmg" "$pet_tmp/$dmg"
  pet_download "$pet_base/$dmg.sha256" "$pet_tmp/$dmg.sha256"
  local expected
  expected="$(awk -v name="$dmg" '$2 == name || $2 == "*" name {print $1}' "$pet_tmp/$dmg.sha256")"
  [[ "$expected" =~ ^[0-9a-f]{64}$ && "$(pet_sha "$pet_tmp/$dmg")" == "$expected" ]] || { printf '%s\n' '桌面版校验失败，未安装。' >&2; return 1; }
  mkdir "$pet_tmp/mnt"
  # Children get /dev/null: under `curl | bash` stdin is the rest of this script.
  hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$pet_tmp/mnt" "$pet_tmp/$dmg" </dev/null >/dev/null
  [[ -d "$pet_tmp/mnt/$app_name" ]] || { printf '%s\n' '安装包里没有找到桌面应用。' >&2; return 1; }
  mkdir -p "$dir"
  rm -rf -- "$dir/$app_name.installing"
  ditto "$pet_tmp/mnt/$app_name" "$dir/$app_name.installing" </dev/null
  hdiutil detach -quiet "$pet_tmp/mnt" </dev/null && rmdir "$pet_tmp/mnt"
  # Quit an older copy so `open` starts the new one instead of focusing it.
  pkill -f "$dir/$app_name/Contents/MacOS/" </dev/null >/dev/null 2>&1 && sleep 1 || true
  rm -rf -- "$dir/$app_name"
  mv "$dir/$app_name.installing" "$dir/$app_name"
  open "$dir/$app_name" </dev/null
  printf '桌面版已安装到 %s 并启动。\n' "$dir"
}
if [[ "$pet_desktop_requested" == true ]]; then
  pet_desktop
  [[ "$pet_codex_requested$pet_dsh_requested" != falsefalse ]] || exit 0
fi
set -- ${pet_args[@]+"${pet_args[@]}"}
if [[ "$pet_codex_requested" == true && "$pet_dsh_requested" == false ]]; then
  pet_codex_only=true
  pet_archive='Pixel-Agent-Pets-Codex.tar.gz'
fi
printf '%s\n' '正在下载抱抱龙 Pets 安装包…'
pet_download "$pet_base/$pet_archive" "$pet_tmp/$pet_archive"
pet_download "$pet_base/SHA256SUMS" "$pet_tmp/SHA256SUMS"
pet_expected="$(awk -v name="$pet_archive" '$2 == name || $2 == "*" name {print $1}' "$pet_tmp/SHA256SUMS")"
[[ "$pet_expected" =~ ^[0-9a-f]{64}$ ]] || { printf '%s\n' '安装包校验记录无效，已停止。' >&2; exit 1; }
[[ "$(pet_sha "$pet_tmp/$pet_archive")" == "$pet_expected" ]] || { printf '%s\n' '安装包校验失败，未修改应用。' >&2; exit 1; }
tar -tzf "$pet_tmp/$pet_archive" > "$pet_tmp/entries"
awk '/(^\/|(^|\/)\.\.(\/|$))/ || $0 !~ /^pixel-agent-pets\// {bad=1} END {exit bad}' "$pet_tmp/entries" || { printf '%s\n' '安装包路径无效。' >&2; exit 1; }
tar -xzf "$pet_tmp/$pet_archive" -C "$pet_tmp"

# Prefer an existing current Node; otherwise cache a checksum-pinned official runtime.
pet_node="$(command -v node || true)"
if [[ -z "$pet_node" ]] || ! "$pet_node" -e 'process.exit(Number(process.versions.node.split(".")[0])>=22?0:1)' >/dev/null 2>&1; then
  pet_node_version='22.22.0'
  pet_runtime="$pet_home/runtime/node-v$pet_node_version-$pet_os-$pet_arch"
  pet_node="$pet_runtime/bin/node"
  if [[ ! -x "$pet_node" ]]; then
    case "$pet_os-$pet_arch" in
      darwin-arm64) pet_node_hash=5ed4db0fcf1eaf84d91ad12462631d73bf4576c1377e192d222e48026a902640 ;;
      darwin-x64) pet_node_hash=5ea50c9d6dea3dfa3abb66b2656f7a4e1c8cef23432b558d45fb538c7b5dedce ;;
      linux-arm64) pet_node_hash=25ba95dfb96871fa2ef977f11f95ea90818c8fa15c0f2110771db08d4ba423be ;;
      linux-x64) pet_node_hash=c33c39ed9c80deddde77c960d00119918b9e352426fd604ba41638d6526a4744 ;;
    esac
    pet_runtime_archive="node-v$pet_node_version-$pet_os-$pet_arch.tar.gz"
    printf '%s\n' '正在准备独立运行环境（不会改动系统 Node）…'
    pet_download "https://nodejs.org/download/release/v$pet_node_version/$pet_runtime_archive" "$pet_tmp/$pet_runtime_archive"
    [[ "$(pet_sha "$pet_tmp/$pet_runtime_archive")" == "$pet_node_hash" ]] || { printf '%s\n' '运行环境校验失败，已停止。' >&2; exit 1; }
    tar -xzf "$pet_tmp/$pet_runtime_archive" -C "$pet_tmp"
    mkdir -p "$pet_home/runtime"
    mv "$pet_tmp/node-v$pet_node_version-$pet_os-$pet_arch" "$pet_runtime"
  fi
fi
pet_payload="$pet_tmp/pixel-agent-pets"
pet_version="$("$pet_node" -p 'require(process.argv[1]).version' "$pet_payload/package.json")"
[[ "$pet_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[A-Za-z0-9.-]+)?$ ]] || { printf '%s\n' '安装包版本无效。' >&2; exit 1; }
mkdir -p "$pet_home/versions"
pet_destination="$pet_home/versions/$pet_version"
if [[ "$pet_codex_only" == true ]]; then pet_destination="$pet_destination-codex"; fi
[[ ! -L "$pet_destination" ]] || { printf '%s\n' '版本目录是用户符号链接，未替换。' >&2; exit 1; }
export PATH="$(dirname "$pet_node"):$PATH"
printf '%s\n' '安装包校验通过，正在配置宠物…'
pet_previous=''
if [[ -e "$pet_destination" ]]; then
  # Preserve the currently linked payload while making updates idempotent.
  pet_previous="$pet_destination.previous.$(date +%s).$$"
  mv "$pet_destination" "$pet_previous"
fi
pet_restore() {
  [[ ! -L "$pet_destination" ]] || return 1
  rm -rf -- "$pet_destination" || return 1
  if [[ -n "$pet_previous" ]]; then mv "$pet_previous" "$pet_destination"; fi
}
pet_run() {
  if [[ -r /dev/tty ]] && ( : </dev/tty ) 2>/dev/null; then
    "$pet_node" "$pet_destination/install.cjs" "$@" </dev/tty
  else
    "$pet_node" "$pet_destination/install.cjs" "$@"
  fi
}
if mv "$pet_payload" "$pet_destination"; then
  if pet_run "$@"; then
    if [[ -n "$pet_previous" ]]; then rm -rf -- "$pet_previous"; fi
  else
    pet_status=$?
    pet_restore || printf '%s\n' '安装失败，原版本备份仍保留在本轮 previous 目录，请勿删除。' >&2
    exit "$pet_status"
  fi
else
  pet_status=$?
  pet_restore || printf '%s\n' '无法替换安装包，原版本备份仍保留在本轮 previous 目录。' >&2
  exit "$pet_status"
fi
