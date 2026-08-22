# code-graph

LSP-backed code understanding, exposed as a library and a thin CLI.

Java and Rust, built so more languages can be added behind the same
`LanguageAdapter` interface.

## Layers

- `lib/` — language-agnostic model, graph, query, resolution, scope, usages, and session cache.
- `languages/java/` — Java adapter (jdtls) + tree-sitter enrichment.
- `languages/rust/` — Rust adapter (rust-analyzer) + tree-sitter enrichment.
- `lsp/` — generic JSON-RPC LSP client infrastructure.
- `interfaces/` — the CLI.
- `index.ts` / `render.ts` — the pi extension: `code` and `code_search` tools over the cached graph.

## Pi extension

When loaded by pi and the session cwd has `Cargo.toml`, `pom.xml`, or
`build.gradle(.kts)`, two tools are registered:

- `code("UserService")` / `code("UserService.findUser")` — resolve a symbol and
  return source/members, doc/annotations, usages, and implementations/overrides
  in one call. `code("UserService.java:14")` / `code("UserService:14")` resolve a
  location to the outermost method containing that line (same output as a method
  query).
- `code_search({ substrings: ["find"], includeKinds: ["method"] })` — list ranked
  symbol matches (name, kind, container, file:line, signature) to discover names
  before calling `code`.

The graph is warmed at session start and kept fresh via mtime invalidation;
usages are always live from LSP.

## CLI

```bash
node interfaces/cli.ts <directory> symbol <name>
node interfaces/cli.ts <directory> find <pattern> [--kind <k>] [--path <glob>]
node interfaces/cli.ts <directory> members <container>
node interfaces/cli.ts <directory> file <path>
node interfaces/cli.ts <directory> detail <name>
node interfaces/cli.ts <directory> find-usages <name> [--kind <k>] [--container <c>] [--signature <sig>]
node interfaces/cli.ts <directory> code <query> [--scope <main|test|all>]
node interfaces/cli.ts <directory> search <substr> [...] [--include <k,...>] [--exclude <k,...>] [--scope <main|test|all>] [--path <glob>]
node interfaces/cli.ts <directory> --stats
```

Requires a buildable Maven/Gradle project (with `jdtls` on PATH) or a Cargo
project (with `rust-analyzer` on PATH).

## Library

```ts
import { createGraph } from "./lib/graph.ts";
import { JavaAdapter } from "./languages/java/adapter.ts";

const adapter = await JavaAdapter.connect(root);
try {
  const graph = await createGraph(root, adapter);
  const matches = graph.symbol("findById");
  const methods = graph.find("find").where("method").list();
  const serviceMembers = graph.members("UserService").list();
  const usages = await graph.findUsages("findById");
  console.log(graph.stats());
} finally {
  await adapter.close();
}
```

For Rust, import `RustAdapter` from `./languages/rust/adapter.ts` instead; the
rest of the API is identical.
