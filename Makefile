ARCHES := x86_64 aarch64

# Ensure version.json is synchronized from startos/versions/current.ts
version.json: startos/versions/current.ts scripts/sync-version.js
	node scripts/sync-version.js

# overrides to s9pk.mk must precede the include statement
include node_modules/@start9labs/start-sdk/s9pk.mk

ingredients: version.json
