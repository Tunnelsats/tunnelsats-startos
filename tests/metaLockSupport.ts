/**
 * The real metadata lock for tests: the production `bridge.py meta-lock`
 * holder, run locally against a temporary DATA_DIR instead of in a StartOS
 * subcontainer (which is all metaLockFor adds).
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createMetaLock,
  metaLockProvider,
  type HolderScope,
  type MetaLock,
} from '../startos/metaLock'

export const BRIDGE = join(__dirname, '..', 'bridge.py')

export function localScope(dataDir: string): HolderScope {
  return (use) =>
    use(async () =>
      spawn('python3', [BRIDGE, 'meta-lock'], {
        env: { ...process.env, DATA_DIR: dataDir },
        stdio: 'pipe',
      }),
    )
}

/** True when bridge.py's lock file in dataDir can be taken right now. */
export function lockIsFree(dataDir: string): boolean {
  const program = [
    'import fcntl, os, sys',
    `fd = os.open(${JSON.stringify(join(dataDir, 'tunnelsats-meta.json.lock'))}, os.O_RDWR | os.O_CREAT, 0o600)`,
    'try:',
    '    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)',
    'except BlockingIOError:',
    '    sys.exit(1)',
  ].join('\n')
  return spawnSync('python3', ['-c', program]).status === 0
}

let sharedDir: string | null = null

/** The lock directory shared by testMetaLock (one per test process). */
export function testLockDir(): string {
  if (!sharedDir) {
    const dir = mkdtempSync(join(tmpdir(), 'meta-lock-shared-'))
    process.once('exit', () => rmSync(dir, { recursive: true, force: true }))
    sharedDir = dir
  }
  return sharedDir
}

/** A real MetaLock on the shared test lock directory. */
export const testMetaLock: MetaLock = <R>(job: () => Promise<R>) =>
  createMetaLock(localScope(testLockDir()))(job)

/**
 * Makes metaLockFor(effects) return testMetaLock, for tests that run an
 * action or its default ops outside StartOS.
 */
export function useTestMetaLock(): void {
  metaLockProvider.forEffects = () => testMetaLock
}
