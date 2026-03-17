'use strict';

const { describe, it, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  branchToDirectory,
  resolveDirectory,
  parseWorktreePorcelain,
  shortBranch,
  resolveWorktree,
} = require('../src/utils');

// ---------------------------------------------------------------------------
// branchToDirectory
// ---------------------------------------------------------------------------
describe('branchToDirectory()', () => {
  it('uses the branch name as directory for a simple branch', () => {
    const result = branchToDirectory('main', '/home/user/repos/myrepo');
    assert.equal(result, path.resolve('/home/user/repos/myrepo', '..', 'main'));
  });

  it('uses the last segment for a namespaced branch', () => {
    const result = branchToDirectory('feature/my-feature', '/home/user/repos/myrepo');
    assert.equal(result, path.resolve('/home/user/repos/myrepo', '..', 'my-feature'));
  });

  it('uses the last segment for a deeply namespaced branch', () => {
    const result = branchToDirectory('a/b/c/bar', '/home/user/repos/myrepo');
    assert.equal(result, path.resolve('/home/user/repos/myrepo', '..', 'bar'));
  });

  it('places the directory one level above the repo root', () => {
    const result = branchToDirectory('feat', '/home/user/repos/myrepo');
    assert.match(result, /\/home\/user\/repos\/feat$/);
  });
});

// ---------------------------------------------------------------------------
// resolveDirectory
// ---------------------------------------------------------------------------
describe('resolveDirectory()', () => {
  afterEach(() => mock.restoreAll());

  it('resolves a relative path against cwd', () => {
    mock.method(process, 'cwd', () => '/home/user');
    const result = resolveDirectory('foo');
    assert.equal(result, '/home/user/foo');
  });

  it('returns an absolute path unchanged', () => {
    const result = resolveDirectory('/tmp/bar');
    assert.equal(result, '/tmp/bar');
  });
});

// ---------------------------------------------------------------------------
// parseWorktreePorcelain
// ---------------------------------------------------------------------------
describe('parseWorktreePorcelain()', () => {
  it('parses a single normal worktree block', () => {
    const output = [
      'worktree /home/user/repo',
      'HEAD abc1234',
      'branch refs/heads/main',
    ].join('\n');
    const result = parseWorktreePorcelain(output);
    assert.equal(result.length, 1);
    assert.equal(result[0].path, '/home/user/repo');
    assert.equal(result[0].head, 'abc1234');
    assert.equal(result[0].branch, 'refs/heads/main');
  });

  it('parses a detached HEAD worktree', () => {
    const output = [
      'worktree /home/user/detached',
      'HEAD deadbeef',
      'detached',
    ].join('\n');
    const result = parseWorktreePorcelain(output);
    assert.equal(result[0].detached, true);
    assert.equal(result[0].branch, undefined);
  });

  it('parses a bare worktree', () => {
    const output = [
      'worktree /home/user/bare.git',
      'HEAD abc1234',
      'bare',
    ].join('\n');
    const result = parseWorktreePorcelain(output);
    assert.equal(result[0].bare, true);
  });

  it('parses multiple worktrees separated by blank lines', () => {
    const output = [
      'worktree /home/user/main',
      'HEAD aaa1111',
      'branch refs/heads/main',
      '',
      'worktree /home/user/feat',
      'HEAD bbb2222',
      'branch refs/heads/feature/foo',
    ].join('\n');
    const result = parseWorktreePorcelain(output);
    assert.equal(result.length, 2);
    assert.equal(result[0].path, '/home/user/main');
    assert.equal(result[1].path, '/home/user/feat');
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(parseWorktreePorcelain(''), []);
  });

  it('returns empty array for only blank lines', () => {
    assert.deepEqual(parseWorktreePorcelain('\n\n'), []);
  });

  it('ignores unknown lines', () => {
    const output = [
      'worktree /home/user/repo',
      'HEAD abc1234',
      'branch refs/heads/main',
      'locked reason goes here',
    ].join('\n');
    const result = parseWorktreePorcelain(output);
    assert.equal(result[0].path, '/home/user/repo');
    assert.equal(result[0].branch, 'refs/heads/main');
  });

  it('parses a null OID HEAD (all zeros) as a string', () => {
    const nullOid = '0'.repeat(40);
    const output = [
      'worktree /home/user/repo',
      `HEAD ${nullOid}`,
      'branch refs/heads/main',
    ].join('\n');
    const result = parseWorktreePorcelain(output);
    assert.equal(result[0].head, nullOid);
  });
});

// ---------------------------------------------------------------------------
// shortBranch
// ---------------------------------------------------------------------------
describe('shortBranch()', () => {
  it('strips refs/heads/ prefix', () => {
    assert.equal(shortBranch('refs/heads/main'), 'main');
  });

  it('strips refs/heads/ prefix from nested branch', () => {
    assert.equal(shortBranch('refs/heads/feature/foo'), 'feature/foo');
  });

  it('returns the input unchanged when no prefix present', () => {
    assert.equal(shortBranch('main'), 'main');
  });

  it('returns null for null input', () => {
    assert.equal(shortBranch(null), null);
  });

  it('returns null for undefined input', () => {
    assert.equal(shortBranch(undefined), null);
  });

  it('returns null for empty string (falsy, treated same as null/undefined)', () => {
    assert.equal(shortBranch(''), null);
  });
});

// ---------------------------------------------------------------------------
// resolveWorktree
// ---------------------------------------------------------------------------
describe('resolveWorktree()', () => {
  const worktrees = [
    { path: '/home/user/repos/main', branch: 'refs/heads/main' },
    { path: '/home/user/repos/feat', branch: 'refs/heads/feature/foo' },
    { path: '/home/user/repos/bar', branch: undefined },
  ];

  it('matches by exact path string', () => {
    const result = resolveWorktree(worktrees, '/home/user/repos/feat');
    assert.equal(result, worktrees[1]);
  });

  it('matches by short branch name', () => {
    const result = resolveWorktree(worktrees, 'main');
    assert.equal(result, worktrees[0]);
  });

  it('matches by full namespaced branch name', () => {
    const result = resolveWorktree(worktrees, 'feature/foo');
    assert.equal(result, worktrees[1]);
  });

  it('matches by basename of path', () => {
    const result = resolveWorktree(worktrees, 'bar');
    assert.equal(result, worktrees[2]);
  });

  it('returns undefined when no match', () => {
    const result = resolveWorktree(worktrees, 'nonexistent');
    assert.equal(result, undefined);
  });

  it('returns first match when multiple candidates could match', () => {
    const dupes = [
      { path: '/a/foo', branch: 'refs/heads/foo' },
      { path: '/b/foo', branch: 'refs/heads/foo' },
    ];
    const result = resolveWorktree(dupes, 'foo');
    assert.equal(result, dupes[0]);
  });

  it('returns undefined for empty worktree list', () => {
    const result = resolveWorktree([], 'main');
    assert.equal(result, undefined);
  });
});
