#!/bin/sh
# Builds locally (the file:../DC-design-system dependency rules out a CI build) and force-pushes
# web/dist as a single commit to the gh-pages branch. Set BASE=/ and CUSTOM_DOMAIN for a custom domain.
set -eu
cd "$(dirname "$0")/.."
[ -f web/public/keys.json ] || { echo "web/public/keys.json is missing: run npm run keys first" >&2; exit 1; }
npm run build
touch web/dist/.nojekyll
if [ -n "${CUSTOM_DOMAIN:-}" ]; then echo "$CUSTOM_DOMAIN" > web/dist/CNAME; fi
# Temporary worktree on an orphan branch, so this works before the first commit on main.
tmp=$(mktemp -d)
trap 'git worktree remove --force "$tmp" 2>/dev/null; git branch -D gh-pages-deploy >/dev/null 2>&1; rm -rf "$tmp"' EXIT
git worktree add --orphan -b gh-pages-deploy "$tmp" >/dev/null
cp -R web/dist/. "$tmp"
git -C "$tmp" add -A
git -C "$tmp" commit -qm "Deploy $(date -u +%Y-%m-%dT%H:%MZ)"
git -C "$tmp" push -f origin gh-pages-deploy:gh-pages
