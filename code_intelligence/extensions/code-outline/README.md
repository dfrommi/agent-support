# code-outline

A pi extension providing the `outline` tool: a token-efficient structural view of Java
source for AI agents.

Given a `.java` file — or a glob matching many — it returns a skeleton of every class,
field, method and constructor with line numbers, so an agent can survey code without
reading it.

## Install

```bash
npm install
```

The extension is auto-discovered from `.pi/extensions/`, which requires the project to be
trusted. To load it explicitly instead:

```bash
pi -e ./.pi/extensions/code-outline/index.ts
```

## Usage

```
outline(["src/main/java/com/example/MyService.java"])          # one file
outline(["src/main/java/com/example/service/*.java"])          # a package
outline(["src/**/dto/*.java", "src/main/java/.../Foo.java"])   # mixed list
```

`paths` is always a list; each entry is a `.java` file or a glob. Results are deduplicated
and sorted, so the output is stable regardless of input order. Every file gets a `=== path`
header.

```
[Language: Java]

=== src/main/java/com/example/MaintenanceCtPersistence.java
 33  @Component @Slf4j public class MaintenanceCtPersistence implements MaintenancePersistencePort
 36    private final IPimPersistence ipimPersistence
 38    public MaintenanceCtPersistence(IPimService iPimService)
 43    @Override public Product getProduct(ProductReference productReference)
 55    @RequiredArgsConstructor static class IPimPersistence
 57      private final IPimService iPimService
127      private static VariantBO merge(VariantBO currentVariant, VariantUpdateModel variantUpdateModel, Context context)
```

Several files:

```
[Language: Java] 6 files

=== src/main/java/com/example/db/CategoryDbAdapter.java
 20  @RequiredArgsConstructor @Slf4j @Service public class CategoryDbAdapter implements CategoryMaintenancePort
 24    private final CategoryRepository repository
 27    @Override @Transactional public void createOrUpdate(CategoryBO category)

=== src/main/java/com/example/db/CategoryEntity.java
 ...
```

To read a specific member, take its line number from the outline and use
`read(offset, limit)`.

## When it actually pays

Measured on this repo (claude-sonnet-4.6, 4 runs per arm):

| Task | outline | plain read |
| ------ | --------- | ------------ |
| Survey an 11-file / 1263-line package | **~33k tokens** | ~52k tokens |
| Survey a 6-file / 449-line package | ~14k tokens | **~10k tokens** |

**Outline wins on large files and large packages, and loses on small ones.** The median Java
file in this repo is 29 lines and 81% are under 100 — for those, reading the file outright
is cheaper than outlining it and then reading it anyway. The prompt guidelines steer
accordingly; do not remove that steer.

## Output rules

- Line number in a left column, then two-space indentation per nesting level.
- Flat, in declaration order — no `fields:` / `methods:` grouping.
- Full signatures: modifiers, return type, parameter names and types. Overloads are
  therefore unambiguous.
- Fields show `modifiers type name`; the initializer is dropped.
- Rendered: classes, interfaces, enums (with constants), records, annotation types, nested
  types, constructors, methods, fields.
- Errors (throw): a directory path (with a hint to use a glob), a glob matching nothing,
  more than 50 files resolved, or *every* entry failing.
- If at least one file outlines successfully, the failures are reported inline as
  `(skipped: ...)` instead of failing the whole call.

## Known limitations

- **Not shown:** imports, package declarations, Javadoc/comments, method bodies, initializer
  blocks, local and anonymous classes. Use `read` for those.
- **`module-info.java`** parses but yields `(no declarations)`; module directives are not
  modelled.
- **Unicode escapes** (`class \u0041 {}`) are rejected as syntax errors. Java resolves these
  before lexing; the grammar does not.
- **Text blocks** (`"""..."""`) inside a signature have their whitespace collapsed, unlike
  ordinary string literals. Preserving them would break the one-line-per-member layout.

## Design decisions worth knowing

**Signatures are sliced from the source, not reassembled.** Everything from the declaration
start to the body's `{` is taken verbatim and whitespace-collapsed. Generics, `throws`,
varargs, `extends`/`implements` and record components all work without per-construct code.
Collapsing is syntax-aware: whitespace inside string and character literals is preserved, so
`@Query("SELECT  x  FROM  y")` is not silently rewritten.

**Annotations are kept.** Dropping them made the outline *wrong*: `@Data`,
`@RequiredArgsConstructor` and friends generate constructors and accessors that exist in no
AST, so a Lombok class would appear to have no public API at all. Same for `@Mapping`
(MapStruct), where the annotation *is* the behaviour. ~52% of declarations here are
annotated; keeping them costs ~5 points of output size.

**There is deliberately no method-body expansion.** An earlier version had
`expandAroundLines`. Benchmarking showed it matched `outline` + `read(offset, limit)` on call
count and cost ~8% *more* tokens, because the skeleton's line numbers already let the model
derive a correct range from the next declaration's line. It was removed along with the class
of bugs unique to it. Do not re-add it without new evidence.

**Syntax errors are fatal, but contained.** Tree-sitter would happily return a partial tree,
but a partial outline is a misleading one. All 655 files in this repo parse clean. When other
files in the same call succeed the failure is reported inline; when nothing succeeds the
error is thrown, so a plain mistake is never returned as an outline.

## Dependency pinning — do not loosen

```
web-tree-sitter  0.25.10
tree-sitter-wasms 0.1.13
```

These are exact pins, not ranges. The `.wasm` grammars in `tree-sitter-wasms@0.1.13` use an
older ABI; `web-tree-sitter@0.26+` fails to load them at runtime with an opaque
`getDylinkMetadata` error. Bump both together and re-run the tests.

WASM grammars were chosen over `node-tree-sitter` deliberately: no native compilation, no
node-gyp, no per-platform prebuilds.

## Tests

```bash
npm test    # node --test, no test framework dependency
```

32 tests covering nesting, overloads, annotations, each Java member kind, path-list and glob handling, and error paths. Node's built-in runner and type stripping are used, so the source must stay
within erasable TypeScript (no `enum`, no parameter properties).

## Status

Java only. Lives here for development against a real service; intended to move to a
standalone pi package.
