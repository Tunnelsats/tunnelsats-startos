const fs = require('fs')
const path = require('path')

const repoRoot = path.resolve(__dirname, '..')
const currentTsPath = path.join(repoRoot, 'startos', 'versions', 'current.ts')
const versionJsonPath = path.join(repoRoot, 'version.json')

try {
  const content = fs.readFileSync(currentTsPath, 'utf8')
  const match = content.match(/version:\s*['"]([^'"]+)['"]/)
  if (!match) {
    throw new Error('Could not find version in startos/versions/current.ts')
  }
  const fullVersion = match[1]
  const semver = fullVersion.split(':')[0]
  const data = {
    version: fullVersion,
    semver: semver,
  }
  fs.writeFileSync(versionJsonPath, JSON.stringify(data, null, 2) + '\n')
  console.log(`Synced version.json -> ${fullVersion} (${semver})`)
} catch (err) {
  console.error(`Failed to sync version.json: ${err.message}`)
  process.exit(1)
}
