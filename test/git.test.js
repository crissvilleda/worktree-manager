'use strict';

// ---------------------------------------------------------------------------
// git.js does: const { execSync } = require('child_process')
// That destructuring captures the value at require time. Patching
// childProcess.execSync afterwards has no effect on the already-loaded module.
//
// Solution: clear the require cache so we can load a fresh git.js instance
// with a pre-patched child_process module.
//
// We achieve this by replacing child_process.execSync on the module object
// BEFORE each test's require(), then clearing and re-requiring git.js inside
// each test so it sees the current mock.
// ---------------------------------------------------------------------------

const { describe, it, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const childProcess = require('child_process');

function freshGit(execFileImpl) {
  // Patch the property on the shared module object
  const original = childProcess.execFileSync;
  childProcess.execFileSync = execFileImpl;
  // Force git.js to re-execute so its { execFileSync } destructure picks up our impl
  delete require.cache[require.resolve('../src/git')];
  const { git } = require('../src/git');
  // Restore immediately — the re-required git.js already captured our impl
  childProcess.execFileSync = original;
  return git;
}

afterEach(() => mock.restoreAll());

describe('git()', () => {
  it('returns trimmed stdout on success', () => {
    const git = freshGit(() => '  hello world\n  ');
    assert.equal(git(['status']), 'hello world');
  });

  it('returns empty string for empty output', () => {
    const git = freshGit(() => '');
    assert.equal(git(['status']), '');
  });

  it('passes correct file and args array', () => {
    let capturedFile, capturedArgs;
    const git = freshGit((file, args) => { capturedFile = file; capturedArgs = args; return ''; });
    git(['rev-parse', 'HEAD']);
    assert.equal(capturedFile, 'git');
    assert.deepEqual(capturedArgs, ['rev-parse', 'HEAD']);
  });

  it('uses process.cwd() as the default cwd option', () => {
    let capturedOpts;
    const git = freshGit((_file, _args, opts) => { capturedOpts = opts; return ''; });
    git(['status']);
    assert.equal(capturedOpts.cwd, process.cwd());
  });

  it('uses options.cwd when provided', () => {
    let capturedOpts;
    const git = freshGit((_file, _args, opts) => { capturedOpts = opts; return ''; });
    git(['status'], { cwd: '/tmp/custom' });
    assert.equal(capturedOpts.cwd, '/tmp/custom');
  });

  it('passes stdio: pipe and encoding: utf8', () => {
    let capturedOpts;
    const git = freshGit((_file, _args, opts) => { capturedOpts = opts; return ''; });
    git(['status']);
    assert.deepEqual(capturedOpts.stdio, ['pipe', 'pipe', 'pipe']);
    assert.equal(capturedOpts.encoding, 'utf8');
  });

  it('throws with trimmed err.stderr when execFileSync throws and stderr is set', () => {
    const git = freshGit(() => {
      const err = new Error('exit 1');
      err.stderr = '  fatal: not a git repo\n  ';
      throw err;
    });
    assert.throws(() => git(['status']), { message: 'fatal: not a git repo' });
  });

  it('throws with err.message when execFileSync throws and stderr is empty', () => {
    const git = freshGit(() => {
      const err = new Error('spawn error');
      err.stderr = '';
      throw err;
    });
    assert.throws(() => git(['status']), { message: 'spawn error' });
  });

  it('throws with err.message when execFileSync throws and stderr is null', () => {
    const git = freshGit(() => {
      const err = new Error('fallback message');
      err.stderr = null;
      throw err;
    });
    assert.throws(() => git(['status']), { message: 'fallback message' });
  });

  it('throws with err.message when execFileSync throws and stderr is undefined', () => {
    const git = freshGit(() => {
      throw new Error('raw error');
    });
    assert.throws(() => git(['status']), { message: 'raw error' });
  });
});
