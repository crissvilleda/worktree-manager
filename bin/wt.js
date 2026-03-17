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
  .description('Remove a worktree and delete its branch')
  .option('-f, --force', 'Remove even if there are uncommitted changes')
  .action((worktree, opts) => run(() => remove(worktree, opts)));

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
