#!/usr/bin/env node
// Fast pre-commit proxy invoked as `agentsmyth check --staged` by the mandatory local git hook.
// Deliberately narrower than check-lifecycle.mjs's full chain-status validation: this only asks
// whether a real, non-stub task artifact even exists covering each staged, non-safe file — not
// whether that chain's Review/Ship gates would pass.
//
// Adapted to this repo's local lib.mjs (no `wf`/defsPath/dataPath exports — see check-lifecycle.mjs
// for the same repoRoot-relative `wf` pattern this file reuses).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { finish, listFiles, parseFrontmatter, readText, repoRoot } from './lib.mjs';

const errors = [];
const details = [];

const wf = existsSync(join(repoRoot, 'workflow')) ? 'workflow' : ['.', 'workflow'].join('');

const SAFE_PREFIXES = ['workflow/', 'docs/', '.cursor/', '.claude/', '.github/'];
const TRIVIAL_MAX_FILES = 1;
const TRIVIAL_MAX_LINES = 15;

function stagedFiles() {
  try {
    return execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM'], {
      cwd: repoRoot, encoding: 'utf8',
    }).split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function stagedLineCount(path) {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--numstat', '--', path], {
      cwd: repoRoot, encoding: 'utf8',
    }).trim();
    if (!out) return 0;
    const [added, removed] = out.split('\t');
    return (Number(added) || 0) + (Number(removed) || 0);
  } catch {
    return Infinity;
  }
}

function isSafe(path) {
  if (path.endsWith('.md')) return true;
  return SAFE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function namedSection(body, name) {
  const re = new RegExp(`## ${name}\\s*\\n([\\s\\S]*?)(?=\\n## |\\n---|\\s*$)`);
  const match = body.match(re);
  return match ? match[1] : null;
}

function changedFilePaths(section) {
  const paths = [];
  for (const m of section.matchAll(/^-\s*`([^`]+)`/gm)) paths.push(m[1]);
  return paths;
}

function isCovered(path, touches) {
  return touches.some((t) => {
    if (t === path) return true;
    if (t.endsWith('/') && path.startsWith(t)) return true;
    if (!t.endsWith('/') && t.endsWith('*') && path.startsWith(t.slice(0, -1))) return true;
    return false;
  });
}

function coveredPaths(artifactsDir) {
  const covered = [];
  const taskFiles = listFiles(`${artifactsDir}/tasks`).filter((f) => f.endsWith('.md') && !f.endsWith('/README.md'));
  for (const file of taskFiles) {
    const text = readText(file);
    let parsed;
    try {
      parsed = parseFrontmatter(text, file);
    } catch {
      continue;
    }
    if (parsed.frontmatter.status === 'draft') continue;
    if (parsed.frontmatter.orchestration?.status === 'blocked-for-user') continue;

    const changedSection = namedSection(parsed.body, 'Changed Files');
    if (!changedSection) continue;
    covered.push(...changedFilePaths(changedSection));
  }
  return covered;
}

const profileExists = listFiles(`${wf}/config`).some((f) => f.endsWith('repo-profile.yaml'));
if (!profileExists) {
  finish('check-commit-coverage', [], ['no workflow/config/repo-profile.yaml — repo not agentsmyth-initialized, nothing to gate']);
} else {
  const staged = stagedFiles();
  const gated = staged.filter((p) => !isSafe(p));

  if (gated.length === 0) {
    finish('check-commit-coverage', [], ['all staged files are safe (workflow/docs/config or Markdown) — nothing to gate']);
  } else if (gated.length <= TRIVIAL_MAX_FILES && stagedLineCount(gated[0]) <= TRIVIAL_MAX_LINES) {
    finish('check-commit-coverage', [], [`trivial-size escape: ${gated[0]} (<= ${TRIVIAL_MAX_LINES} changed lines)`]);
  } else {
    const touches = coveredPaths(`${wf}/artifacts`);
    for (const path of gated) {
      if (isCovered(path, touches)) {
        details.push(`${path} — covered by a task artifact's Changed Files`);
      } else {
        errors.push(
          `${path} — no task artifact's Changed Files covers this path. Add it to an existing ` +
          `task's scope, run the agentsmyth lifecycle to create one, or bypass intentionally ` +
          `with 'git commit --no-verify'.`
        );
      }
    }
    finish('check-commit-coverage', errors, details);
  }
}
