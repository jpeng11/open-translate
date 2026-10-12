#!/usr/bin/env bash
set -euo pipefail
source_dir="${1:-dist/safari}"
project_dir="${2:-dist/safari-project}"
if [[ "$(uname -s)" != Darwin ]]; then
  echo 'Safari packaging requires macOS and full Xcode.' >&2
  exit 1
fi
if [[ -d /Applications/Xcode.app/Contents/Developer ]]; then
  export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
fi
xcrun safari-web-extension-converter "$source_dir" --project-location "$project_dir" --app-name 'Open Translate' --bundle-identifier io.opentranslate.browser --swift --no-open --no-prompt
