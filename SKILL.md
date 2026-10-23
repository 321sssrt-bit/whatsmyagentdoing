---
name: myoffice
description: Open a live office view of every Claude Code, Codex and Gemini CLI agent on this machine — who is thinking, running a tool, writing a reply, waiting for the user, or done. Use when the user types /myoffice, asks what their agents are doing, wants to see all running sessions, or which agent is stuck or finished ("我的 agent 在幹嘛", "show my agents").
---

# myoffice

Start the dashboard. It serves a local page and opens it in the browser.
Run it **in the background** so it keeps running and doesn't block the chat
(this skill's base directory is shown above as "Base directory for this skill"):

```bash
node "<base directory>/bin/cli.js"
```

If it is already running, the same command just reopens the browser tab.
Then tell the user, in one line, that the office is open at the printed URL.
Requires Node.js 18+; if `node` is missing, say so and stop.

Options the user may ask for:

- `--private` — hide prompts/replies, show status only (for screen sharing)
- `--hours 4` — only sessions active in the last 4 hours (default 24)
- `--port 5000` — different port (default 4545)
- `--json` — print a one-off snapshot instead of opening a page. Use this when
  the user asks in chat what their other agents are doing: run
  `node "<base directory>/bin/cli.js" --json --hours 2` and summarize by status.

Everything is read locally from `~/.claude/projects`, `~/.codex/sessions` and `~/.gemini/tmp`;
the server listens on 127.0.0.1 only and sends nothing anywhere.
