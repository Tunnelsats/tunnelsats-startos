#!/usr/bin/env bash

set -euo pipefail

raw_tag=${1:-}
semver_tag_pattern='^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-((0|[1-9][0-9]*)|([0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))(\.((0|[1-9][0-9]*)|([0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'

if [[ ! "$raw_tag" =~ $semver_tag_pattern ]]; then
  echo "Unsupported release tag: $raw_tag" >&2
  exit 1
fi

tag_version=${BASH_REMATCH[1]}.${BASH_REMATCH[2]}.${BASH_REMATCH[3]}
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(cd -- "$script_dir/.." && pwd)

package_version=$(jq -er '.version | select(type == "string" and length > 0)' "$repo_root/package.json")
package_version=${package_version%%[-+]*}

startos_version=$(sed -nE "s/^[[:space:]]*version: '([^']+)',?$/\1/p" "$repo_root/startos/versions/current.ts")
if [ -z "$startos_version" ]; then
  echo "Could not read the canonical StartOS package version" >&2
  exit 1
fi
startos_version=${startos_version%%:*}

if [ "$package_version" != "$startos_version" ]; then
  echo "package.json version $package_version does not match StartOS version $startos_version" >&2
  exit 1
fi

if [ "$tag_version" != "$package_version" ]; then
  echo "Release tag version $tag_version does not match package version $package_version" >&2
  exit 1
fi
