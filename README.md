# 👀 whatsmyagentdoing

**One command to see what every Claude Code and Codex agent on your machine is doing — live, in your browser.**

```bash
npx whatsmyagentdoing
```

It opens an isometric **office**. Agents that are working sit at cubicle desks: a thought bubble while thinking, typing with code scrolling on the monitor while a tool runs, standing up and waving when they need you. A handful of recently finished agents stay around off duty and wander: coffee and water in the pantry, the couch and beanbags, the bookshelf, the meeting-room whiteboard, the arcade cabinet, ping-pong and foosball (when two of them are free), the phone booth, or a nap at an empty desk. Everyone else has gone home. There's an office cat, and the windows follow your local time of day. Hover anyone to see what they're on.

Two looks: **Medium** is a hand-drawn 2D canvas (zero dependencies). **High (3D)** renders the same office with real-time lighting and shadows using [Kenney](https://kenney.nl)'s CC0 *Mini Characters* (with their walk / sit / interact animations) and *Furniture Kit*; drag to rotate, scroll to zoom. three.js and the models (~1.3 MB, meshopt-compressed) only load when you pick High.

Prefer plain cards? Switch to **List**. Either way, each session updates in real time:

| Status | Meaning |
|---|---|
| 💭 Thinking | reasoning, or reading a tool result |
| ⏳ Running | a tool call is in flight — shows which (`Bash: npm test`, `Edit app.ts`, `github · create_pr`) |
| ✍️ Writing reply | started its answer, turn not finished yet |
| 🟠 Waiting for you | asked you a question / needs approval |
| ✅ Done | turn finished, with the last reply |
| ■ Interrupted / ❗ Error / – Idle | |

In list view, sessions are grouped into **Needs you → Working → Finished**, with a live timer for the current turn, a copy button for the resume command (`claude --resume …` / `codex resume …`), optional browser notifications when an agent finishes, and filters for Claude / Codex / subagents. The tab title shows how many agents are working.

Works with Claude Code (CLI, desktop, IDE) and Codex (CLI, desktop, IDE) — anything that writes session logs to disk.

## Install as a skill

So you (or your agent) can just say *"what are my agents doing?"*:

```bash
# Claude Code
git clone https://github.com/Charonyuu/whatsmyagentdoing /tmp/wmad && cp -r /tmp/wmad/skills/whatsmyagentdoing ~/.claude/skills/

# Codex
git clone https://github.com/Charonyuu/whatsmyagentdoing /tmp/wmad && cp -r /tmp/wmad/skills/whatsmyagentdoing ~/.codex/skills/
```

Then `/whatsmyagentdoing` in Claude Code, or ask either agent to show your agents.

## Options

```
-p, --port <n>    Port (default 4545; next free one if taken)
--hours <n>       Sessions active in the last n hours (default 24)
--no-open         Don't open the browser
--private         Hide prompts, replies and titles — status only (screen-share safe)
--json            Print one snapshot as JSON and exit
```

Running it again while it's up just reopens the tab.

## How it works

No hooks, no config, no API keys. Both tools already append every message and tool call to JSONL files as they work:

- Claude Code: `~/.claude/projects/<project>/<session>.jsonl` (+ `subagents/`)
- Codex: `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`

`whatsmyagentdoing` tails those files (read-only), turns the latest event into a status, and pushes it to the page over Server-Sent Events. Set `CLAUDE_CONFIG_DIR` / `CODEX_HOME` if yours live elsewhere.

**Privacy:** nothing leaves your machine. The server binds to `127.0.0.1` only and rejects requests that aren't addressed to localhost. One dependency (`three`, used only by the 3D view) — read `src/` in five minutes.

## Limits

- Logs are written per finished block, not per token, so "Writing reply" means a reply block has landed and the turn isn't over — not a live keystroke stream.
- Permission prompts aren't written to the logs, so a tool waiting on your approval shows as "Running" until you answer.
- The log formats aren't public APIs. If an update changes them, statuses may degrade — please open an issue.

## License

MIT. 3D models in `assets/kenney/` are by [Kenney](https://kenney.nl), released under CC0 (see the license files there).
