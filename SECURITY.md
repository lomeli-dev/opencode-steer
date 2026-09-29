# Security

OpenCode Steer only submits the text that the user explicitly enters to the
current OpenCode session. It does not run shell commands, use the clipboard,
read files, make outbound requests beyond the connected OpenCode server, or
change permissions.

Treat injected text as model-facing input. Do not include API keys, tokens,
private credentials, or secret exports.

If you discover a security issue, use GitHub private vulnerability reporting
when it is available for this repository. Do not include secrets in a public
issue.
