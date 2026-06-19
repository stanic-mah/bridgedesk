# ChatGPT Coding Workflow

BridgeDesk brings a Codex-style coding-agent loop to ChatGPT and other MCP hosts:
inspect the repo, follow local instructions, make scoped edits, run
verification, and show the user what changed.

## Open One Workspace

ChatGPT should call `open_workspace` once for a project folder:

```json
{
  "path": "~/work/my-project"
}
```

The result includes a `workspaceId`. All later file, search, edit, show-changes,
and shell calls should reuse that same `workspaceId`.

Do not reopen the same folder unless:

- the `workspaceId` is rejected as unknown
- the user switches to another folder
- the user switches between checkout and worktree mode
- the user explicitly asks to reopen

## Checkout Mode

Checkout mode is the default. BridgeDesk opens the actual directory:

```json
{
  "path": "~/work/my-project"
}
```

Use this when the user wants ChatGPT to work in the current checkout.

## Worktree Mode

Use worktree mode for isolated parallel work:

```json
{
  "path": "~/work/my-project",
  "mode": "worktree"
}
```

Managed worktrees are created under:

```text
~/.bridgedesk/worktrees
```

Worktree mode requires a Git repository with at least one commit. It starts from
`HEAD` unless `baseRef` is provided.

Uncommitted source checkout changes are not copied into the managed worktree.
BridgeDesk reports when the source checkout was dirty so the model can decide how
to proceed with the user.

## Project Instructions

When a workspace opens, BridgeDesk loads root-level instruction files:

- `AGENTS.md`
- `AGENTS.MD`
- `CLAUDE.md`
- `CLAUDE.MD`

Nested instruction files are returned as `availableAgentsFiles`. The model
should read the relevant nested file before working under that directory.

This keeps instructions explicit and inspectable instead of silently injecting
new context during later tool calls.

## Skills

Skills are enabled by default for coding-agent workflows.

BridgeDesk discovers skills from:

- `BRIDGEDESK_AGENT_DIR`, which defaults to `~/.codex`
- project `.pi/skills`
- optional paths from `BRIDGEDESK_SKILL_PATHS`

When `open_workspace` returns matching skills, the model should read the
advertised `SKILL.md` before following that skill.

Skill paths may be outside the workspace. BridgeDesk only permits reading:

- advertised `SKILL.md` files
- files under a skill directory after that skill's `SKILL.md` has been read

Set `BRIDGEDESK_SKILLS=0` to hide skills from workspace output.

## Tool Names

Short names are the default:

- `open_workspace`
- `read`
- `write`
- `edit`
- `bash`

By default, BridgeDesk also runs in `BRIDGEDESK_TOOL_MODE=minimal`, so dedicated
`grep`, `glob`, and `ls` tools are hidden. Use `bash` with command-line tools
such as `rg`, `find`, and `ls` for search and directory inspection.

Legacy names are available with `BRIDGEDESK_TOOL_NAMING=legacy`:

- `open_workspace`
- `read_file`
- `write_file`
- `edit_file`
- `run_shell`

Use `BRIDGEDESK_TOOL_MODE=full` to restore dedicated search and directory tools.

## Show Changes

By default, `BRIDGEDESK_WIDGETS=full`.

In that mode, BridgeDesk attaches widget UI to the exposed workspace, file, edit,
and shell tools. The aggregate `show_changes` tool is not exposed by default.

Use `BRIDGEDESK_WIDGETS=off` to disable widget UI, or `BRIDGEDESK_WIDGETS=changes`
to expose the aggregate show-changes flow.

## Shell Use

The shell tool is for commands that belong in a terminal:

- tests
- builds
- git inspection
- package scripts
- environment checks

File writes should go through the edit/write tools rather than shell
redirection, heredocs, `tee`, `sed -i`, or generated scripts.
