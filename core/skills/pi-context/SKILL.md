---
name: pi-context
description: >-
  Pi's own documentation. Use only when the user asks about pi itself, its SDK,
  extensions, themes, skills, or TUI.
disable-model-invocation: true
---
# Pi Context

## Pi documentation

Pi ships its docs with the installation. Read the on-disk docs for the running
version instead of answering from memory.

Resolve the package root through a stable, version-independent symlink:

```bash
PKG=/opt/homebrew/opt/pi-coding-agent/libexec/lib/node_modules/@earendil-works/pi-coding-agent
```

- README: `$PKG/README.md`
- Docs: `$PKG/docs`
- Examples: `$PKG/examples` (extensions, custom tools, SDK)

Rules:

1. Resolve `docs/...` under the docs directory and `examples/...` under the
   examples directory, never the current working directory.
2. Start with `docs/index.md` — it is the canonical index of every doc.
3. Read the relevant `.md` file completely and follow its cross-references
   before implementing.
4. Topic map:
    - extensions: `docs/extensions.md`, `examples/extensions/`
    - themes: `docs/themes.md`
    - skills: `docs/skills.md`
    - prompt templates: `docs/prompt-templates.md`
    - TUI components: `docs/tui.md`
    - keybindings: `docs/keybindings.md`
    - SDK integrations: `docs/sdk.md`
    - custom providers: `docs/custom-provider.md`
    - adding models: `docs/models.md`
    - pi packages: `docs/packages.md`
    - environment variables: `docs/environment-variables.md`

