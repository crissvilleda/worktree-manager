'use strict';

// ---------------------------------------------------------------------------
// Mock strategy
//
// git.js does: const { execSync } = require('child_process')
// That destructuring captures execSync's value at load time, so patching
// childProcess.execSync later has no effect on git.js.
//
// Instead we patch the exports object of git.js directly. worktree.js does:
//   const { git } = require('./git')
// which binds `git` to exports.git at load time — also a closure over the
// value. So we can't patch exports.git either after worktree.js has loaded.
//
// The solution: patch exports.git BEFORE requiring worktree.js, then keep
// the same exports object alive. Our stub delegates to `currentGitFn` so
// individual tests can swap implementations without re-requiring.
// ---------------------------------------------------------------------------

// Clear cache so we control the load order
delete require.cache[require.resolve('../src/git')];
delete require.cache[require.resolve('../src/worktree')];

// Load git.js and replace its export with a permanent delegate stub
const gitModule = require('../src/git');
let currentGitFn = () => { throw new Error('git not configured in this test'); };
gitModule.git = (...args) => currentGitFn(...args);

// Now load worktree.js — its `const { git } = require('./git')` captures
// our stub, which delegates to currentGitFn
const worktree = require('../src/worktree');

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSequence(responses) {
  let i = 0;
  return () => {
    const val = responses[i++];
    if (val instanceof Error) throw val;
    return val ?? '';
  };
}

function porcelainBlock({ path, head = 'abc1234abc1234abc1234abc1234abc1234abc1234', branch, detached, bare } = {}) {
  const lines = [`worktree ${path}`, `HEAD ${head}`];
  if (detached) lines.push('detached');
  else if (bare) lines.push('bare');
  else if (branch) lines.push(`branch ${branch}`);
  return lines.join('\n');
}

function twoWorktrees() {
  return [
    porcelainBlock({ path: '/repos/main', branch: 'refs/heads/main' }),
    porcelainBlock({ path: '/repos/feat', branch: 'refs/heads/feature/foo' }),
  ].join('\n\n') + '\n\n';
}

// ---------------------------------------------------------------------------
// Console/stdout capture
// ---------------------------------------------------------------------------
let consoleLogs, consoleErrors, consoleWarns, stdoutWrites;

function captureConsole() {
  consoleLogs = [];
  consoleErrors = [];
  consoleWarns = [];
  stdoutWrites = [];
  mock.method(console, 'log', (...args) => consoleLogs.push(args.join(' ')));
  mock.method(console, 'error', (...args) => consoleErrors.push(args.join(' ')));
  mock.method(console, 'warn', (...args) => consoleWarns.push(args.join(' ')));
  mock.method(process.stdout, 'write', (s) => { stdoutWrites.push(s); return true; });
}

// ---------------------------------------------------------------------------
// add()
// ---------------------------------------------------------------------------
describe('add()', () => {
  beforeEach(captureConsole);
  afterEach(() => mock.restoreAll());

  it('throws when not inside a git repository', () => {
    currentGitFn = () => { throw new Error('fatal: not a git repository'); };
    assert.throws(() => worktree.add('main'), { message: 'Not inside a git repository.' });
  });

  it('throws when repository has no commits yet', () => {
    currentGitFn = makeSequence([
      '/repos/myrepo',
      new Error('fatal: ambiguous argument'),
    ]);
    assert.throws(() => worktree.add('main'), { message: /Repository has no commits yet/ });
  });

  it('creates worktree with -b for a new (non-existent) branch', () => {
    const calls = [];
    currentGitFn = (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('unknown revision');
      return '/repos/myrepo';
    };
    worktree.add('feature/new-feat');
    const addCall = calls.find(c => c[0] === 'worktree' && c[1] === 'add');
    assert.ok(addCall, 'worktree add was called');
    assert.ok(addCall.includes('-b'), 'expected -b flag');
    assert.ok(addCall.includes('feature/new-feat'), 'expected branch name');
  });

  it('creates worktree without -b when the branch already exists', () => {
    const calls = [];
    currentGitFn = (args) => { calls.push(args); return '/repos/myrepo'; };
    worktree.add('main');
    const addCall = calls.find(c => c[0] === 'worktree' && c[1] === 'add');
    assert.ok(addCall, 'worktree add was called');
    assert.ok(!addCall.includes('-b'), 'expected no -b flag');
  });

  it('derives directory from the last branch segment when no dir is given', () => {
    const calls = [];
    currentGitFn = (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('unknown');
      return '/repos/myrepo';
    };
    worktree.add('feature/my-feat');
    const addCall = calls.find(c => c[0] === 'worktree' && c[1] === 'add');
    const pathArg = addCall.find(a => a !== 'worktree' && a !== 'add' && a !== '-b' && a !== 'feature/my-feat');
    assert.ok(pathArg?.endsWith('my-feat'), `expected path ending with my-feat, got: ${pathArg}`);
  });

  it('uses the explicit directory when one is provided', () => {
    const calls = [];
    currentGitFn = (args) => {
      calls.push(args);
      if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('unknown');
      return '/repos/myrepo';
    };
    worktree.add('feature/foo', '/tmp/custom');
    const addCall = calls.find(c => c[0] === 'worktree' && c[1] === 'add');
    assert.ok(addCall.includes('/tmp/custom'), 'expected /tmp/custom in args');
  });

  it('logs a success message with the target path and branch name', () => {
    currentGitFn = (args) => {
      if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('unknown');
      return '/repos/myrepo';
    };
    worktree.add('feature/foo');
    assert.equal(consoleLogs.length, 1);
    assert.match(consoleLogs[0], /Worktree created at/);
    assert.match(consoleLogs[0], /feature\/foo/);
  });
});

// ---------------------------------------------------------------------------
// list()
// ---------------------------------------------------------------------------
describe('list()', () => {
  beforeEach(captureConsole);
  afterEach(() => mock.restoreAll());

  it('throws when not inside a git repository', () => {
    currentGitFn = () => { throw new Error('fatal: not a git repository'); };
    assert.throws(() => worktree.list(), { message: 'Not inside a git repository.' });
  });

  it('logs "No worktrees found." when the output is empty', () => {
    currentGitFn = () => '';
    worktree.list();
    assert.equal(consoleLogs[0], 'No worktrees found.');
  });

  it('prints exactly one line per worktree', () => {
    currentGitFn = () => twoWorktrees();
    worktree.list();
    assert.equal(consoleLogs.length, 2);
  });

  it('marks only the first worktree with [main]', () => {
    currentGitFn = () => twoWorktrees();
    worktree.list();
    assert.match(consoleLogs[0], /\[main\]/);
    assert.doesNotMatch(consoleLogs[1], /\[main\]/);
  });

  it('prefixes each row with a 1-based index', () => {
    currentGitFn = () => twoWorktrees();
    worktree.list();
    assert.match(consoleLogs[0], /^\s*1\s/);
    assert.match(consoleLogs[1], /^\s*2\s/);
  });

  it('shows the short branch name inside brackets', () => {
    currentGitFn = () => twoWorktrees();
    worktree.list();
    assert.match(consoleLogs[0], /\[main\]/);
    assert.match(consoleLogs[1], /\[feature\/foo\]/);
  });

  it('shows "detached HEAD at <7-char hash>" for a detached worktree', () => {
    const block = porcelainBlock({
      path: '/repos/detached',
      head: 'deadbeef1234567deadbeef1234567deadbeef12',
      detached: true,
    });
    currentGitFn = () => block + '\n\n';
    worktree.list();
    assert.match(consoleLogs[0], /detached HEAD at deadbee/);
  });

  it('shows "detached HEAD at none" when HEAD is the null OID (all zeros)', () => {
    const block = porcelainBlock({
      path: '/repos/detached',
      head: '0'.repeat(40),
      detached: true,
    });
    currentGitFn = () => block + '\n\n';
    worktree.list();
    assert.match(consoleLogs[0], /detached HEAD at none/);
  });

  it('shows "bare" for a bare worktree', () => {
    const block = porcelainBlock({ path: '/repos/bare.git', bare: true });
    currentGitFn = () => block + '\n\n';
    worktree.list();
    assert.match(consoleLogs[0], /\[bare\]/);
  });

  it('shows "unknown" when no branch and not detached or bare', () => {
    const block = ['worktree /repos/weird', 'HEAD abc1234'].join('\n');
    currentGitFn = () => block + '\n\n';
    worktree.list();
    assert.match(consoleLogs[0], /\[unknown\]/);
  });

  it('pads the shorter path to align columns with the longest', () => {
    const blocks = [
      porcelainBlock({ path: '/short', branch: 'refs/heads/a' }),
      porcelainBlock({ path: '/a/longer/path', branch: 'refs/heads/b' }),
    ].join('\n\n') + '\n\n';
    currentGitFn = () => blocks;
    worktree.list();
    // Lines: " 1  <path padded to 14>  [a] [main]"
    //         ^^^^= 4 chars
    const longestLen = '/a/longer/path'.length;
    const pathSlice = consoleLogs[0].slice(4, 4 + longestLen);
    assert.equal(pathSlice.trimEnd(), '/short');
    assert.equal(pathSlice.length, longestLen);
  });

  it('handles a worktree block with no HEAD field without throwing', () => {
    const block = ['worktree /repos/nhead', 'branch refs/heads/main'].join('\n');
    currentGitFn = () => block + '\n\n';
    worktree.list();
    assert.equal(consoleLogs.length, 1);
  });
});

// ---------------------------------------------------------------------------
// remove()
// ---------------------------------------------------------------------------
describe('remove()', () => {
  beforeEach(captureConsole);
  afterEach(() => mock.restoreAll());

  it('throws when not inside a git repository', () => {
    currentGitFn = () => { throw new Error('fatal: not a git repository'); };
    assert.throws(() => worktree.remove('feat'), { message: 'Not inside a git repository.' });
  });

  it('throws when the worktree list is empty', () => {
    currentGitFn = () => '';
    assert.throws(() => worktree.remove('feat'), { message: 'No worktrees found.' });
  });

  it('throws when identifier does not match any non-main worktree', () => {
    currentGitFn = () => twoWorktrees();
    assert.throws(() => worktree.remove('nonexistent'), {
      message: "No worktree found matching 'nonexistent'.",
    });
  });

  it('reports uncommitted changes and throws without --force', () => {
    currentGitFn = makeSequence([
      twoWorktrees(),
      ' M dirty-file.js\n',
    ]);
    assert.throws(() => worktree.remove('feature/foo'), {
      message: 'Use --force to remove anyway.',
    });
    assert.ok(consoleErrors.some(e => e.includes('dirty-file.js')));
  });

  it('prints each changed file on its own line when dirty', () => {
    currentGitFn = makeSequence([
      twoWorktrees(),
      ' M file-a.js\n M file-b.js\n',
    ]);
    assert.throws(() => worktree.remove('feature/foo'));
    assert.ok(consoleErrors.some(e => e.includes('file-a.js')));
    assert.ok(consoleErrors.some(e => e.includes('file-b.js')));
  });

  it('removes a clean worktree and deletes the branch with -d', () => {
    const calls = [];
    currentGitFn = (args) => {
      calls.push(args);
      if (args[0] === 'status' && args[1] === '--porcelain') return '';
      return twoWorktrees();
    };
    worktree.remove('feature/foo');
    assert.ok(calls.some(c => c[0] === 'worktree' && c[1] === 'remove'));
    assert.ok(calls.some(c => c[0] === 'branch' && c[1] === '-d'));
    assert.match(consoleLogs[0], /Removed worktree/);
    assert.match(consoleLogs[0], /feature\/foo/);
  });

  it('includes the removed path in the success message', () => {
    currentGitFn = (args) => {
      if (args[0] === 'status' && args[1] === '--porcelain') return '';
      return twoWorktrees();
    };
    worktree.remove('feature/foo');
    assert.match(consoleLogs[0], /\/repos\/feat/);
  });

  it('skips status check and uses branch -D with --force', () => {
    const calls = [];
    currentGitFn = (args) => { calls.push(args); return twoWorktrees(); };
    worktree.remove('feature/foo', { force: true });
    assert.ok(calls.some(c => c[0] === 'worktree' && c[1] === 'remove' && c.includes('--force')));
    assert.ok(calls.some(c => c[0] === 'branch' && c[1] === '-D'));
    assert.ok(!calls.some(c => c[0] === 'status' && c[1] === '--porcelain'));
  });

  it('throws a helpful message when status check fails (directory gone)', () => {
    currentGitFn = makeSequence([
      twoWorktrees(),
      new Error('fatal: not a git repo'),
    ]);
    assert.throws(() => worktree.remove('feature/foo'), {
      message: /Could not check worktree status/,
    });
  });

  it('warns but does not throw when branch was already deleted', () => {
    currentGitFn = (args) => {
      if (args[0] === 'status' && args[1] === '--porcelain') return '';
      if (args[0] === 'branch' && args[1] === '-d') {
        const err = new Error('error: branch not found');
        err.stderr = 'error: branch not found';
        throw err;
      }
      return twoWorktrees();
    };
    worktree.remove('feature/foo'); // must not throw
    assert.ok(consoleWarns.some(w => w.includes('already deleted')));
  });

  it('rethrows unexpected errors from branch deletion', () => {
    currentGitFn = (args) => {
      if (args[0] === 'status' && args[1] === '--porcelain') return '';
      if (args[0] === 'branch' && args[1] === '-d') throw new Error('permission denied');
      return twoWorktrees();
    };
    assert.throws(() => worktree.remove('feature/foo'), { message: 'permission denied' });
  });

  it('skips branch deletion for a detached HEAD worktree', () => {
    const blocks = [
      porcelainBlock({ path: '/repos/main', branch: 'refs/heads/main' }),
      porcelainBlock({ path: '/repos/detached', head: 'deadbeef'.padEnd(40, '0'), detached: true }),
    ].join('\n\n') + '\n\n';

    const calls = [];
    currentGitFn = (args) => {
      calls.push(args);
      if (args[0] === 'status' && args[1] === '--porcelain') return '';
      return blocks;
    };
    worktree.remove('detached');
    assert.ok(!calls.some(c => c[0] === 'branch'));
    assert.doesNotMatch(consoleLogs[0], /deleted branch/);
  });
});

// ---------------------------------------------------------------------------
// goPath()
// ---------------------------------------------------------------------------
describe('goPath()', () => {
  beforeEach(captureConsole);
  afterEach(() => mock.restoreAll());

  it('throws when not inside a git repository', () => {
    currentGitFn = () => { throw new Error('fatal: not a git repository'); };
    assert.throws(() => worktree.goPath('1'), { message: 'Not inside a git repository.' });
  });

  it('resolves to first worktree by numeric index 1', () => {
    currentGitFn = () => twoWorktrees();
    worktree.goPath('1');
    assert.equal(stdoutWrites[0], '/repos/main');
  });

  it('resolves to second worktree by numeric index 2', () => {
    currentGitFn = () => twoWorktrees();
    worktree.goPath('2');
    assert.equal(stdoutWrites[0], '/repos/feat');
  });

  it('throws for a numeric index out of range', () => {
    currentGitFn = () => twoWorktrees();
    assert.throws(() => worktree.goPath('99'), {
      message: "No worktree found matching '99'.",
    });
  });

  it('throws for numeric index 0 (worktrees are 1-based)', () => {
    currentGitFn = () => twoWorktrees();
    assert.throws(() => worktree.goPath('0'), {
      message: "No worktree found matching '0'.",
    });
  });

  it('resolves by full namespaced branch name', () => {
    currentGitFn = () => twoWorktrees();
    worktree.goPath('feature/foo');
    assert.equal(stdoutWrites[0], '/repos/feat');
  });

  it('resolves by short branch name (basename match)', () => {
    currentGitFn = () => twoWorktrees();
    worktree.goPath('feat');
    assert.equal(stdoutWrites[0], '/repos/feat');
  });

  it('resolves by exact path string', () => {
    currentGitFn = () => twoWorktrees();
    worktree.goPath('/repos/main');
    assert.equal(stdoutWrites[0], '/repos/main');
  });

  it('throws for an unrecognized string identifier', () => {
    currentGitFn = () => twoWorktrees();
    assert.throws(() => worktree.goPath('nope'), {
      message: "No worktree found matching 'nope'.",
    });
  });

  it('writes the path without a trailing newline', () => {
    currentGitFn = () => twoWorktrees();
    worktree.goPath('1');
    assert.doesNotMatch(stdoutWrites[0], /\n$/);
  });

  it('truncates float strings via parseInt (e.g. "1.9" → index 1)', () => {
    currentGitFn = () => twoWorktrees();
    worktree.goPath('1.9');
    assert.equal(stdoutWrites[0], '/repos/main');
  });
});
