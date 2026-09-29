# OpenCode Steer

Native steering for the OpenCode 1.18 legacy TUI.

OpenCode Steer adds:

- /inject to open a short instruction dialog.
- /steer as an alias.
- Ctrl+Shift+I as a shortcut.

The plugin admits the text with the native V2 session API using delivery steer,
instead of the legacy TUI follow-up queue.

## Compatibility

This is a source-only plugin for OpenCode 1.18.x and its legacy tui.json(c)
terminal client. It is not an OpenCode 2 plugin.

OpenCode 2 uses a different plugin API and cli.json. Do not install this
implementation on OpenCode 2; porting it is a separate task. See the official
V1 migration guide:

https://opencode.ai/v2/docs/migrate-v1/

## Install from GitHub

Clone the repository into the global OpenCode plugin directory:

    git clone https://github.com/lomeli-dev/opencode-steer.git \
      ~/.config/opencode/plugins/opencode-steer

Then append the following entry to the existing plugin array in
~/.config/opencode/tui.jsonc. Keep every pre-existing entry.

    {
      "plugin": [
        "file:///home/YOU/.config/opencode/plugins/opencode-steer/steer-inject.tui.js"
      ]
    }

Replace /home/YOU with the actual home directory of the user that runs
OpenCode. Start a new OpenCode TUI process after editing the file.

For OpenCode 1 plugin loading and tui.json(c) configuration, see:

https://opencode.ai/docs/plugins/

## Usage

1. Open a session.
2. Run /inject, /steer, or Ctrl+Shift+I.
3. Write the instruction in the dialog and confirm.

The confirmation means that OpenCode accepted the steer. It does not mean that
the model has already read it.

## What steer does not do

Steer is not a process kill. A running shell tool or provider stream must reach
its next safe model boundary before the agent can act on the instruction.

The plugin never calls interrupt or abort, never runs a shell command, does not
read or write files, has no telemetry, and has no runtime dependencies. The
injected text is a normal persisted user instruction, so do not put secrets or
tokens in it.

## Test

    npm test

The tests verify exact native steer admission, active-session targeting,
absence of interrupt calls, input validation, and both supported TUI command
registration paths.

## Upgrade

    cd ~/.config/opencode/plugins/opencode-steer
    git pull --ff-only

Restart the OpenCode TUI after the update. Test first in a disposable session
with a slow tool before relying on it during production work.

## License

MIT. See LICENSE.
