import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

test('Dependabot Configuration - startos-packages grouping', () => {
  const dependabotPath = path.join(process.cwd(), '.github', 'dependabot.yml');
  assert.ok(fs.existsSync(dependabotPath), 'dependabot.yml must exist');
  
  const content = fs.readFileSync(dependabotPath, 'utf8');
  assert.match(content, /package-ecosystem:\s*"npm"/, 'Must contain npm package-ecosystem');
  assert.match(content, /startos-packages:/, 'Must contain startos-packages grouping');
  assert.match(content, /cln-startos/, 'Must include cln-startos in startos-packages group');
  assert.match(content, /lnd-startos/, 'Must include lnd-startos in startos-packages group');
});

test('Dependabot Auto-Merge Workflow - condition and security boundaries', () => {
  const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'dependabot-auto-merge.yml');
  assert.ok(fs.existsSync(workflowPath), 'dependabot-auto-merge.yml must exist');

  const content = fs.readFileSync(workflowPath, 'utf8');
  assert.match(content, /pull_request_target:/, 'Must use pull_request_target');
  assert.match(content, /github\.actor == 'dependabot\[bot\]'/, 'Must restrict to dependabot[bot]');
  assert.match(content, /contents:\s*write/, 'Must grant contents write permission');
  assert.match(content, /pull-requests:\s*write/, 'Must grant pull-requests write permission');

  // Verify auto-merge condition includes semver updates, StartOS git companion packages, and GitHub Actions (non-major)
  assert.match(content, /version-update:semver-minor/, 'Must support minor updates');
  assert.match(content, /version-update:semver-patch/, 'Must support patch updates');
  assert.match(content, /contains\(steps\.metadata\.outputs\.dependency-names,\s*'cln-startos'\)/, 'Must support cln-startos git dependency auto-merge');
  assert.match(content, /contains\(steps\.metadata\.outputs\.dependency-names,\s*'lnd-startos'\)/, 'Must support lnd-startos git dependency auto-merge');
  assert.match(content, /steps\.metadata\.outputs\.package-ecosystem == 'github_actions'/, 'Must support github_actions ecosystem auto-merge');
  assert.match(content, /steps\.metadata\.outputs\.update-type != 'version-update:semver-major'/, 'Must exclude major github_actions updates');
  assert.match(content, /gh pr merge "\$PR_NUMBER" --auto --squash/, 'Must enable auto-merge with squash');

  // Verify both approval and merge steps use identical eligibility guards
  const approveMatch = content.match(/- name: Auto-approve eligible Dependabot updates\s+if:\s*\|([\s\S]*?)run:/);
  const mergeMatch = content.match(/- name: Enable native auto-merge for eligible Dependabot updates\s+if:\s*\|([\s\S]*?)run:/);
  assert.ok(approveMatch, 'Auto-approve step must exist with multiline condition');
  assert.ok(mergeMatch, 'Enable auto-merge step must exist with multiline condition');
  assert.strictEqual(
    approveMatch[1].trim().replace(/\s+/g, ' '),
    mergeMatch[1].trim().replace(/\s+/g, ' '),
    'Approval and merge step conditions must be identical to avoid divergence'
  );
});
