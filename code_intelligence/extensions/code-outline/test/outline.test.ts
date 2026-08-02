import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { outline, outlineSource } from "../outline.ts";

/** Strips the `[Language: Java]` header so tests can assert on the body only. */
const body = async (src: string): Promise<string> =>
	(await outlineSource(src)).split("\n").slice(2).join("\n");

describe("outline", () => {
	describe("skeleton", () => {
		it("should_indentNestedTypes_when_classContainsInnerClass", async () => {
			//GIVEN
			const src = ["class Outer {", "    static class Inner {", "        void go() {}", "    }", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 1  class Outer", " 2    static class Inner", " 3      void go()"].join("\n"));
		});

		it("should_distinguishOverloads_when_methodsShareAName", async () => {
			//GIVEN
			const src = ["class A {", "    void merge(String a) {}", "    void merge(int a, int b) {}", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 1  class A", " 2    void merge(String a)", " 3    void merge(int a, int b)"].join("\n"));
		});

		it("should_preserveDeclarationOrder_when_fieldsAndMethodsAreInterleaved", async () => {
			//GIVEN
			const src = ["class A {", "    int a;", "    void x() {}", "    int b;", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 1  class A", " 2    int a", " 3    void x()", " 4    int b"].join("\n"));
		});

		it("should_renderEachTopLevelType_when_fileHasSeveral", async () => {
			//GIVEN
			const src = ["package p;", "import q.R;", "class A {}", "class B {}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 3  class A", " 4  class B"].join("\n"));
		});

		it("should_alignLineNumberColumn_when_fileExceedsNinetyNineLines", async () => {
			//GIVEN
			const src = `${"\n".repeat(120)}class A {}`;

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, "121  class A");
		});
	});

	describe("signatures", () => {
		it("should_keepAnnotations_when_declarationIsAnnotated", async () => {
			//GIVEN
			const src = [
				"@Component",
				"class A {",
				'    @Override @Qualifier("x") public static final int f = 1;',
				"    @Override public void go() {}",
				"}",
			].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(
				result,
				[
					" 1  @Component class A",
					' 3    @Override @Qualifier("x") public static final int f',
					" 4    @Override public void go()",
				].join("\n"),
			);
		});

		it("should_keepLombokAnnotations_when_theyGenerateMembers", async () => {
			//GIVEN a class whose constructor and accessors exist only via Lombok
			const src = ["@Data", "@RequiredArgsConstructor", "public class A {", "    private final int id;", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN the annotations survive, so the agent can infer the generated API
			assert.equal(
				result,
				[" 1  @Data @RequiredArgsConstructor public class A", " 4    private final int id"].join("\n"),
			);
		});

		it("should_dropFieldInitializer_when_fieldIsAssigned", async () => {
			//GIVEN
			const src = ["class A {", "    private final Mapper m = Mappers.getMapper(Mapper.class);", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 1  class A", " 2    private final Mapper m"].join("\n"));
		});

		it("should_emitOneLinePerDeclarator_when_fieldDeclaresSeveralNames", async () => {
			//GIVEN
			const src = ["class A {", "    private int a, b;", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 1  class A", " 2    private int a", " 2    private int b"].join("\n"));
		});

		it("should_keepGenericsThrowsAndVarargs_when_signatureIsComplex", async () => {
			//GIVEN
			const src = [
				"class A {",
				"    public <T> List<T> f(T... xs) throws IOException { return null; }",
				"}",
			].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(
				result,
				[" 1  class A", " 2    public <T> List<T> f(T... xs) throws IOException"].join("\n"),
			);
		});

		it("should_collapseSignature_when_itSpansMultipleLines", async () => {
			//GIVEN
			const src = ["class A {", "    void f(", "        int a,", "        int b) {}", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 1  class A", " 2    void f( int a, int b)"].join("\n"));
		});
	});

	describe("member kinds", () => {
		it("should_renderInterfaceMembers_when_typeIsAnInterface", async () => {
			//GIVEN
			const src = [
				"interface S extends Base {",
				"    int CONST = 1;",
				"    Product get(Ref r) throws NotFound;",
				'    default String name() { return "x"; }',
				"}",
			].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(
				result,
				[
					" 1  interface S extends Base",
					" 2    int CONST",
					" 3    Product get(Ref r) throws NotFound",
					" 4    default String name()",
				].join("\n"),
			);
		});

		it("should_listConstantsAndMembers_when_typeIsAnEnum", async () => {
			//GIVEN
			const src = ["enum Kind {", "    ALPHA, BETA;", "    private final int i = 0;", "    Kind() {}", "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(
				result,
				[" 1  enum Kind", " 2    ALPHA", " 2    BETA", " 3    private final int i", " 4    Kind()"].join("\n"),
			);
		});

		it("should_keepComponentsInHeader_when_typeIsARecord", async () => {
			//GIVEN
			const src = [
				"record Pair(String left, int right) implements Cmp {",
				"    static Pair of(String l) { return null; }",
				"}",
			].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(
				result,
				[" 1  record Pair(String left, int right) implements Cmp", " 2    static Pair of(String l)"].join("\n"),
			);
		});

		it("should_renderElements_when_typeIsAnAnnotation", async () => {
			//GIVEN
			const src = ["@interface Marker {", '    String value() default "a";', "}"].join("\n");

			//WHEN
			const result = await body(src);

			//THEN
			assert.equal(result, [" 1  @interface Marker", ' 2    String value() default "a"'].join("\n"));
		});
	});

	describe("errors", () => {
		it("should_throw_when_extensionIsNotJava", async () => {
			//WHEN
			const error = await outline(["foo.py"]).catch((e: Error) => e);

			//THEN
			assert.match((error as Error).message, /only \.java is supported/);
		});

		it("should_throw_when_fileDoesNotExist", async () => {
			//WHEN
			const error = await outline(["does/not/exist.java"]).catch((e: Error) => e);

			//THEN
			assert.match((error as Error).message, /File not found/);
		});

		it("should_throw_when_sourceHasSyntaxErrors", async () => {
			//WHEN
			const error = await outlineSource("class A { void f( }").catch((e: Error) => e);

			//THEN
			assert.match((error as Error).message, /syntax errors/);
		});

		it("should_reportNoDeclarations_when_fileHasNone", async () => {
			//WHEN
			const result = await outlineSource("package p;\n");

			//THEN
			assert.match(result, /\(no declarations\)/);
		});
	});
});

describe("annotated declarations", () => {
	it("should_reportAnnotationLine_when_annotationIsOnItsOwnLine", async () => {
		//GIVEN
		const src = ["@Component", "@Slf4j", "public class A {", "    void go() {}", "}"].join("\n");

		//WHEN
		const result = await outlineSource(src);

		//THEN the line number points at the start of the declaration, annotations included
		assert.match(result, /^ 1 {2}@Component @Slf4j public class A$/m);
	});

	it("should_reportSameLine_when_annotationSharesTheSignatureLine", async () => {
		//GIVEN
		const src = ["class A {", "    @Override public void go() {}", "}"].join("\n");

		//WHEN
		const result = await outlineSource(src);

		//THEN
		assert.match(result, /^ 2 {4}@Override public void go\(\)$/m);
	});
});

describe("string literals", () => {
	it("should_preserveWhitespaceInsideStringLiterals_when_collapsingSignature", async () => {
		//GIVEN an annotation whose argument whitespace is data, not formatting
		const src = 'class A {\n    @Query("SELECT  x   FROM  y")\n    List<X> f();\n}';

		//WHEN
		const result = await outlineSource(src);

		//THEN
		assert.match(result, /@Query\("SELECT {2}x {3}FROM {2}y"\) List<X> f\(\)/);
	});

	it("should_stillCollapseFormattingWhitespace_when_signatureSpansLines", async () => {
		//GIVEN
		const src = 'class A {\n    @Named("a  b")\n    void f(\n        int x) {}\n}';

		//WHEN
		const result = await outlineSource(src);

		//THEN literal whitespace kept, layout whitespace collapsed
		assert.match(result, /@Named\("a {2}b"\) void f\( int x\)/);
	});
});


describe("paths list", () => {
	const pkg = "../../../src/main/java/com/audi/ecacp/ctutilsproduct/adapter/out/db";
	const one = `${pkg}/CategoryDbAdapter.java`;

	it("should_headEverySection_when_singleFileGiven", async () => {
		//WHEN
		const result = await outline([one]);

		//THEN the path header is always present, so the format never varies
		assert.ok(result.startsWith("[Language: Java]\n\n=== "));
		assert.ok(result.includes("CategoryDbAdapter.java"));
	});

	it("should_expandGlob_when_patternGiven", async () => {
		//WHEN
		const result = await outline([`${pkg}/*.java`]);

		//THEN
		assert.match(result, /^\[Language: Java\] 6 files$/m);
		assert.equal((result.match(/^=== /gm) ?? []).length, 6);
	});

	it("should_mergeAndDeduplicate_when_pathsAndGlobsOverlap", async () => {
		//WHEN the same file arrives via both a literal path and a glob
		const result = await outline([one, `${pkg}/*.java`]);

		//THEN it appears once
		assert.equal((result.match(/CategoryDbAdapter\.java/g) ?? []).length, 1);
		assert.equal((result.match(/^=== /gm) ?? []).length, 6);
	});

	it("should_orderSectionsDeterministically_when_pathsGivenOutOfOrder", async () => {
		//WHEN
		const a = await outline([`${pkg}/CategoryEntity.java`, one]);
		const b = await outline([one, `${pkg}/CategoryEntity.java`]);

		//THEN
		assert.equal(a, b);
	});

	it("should_skipOnlyTheBadFile_when_oneEntryIsUnreadable", async () => {
		//WHEN
		const result = await outline([one, "missing/Nope.java"]);

		//THEN the good file still renders, the bad one is reported inline
		assert.match(result, /=== missing\/Nope\.java\n {2}\(skipped: File not found/);
		assert.ok(result.includes("class CategoryDbAdapter"));
	});

	it("should_throwWithGlobHint_when_pathIsADirectory", async () => {
		//WHEN
		const error = await outline([pkg]).catch((e: Error) => e);

		//THEN
		assert.match((error as Error).message, /is a directory.*\*\.java/s);
	});

	it("should_throw_when_globMatchesNothing", async () => {
		//WHEN
		const error = await outline(["no/such/**/*.java"]).catch((e: Error) => e);

		//THEN
		assert.match((error as Error).message, /No \.java files matched/);
	});

	it("should_throwWithLimit_when_tooManyFilesResolve", async () => {
		//WHEN
		const error = await outline(["../../../src/**/*.java"]).catch((e: Error) => e);

		//THEN
		assert.match((error as Error).message, /limit is 50\. Narrow the paths/);
	});
});

describe("all-entries-failed", () => {
	it("should_throw_when_noFileCouldBeOutlined", async () => {
		//WHEN every entry is unreadable
		const error = await outline(["a/Missing.java", "b/AlsoMissing.java"]).catch((e: Error) => e);

		//THEN the error surfaces instead of a result made only of skip notices
		assert.match((error as Error).message, /File not found/);
	});
});
