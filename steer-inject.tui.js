/**
 * Local OpenCode TUI plugin: /inject (alias /steer) opens a small dialog and
 * delivers its text through OpenCode's V2 native steer API.
 *
 * It deliberately has no server-plugin half, dependencies, filesystem access,
 * shell access, background listener, retry loop, or cross-session targeting.
 */

export const PLUGIN_ID = "lomeli-dev.opencode-steer"
export const COMMAND_ID = "lomeli-dev.opencode-steer.open"
export const MAX_TEXT_BYTES = 8 * 1024

export class InjectInputError extends Error {
  constructor(message) {
    super(message)
    this.name = "InjectInputError"
  }
}

export class InjectUnavailableError extends Error {
  constructor(message) {
    super(message)
    this.name = "InjectUnavailableError"
  }
}

function byteLength(text) {
  return new TextEncoder().encode(text).byteLength
}

/**
 * Validates without trimming the submitted text so that the model receives
 * exactly what the user typed. Whitespace-only input is rejected.
 */
export function validateInjectionText(value) {
  if (typeof value !== "string") {
    throw new InjectInputError("Escribe una instrucción para inyectar.")
  }
  if (value.trim().length === 0) {
    throw new InjectInputError("La instrucción no puede estar vacía.")
  }
  if (byteLength(value) > MAX_TEXT_BYTES) {
    throw new InjectInputError("La instrucción supera el límite de 8 KiB.")
  }
  return value
}

export function validateSessionID(sessionID) {
  if (typeof sessionID !== "string" || sessionID.trim().length === 0) {
    throw new InjectUnavailableError("No hay una sesión activa para inyectar.")
  }
  return sessionID
}

/**
 * Sends one native V2 steer admission. This returns after OpenCode accepts the
 * input; it never waits for the model, a tool, or the session to become idle.
 */
export async function injectSteer(api, sessionID, rawText) {
  const text = validateInjectionText(rawText)
  const targetSessionID = validateSessionID(sessionID)
  const prompt = api && api.client && api.client.v2 && api.client.v2.session
    ? api.client.v2.session.prompt
    : undefined

  if (typeof prompt !== "function") {
    throw new InjectUnavailableError(
      "Esta instancia no expone la API V2 necesaria para steer."
    )
  }

  await prompt.call(
    api.client.v2.session,
    {
      sessionID: targetSessionID,
      prompt: { text },
      delivery: "steer",
      resume: true,
    },
    { throwOnError: true }
  )

  return { bytes: byteLength(text), sessionID: targetSessionID }
}

function toast(api, input) {
  try {
    api.ui.toast(input)
  } catch {
    // A failed cosmetic toast must never change delivery behavior.
  }
}

function safeFailureMessage(error) {
  if (error instanceof InjectInputError || error instanceof InjectUnavailableError) {
    return error.message
  }
  return "No se confirmó la admisión. Revisa la sesión antes de reintentar."
}

export function openInjectDialog(api) {
  const route = api.route.current
  if (!route || route.name !== "session") {
    toast(api, {
      variant: "warning",
      title: "Inject",
      message: "Abre una sesión antes de inyectar.",
    })
    return
  }

  let sessionID
  try {
    sessionID = validateSessionID(route.params && route.params.sessionID)
  } catch (error) {
    toast(api, {
      variant: "warning",
      title: "Inject",
      message: safeFailureMessage(error),
    })
    return
  }
  let submitting = false

  api.ui.dialog.replace(() =>
    api.ui.DialogPrompt({
      title: "Inject into active turn",
      placeholder: "Instrucción para el agente…",
      onCancel: () => api.ui.dialog.clear(),
      onConfirm: async (value) => {
        if (submitting) return
        submitting = true

        try {
          const result = await injectSteer(api, sessionID, value)
          api.ui.dialog.clear()
          toast(api, {
            variant: "success",
            title: "Injected",
            message:
              "Steer aceptado (" +
              result.bytes +
              " B). Se aplicará en el siguiente límite seguro del agente.",
          })
        } catch (error) {
          toast(api, {
            variant: "error",
            title: "Inject no confirmado",
            message: safeFailureMessage(error),
          })
        } finally {
          submitting = false
        }
      },
    })
  )
}

export function createCommand(api) {
  return {
    name: COMMAND_ID,
    title: "Inject into active turn",
    category: "Session",
    desc: "Envía una instrucción como native steer, sin usar la cola normal.",
    namespace: "palette",
    slashName: "inject",
    slashAliases: ["steer"],
    run() {
      openInjectDialog(api)
    },
  }
}

export function createLegacyCommand(api) {
  return {
    title: "Inject into active turn",
    value: COMMAND_ID,
    description: "Envía una instrucción como native steer, sin usar la cola normal.",
    category: "Session",
    keybind: "ctrl+shift+i",
    slash: {
      name: "inject",
      aliases: ["steer"],
    },
    onSelect() {
      openInjectDialog(api)
    },
  }
}

const plugin = {
  id: PLUGIN_ID,
  async tui(api) {
    // OpenCode 1.18.x exposes this compatibility API in its public TUI types.
    // Prefer it on hosts that have it; newer hosts use the native keymap path.
    if (api.command && typeof api.command.register === "function") {
      api.command.register(() => [createLegacyCommand(api)])
      return
    }

    if (!api.keymap || typeof api.keymap.registerLayer !== "function") {
      throw new InjectUnavailableError(
        "Esta TUI no expone una API para registrar el comando /inject."
      )
    }

    api.keymap.registerLayer({
      mode: "base",
      commands: [createCommand(api)],
      bindings: [
        {
          key: "ctrl+shift+i",
          cmd: COMMAND_ID,
          desc: "Inject into active turn",
        },
      ],
    })
  },
}

export default plugin
