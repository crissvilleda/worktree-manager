'use strict';

const { execFileSync } = require('child_process');

function git(args, options = {}) {
  const cwd = options.cwd || process.cwd();
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    throw new Error(err.stderr ? err.stderr.trim() : err.message);
  }
}

module.exports = { git };
