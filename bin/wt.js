#!/usr/bin/env node
'use strict';

const { program } = require('commander');
const { add, list, remove, goPath } = require('../src/worktree');
const { version } = require('../package.json');

program
  .name('wt')
  .description('Git worktree manager')
  .version(version);

program
  .command('add <branch> [directory]')
  .description('Create a new worktree for the given branch')
  .action((branch, directory) => run(() => add(branch, directory)));

program
  .command('list')
  .description('List all worktrees')
  .action(() => run(list));

program
  .command('rm <worktree>')
  .description('Remove a worktree by name or -n <index> (prompts when using -n)')
  .option('-f, --force', 'Remove even if there are uncommitted changes')
  .option('-n, --numeric', 'Identify worktree by 1-based numeric index (prompts for confirmation)')
  .action((worktree, opts) => {
    if (opts.numeric) {
      const answer = promptConfirm(`Remove worktree #${worktree}? [y/N] `);
      if (answer !== 'y' && answer !== 'Y') {
        console.log('Aborted.');
        return;
      }
    }
    run(() => remove(worktree, opts));
  });

program
  .command('go <name|number>')
  .description('Navigate to a worktree by name or -n <index> (requires shell setup — see README)')
  .option('-n, --numeric', 'Resolve by 1-based numeric index instead of name')
  .action(() => {
    console.error('Error: `wt go` requires the shell wrapper to be installed.');
    console.error('See the README for setup instructions.');
    process.exit(1);
  });

program
  .command('_go-path <identifier>', { hidden: true })
  .option('-n, --numeric', 'Resolve by numeric index')
  .action((identifier, opts) => run(() => goPath(identifier, opts)));

program.parse(process.argv);

function run(fn) {
  try {
    fn();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

function promptConfirm(question) {
  process.stdout.write(question);
  const buf = Buffer.alloc(4);
  const n = require('fs').readSync(0, buf, 0, 4);
  return buf.subarray(0, n).toString().trim();
}
