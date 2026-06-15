# Coding Agent Plugins

This project hosts packages for the Pi Coding Agents.

Top-level directories get installed in other projects as packages via

```
pi install path/to/directory
```

Each package can contain the folloring subdirectories:

- extensions: Extensions for he agent, written in Typescript.
- skills: Subdirectory per skill
- prompts: Prompt-template files

Optionally a package.json file might be added. Only use it when defauts are not sufficient, for example when extensions need dependencies.
