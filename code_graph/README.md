# Code Graph

LSP-powered queryable code graph for exploring codebases. TypeScript, Java, Rust.

```
node cli.ts <directory> <query>
node cli.ts <directory> --repl
```

## Quick examples

```bash
node cli.ts ../zod 'db.stats()'
node cli.ts ../zod 'db.symbol("ZodObject").where(s => s.kind === "class").explain()'
node cli.ts ../zod 'db.all().where(s => s.kind === "class" && s.exported).asTable()'
node cli.ts /path/to/java/project 'db.symbol("OwnerController").explain()'
```

## Query API

```
Entry points:
  db.symbol(name)       Exact name match
  db.file(path)         Partial/ending path match
  db.all()              All symbols
  db.files()            All files
  db.stats()            { files, symbols }

Traversal:
  .callers()            Who calls these? [async]
  .callees()            What do these call? [async]
  .file()               Symbol → FileQuery
  .symbols()            FileQuery → SymbolQuery

Filtering:
  .filter(predicate)    Arbitrary predicate
  .where(predicate)     Alias
  .exported()           Exported only

Terminals:
  .list()               Raw array
  .asTable()            Pretty-printed table
  .tree()               Indented, grouped by file
  .count()              Count
  .first()              First match
  .summary()            Distribution by kind/file
  .explain()            Detailed breakdown [async]
```

## Prerequisites

Language servers must be installed (mason/brew):
- `typescript-language-server` — npm/mason
- `jdtls` — Eclipse JDT LS via mason
- `rust-analyzer` — via rustup/brew
