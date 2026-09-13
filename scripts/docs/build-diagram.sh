#!/usr/bin/env bash
# Renders the architecture diagram the README carries into the SVG the landing loads.
#
# The sed is not cosmetic. Mermaid emits round line caps, and this brand has no rounding anywhere —
# zero radius, butt caps, mitre joins — so a diagram left as the renderer produced it fails the
# brand invariant in CI. Regenerating without this step reintroduces the finding.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

python3 - "$root/README.md" "$tmp/diagram.mmd" <<'PY'
import re, sys
source, target = sys.argv[1], sys.argv[2]
block = re.search(r'```mermaid\n(.*?)\n```', open(source).read(), re.S)
if block is None:
    raise SystemExit('no mermaid block in the README')
open(target, 'w').write(block.group(1))
PY

npx -y @mermaid-js/mermaid-cli@11 -i "$tmp/diagram.mmd" -o "$tmp/architecture.svg" -w 1400 -b transparent >/dev/null
sed -e 's/stroke-linecap:round/stroke-linecap:butt/g' \
    -e 's/stroke-linejoin:round/stroke-linejoin:miter/g' \
    -e 's/border-radius:[0-9.]*px/border-radius:0/g' \
    -e 's/rx="[0-9.]*"/rx="0"/g' -e 's/ry="[0-9.]*"/ry="0"/g' \
  "$tmp/architecture.svg" > "$root/site/public/architecture.svg"
echo "wrote site/public/architecture.svg from the README's own diagram"
