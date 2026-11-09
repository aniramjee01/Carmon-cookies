#!/bin/bash
# Starts a local preview of the static storefront. This does not run Square or shared inventory.
cd "$(dirname "$0")" || exit 1
printf '\nCarmen Cookie Jar local preview: http://localhost:5500\n'
printf 'Press Control+C to stop.\n\n'
if command -v python3 >/dev/null 2>&1; then
  (sleep 2; open http://localhost:5500) &
  python3 -m http.server 5500 --directory site
else
  echo 'Python 3 is not installed. In VS Code, use the Live Server extension on site/index.html or open site/index.html directly.'
  exit 1
fi
