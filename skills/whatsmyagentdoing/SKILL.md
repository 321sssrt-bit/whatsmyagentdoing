---
name: whatsmyagentdoing
description: Open a live local dashboard of every Claude Code and Codex agent on this machine — thinking, running a tool, writing a reply, waiting for you, done. Use when the user asks what their agents are doing, wants to see all running sessions, check which agent is stuck or finished, or says "whatsmyagentdoing" / "show my agents" / "我的 agent 在幹嘛".
---

# whatsmyagentdoing

Start the dashboard in the background (it keeps running and opens the browser itself):

```bash
npx -y whatsmyagentdoing
```

Run it as a background command so it doesn't block the conversation. If it is
already running, the same command just reopens the browser tab.

Options the user may ask for:

- `--private` — hide prompts/replies, show status only (for screen sharing)
- `--hours 4` — only sessions active in the last 4 hours (default 24)
- `--port 5000` — different port (default 4545)
- `--no-open` — don't open a browser
- `--json` — print a one-off snapshot instead of serving a page. Use this when
  the user asks you (in chat) what their other agents are doing: run
  `npx -y whatsmyagentdoing --json --hours 2`, then summarize by status.

Everything is read locally from `~/.claude/projects` and `~/.codex/sessions`;
the server only listens on 127.0.0.1 and sends nothing anywhere.
