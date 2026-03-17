'use strict';

const path = require('path');
const { git } = require('./git');
const {
  branchToDirectory,
  resolveDirectory,
  parseWorktreePorcelain,
  shortBranch,
  resolveWorktree,
} = require('./utils');

function add(branchName, directory) {
  let repoRoot;
  try {
    repoRoot = git(['rev-parse', '--show-toplevel']);
  } catch {
    throw new Error('Not inside a git repository.');
  }

  try {
    git(['rev-parse', 'HEAD']);
  } catch {
    throw new Error(
      'Repository has no commits yet. Make an initial commit before adding worktrees.'
    );
  }

  let targetDir;
  if (directory) {
    targetDir = resolveDirectory(directory);
  } else {
    targetDir = branchToDirectory(branchName, repoRoot);
  }

  let branchExists = false;
  try {
    git(['rev-parse', '--verify', branchName]);
    branchExists = true;
  } catch {
    branchExists = false;
  }

  if (branchExists) {
    git(['worktree', 'add', targetDir, branchName]);
  } else {
    git(['worktree', 'add', '-b', branchName, targetDir]);
  }

  console.log(`Worktree created at ${targetDir} on branch ${branchName}`);
}

function list() {
  let output;
  try {
    output = git(['worktree', 'list', '--porcelain']);
  } catch {
    throw new Error('Not inside a git repository.');
  }

  const worktrees = parseWorktreePorcelain(output);

  if (worktrees.length === 0) {
    console.log('No worktrees found.');
    return;
  }

  const maxPathLen = Math.max(...worktrees.map(wt => wt.path.length));

  worktrees.forEach((wt, i) => {
    const isMain = i === 0;
    const isNullHead = !wt.head || /^0+$/.test(wt.head);
    const branchLabel = wt.detached
      ? `detached HEAD at ${!isNullHead ? wt.head.slice(0, 7) : 'none'}`
      : wt.bare
      ? 'bare'
      : shortBranch(wt.branch) || 'unknown';
    const mainTag = isMain ? ' [main]' : '';
    const paddedPath = wt.path.padEnd(maxPathLen);
    const index = String(i + 1).padStart(2);

    console.log(`${index}  ${paddedPath}  [${branchLabel}]${mainTag}`);
  });
}

function remove(identifier, opts = {}) {
  let output;
  try {
    output = git(['worktree', 'list', '--porcelain']);
  } catch {
    throw new Error('Not inside a git repository.');
  }

  const worktrees = parseWorktreePorcelain(output);

  if (worktrees.length === 0) {
    throw new Error('No worktrees found.');
  }

  const mainWorktree = worktrees[0];

  let target;
  if (opts.numeric) {
    const index = parseInt(identifier, 10);
    if (isNaN(index)) {
      throw new Error(`'${identifier}' is not a valid number.`);
    }
    target = worktrees.slice(1)[index - 1];
  } else {
    target = resolveWorktree(worktrees.slice(1), identifier);
  }

  if (!target) {
    throw new Error(`No worktree found matching '${identifier}'.`);
  }

  if (target.path === mainWorktree.path) {
    throw new Error('Cannot remove the main worktree.');
  }

  if (!opts.force) {
    let statusOutput;
    try {
      statusOutput = git(['status', '--porcelain'], { cwd: target.path });
    } catch {
      throw new Error(
        `Could not check worktree status at ${target.path}. ` +
        'The directory may no longer exist. Try running: git worktree prune'
      );
    }
    if (statusOutput.trim().length > 0) {
      console.error('Worktree has uncommitted changes:');
      statusOutput.trim().split('\n').forEach(line => console.error(' ', line));
      throw new Error('Use --force to remove anyway.');
    }
  }

  git(['worktree', 'remove', ...(opts.force ? ['--force'] : []), target.path]);

  const branch = shortBranch(target.branch);
  if (branch) {
    const deleteFlag = opts.force ? '-D' : '-d';
    try {
      git(['branch', deleteFlag, branch]);
    } catch (err) {
      if (err.message.includes('not found')) {
        console.warn(`Warning: branch '${branch}' was already deleted.`);
      } else {
        throw err;
      }
    }
  }

  console.log(`Removed worktree at ${target.path}${branch ? ` and deleted branch ${branch}` : ''}.`);
}

function goPath(identifier, opts = {}) {
  let output;
  try {
    output = git(['worktree', 'list', '--porcelain']);
  } catch {
    throw new Error('Not inside a git repository.');
  }

  const worktrees = parseWorktreePorcelain(output);

  let target;
  if (opts.numeric) {
    const index = parseInt(identifier, 10);
    if (isNaN(index)) {
      throw new Error(`'${identifier}' is not a valid number.`);
    }
    target = worktrees[index - 1];
  } else {
    target = resolveWorktree(worktrees, identifier);
  }

  if (!target) {
    throw new Error(`No worktree found matching '${identifier}'.`);
  }

  process.stdout.write(target.path);
}

module.exports = { add, list, remove, goPath };
