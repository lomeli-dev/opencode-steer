import assert from "node:assert/strict"
import test from "node:test"

import plugin, {
  COMMAND_ID,
  InjectInputError,
  InjectUnavailableError,
  MAX_TEXT_BYTES,
  createCommand,
  createLegacyCommand,
  injectSteer,
  openInjectDialog,
  validateInjectionText,
} from "../steer-inject.tui.js"

function makeApi(overrides = {}) {
  const calls = {
    prompt: [],
    toasts: [],
    layers: [],
    commandCallbacks: [],
    dialogClear: 0,
    dialogRender: undefined,
  }

  const api = {
    client: {
      v2: {
        session: {
          prompt: async (...args) => {
            calls.prompt.push(args)
            return { data: { admittedSeq: 9 } }
          },
        },
      },
    },
    route: {
      current: {
        name: "session",
        params: { sessionID: "ses_active" },
      },
    },
    ui: {
      toast: (input) => calls.toasts.push(input),
      DialogPrompt: (props) => props,
      dialog: {
        replace: (render) => {
          calls.dialogRender = render
          return render()
        },
        clear: () => {
          calls.dialogClear += 1
        },
      },
    },
    keymap: {
      registerLayer: (layer) => calls.layers.push(layer),
    },
    command: {
      register: (callback) => {
        calls.commandCallbacks.push(callback)
        return () => {}
      },
    },
    ...overrides,
  }

  return { api, calls }
}

test("injectSteer uses native V2 steer once and never calls an interrupt route", async () => {
  const { api, calls } = makeApi()

  const result = await injectSteer(api, "ses_active", "cambia a la API v2")

  assert.equal(result.sessionID, "ses_active")
  assert.equal(calls.prompt.length, 1)
  assert.deepEqual(calls.prompt[0], [
    {
      sessionID: "ses_active",
      prompt: { text: "cambia a la API v2" },
      delivery: "steer",
      resume: true,
    },
    { throwOnError: true },
  ])
})

test("validateInjectionText preserves meaningful whitespace but rejects empty input", () => {
  assert.equal(validateInjectionText("  conserva esta sangría\n"), "  conserva esta sangría\n")
  assert.throws(() => validateInjectionText(" \n\t "), InjectInputError)
  assert.throws(() => validateInjectionText("x".repeat(MAX_TEXT_BYTES + 1)), InjectInputError)
})

test("injectSteer fails closed if the V2 client is unavailable", async () => {
  const { api } = makeApi({ client: {} })

  await assert.rejects(
    () => injectSteer(api, "ses_active", "hola"),
    InjectUnavailableError
  )
})

test("legacy command registration exposes /inject and Ctrl+Shift+I", async () => {
  const { api, calls } = makeApi()

  await plugin.tui(api)

  assert.equal(calls.commandCallbacks.length, 1)
  const command = calls.commandCallbacks[0]()[0]
  assert.equal(command.value, COMMAND_ID)
  assert.equal(command.slash.name, "inject")
  assert.deepEqual(command.slash.aliases, ["steer"])
  assert.equal(command.keybind, "ctrl+shift+i")
})

test("the modern keymap API remains a fallback when the legacy API is absent", async () => {
  const { api, calls } = makeApi()
  delete api.command

  await plugin.tui(api)

  assert.equal(calls.layers.length, 1)
  assert.equal(calls.layers[0].mode, "base")
  assert.equal(calls.layers[0].commands[0].name, COMMAND_ID)
  assert.equal(calls.layers[0].commands[0].slashName, "inject")
})

test("the dialog injects the active session only after confirmation", async () => {
  const { api, calls } = makeApi()
  const command = createCommand(api)

  command.run()
  const dialog = calls.dialogRender()

  assert.equal(calls.prompt.length, 0)
  await dialog.onConfirm("no reinicies el gateway; solo inspecciona estado")

  assert.equal(calls.prompt.length, 1)
  assert.equal(calls.prompt[0][0].sessionID, "ses_active")
  assert.equal(calls.prompt[0][0].delivery, "steer")
  assert.equal(calls.dialogClear, 1)
  assert.equal(calls.toasts.at(-1).variant, "success")
})

test("the legacy command opens the same injection dialog", () => {
  const { api, calls } = makeApi()
  const command = createLegacyCommand(api)

  command.onSelect()

  assert.equal(typeof calls.dialogRender, "function")
})

test("the dialog does not send an empty instruction", async () => {
  const { api, calls } = makeApi()

  openInjectDialog(api)
  const dialog = calls.dialogRender()
  await dialog.onConfirm("   ")

  assert.equal(calls.prompt.length, 0)
  assert.equal(calls.dialogClear, 0)
  assert.equal(calls.toasts.at(-1).variant, "error")
})

test("the command fails safely when the TUI route has no session ID", () => {
  const { api, calls } = makeApi({
    route: {
      current: {
        name: "session",
        params: {},
      },
    },
  })

  openInjectDialog(api)

  assert.equal(calls.dialogRender, undefined)
  assert.equal(calls.prompt.length, 0)
  assert.equal(calls.toasts.at(-1).variant, "warning")
})
