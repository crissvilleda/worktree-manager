# wt — Git Worktree Manager

A CLI tool to manage git worktrees from the terminal.

## Install

```bash
npm install
npm link
```

## Commands

### `wt add <branch> [directory]`

Create a new worktree. If no directory is given, it is derived from the branch name — the last segment after `/` placed one level up from the repo root.

```bash
wt add feature/my-feature
# worktree created at ../my-feature

wt add feature/my-feature ../custom/path
# worktree created at ../custom/path
```

### `wt list`

List all worktrees with their branch and HEAD commit.

```bash
wt list
```

### `wt rm <worktree>`

Remove a worktree and delete its branch. Blocks if there are uncommitted changes.

```bash
wt rm my-feature
wt rm feature/my-feature
wt rm --force my-feature   # remove even with uncommitted changes
```

You can identify the worktree by branch name, directory name, or full path.

### `wt go <number|name>`

Navigate your terminal to a worktree directory. Accepts a 1-based index (from `wt list` order) or any identifier accepted by `wt rm`.

```bash
wt go 1               # go to main worktree
wt go 2               # go to second worktree
wt go feature/my-feature
wt go my-feature
```

> **This command requires a one-time shell setup — see below.**

---

## Shell setup (required for `wt go`)

Because a CLI process cannot change the working directory of your shell, `wt go` relies on a shell function wrapper.

Add the following to the end of your `~/.zshrc`:

```zsh
# wt worktree manager — enables `wt go` to actually cd
wt() {
  if [ "$1" = "go" ]; then
    local dir
    dir=$(command wt _go-path "${@:2}" 2>&1)
    if [ $? -ne 0 ]; then
      echo "$dir" >&2
      return 1
    fi
    cd "$dir"
  else
    command wt "$@"
  fi
}
```

Then reload your shell:

```bash
source ~/.zshrc
```

After that, `wt go` will navigate your terminal directly.
