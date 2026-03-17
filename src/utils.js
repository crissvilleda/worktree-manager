'use strict';

const path = require('path');

function branchToDirectory(branchName, repoRoot) {
  const segments = branchName.split('/');
  const lastSegment = segments[segments.length - 1];
  return path.resolve(repoRoot, '..', lastSegment);
}

function resolveDirectory(directory) {
  return path.resolve(process.cwd(), directory);
}

function parseWorktreePorcelain(output) {
  const worktrees = [];
  const blocks = output.split('\n\n').filter(b => b.trim());
  for (const block of blocks) {
    const wt = {};
    for (const line of block.trim().split('\n')) {
      if (line.startsWith('worktree '))     wt.path = line.slice(9);
      else if (line.startsWith('HEAD '))    wt.head = line.slice(5);
      else if (line.startsWith('branch ')) wt.branch = line.slice(7);
      else if (line === 'detached')         wt.detached = true;
      else if (line === 'bare')             wt.bare = true;
    }
    worktrees.push(wt);
  }
  return worktrees;
}

function shortBranch(ref) {
  return ref ? ref.replace('refs/heads/', '') : null;
}

function resolveWorktree(worktrees, identifier) {
  const absIdentifier = path.resolve(identifier);
  return worktrees.find(wt => {
    const short = shortBranch(wt.branch);
    return (
      wt.path === identifier ||
      wt.path === absIdentifier ||
      short === identifier ||
      path.basename(wt.path) === identifier
    );
  });
}

module.exports = {
  branchToDirectory,
  resolveDirectory,
  parseWorktreePorcelain,
  shortBranch,
  resolveWorktree,
};
