import Foundation
import FoundationModels

// MARK: - Generable output types

@Generable
enum Intent: String, Sendable {
    case symbol
    case path
    case none
}

@Generable
struct QueryPlan: Sendable {
    @Guide(description: """
        The codegraph operation to run:
        - symbol: show the selected symbols (source + callers/callees).
        - path: trace the call path between exactly two selected symbols.
        - none: no candidate is relevant to the query.
        """)
    var intent: Intent

    @Guide(description: """
        Comma-separated EXACT symbol names copied verbatim from the candidate list.
        For 'path', exactly two names ordered source then destination. Empty if none.
        """)
    var selected: String

    @Guide(description: "One sentence explaining the selection.")
    var reasoning: String
}

// MARK: - System prompt

let systemPrompt = """
You are a code-search query planner. You read a query about a codebase and a list of candidate symbols, and you pick the candidates that best answer the query.

The user message contains the query followed by a "Candidate symbols:" list. Each candidate is formatted as `name (kind)` — copy ONLY the `name` part, never the `(kind)` suffix.

Choose an intent:
- path: the query asks how control or data flows between two endpoints (e.g. "how does X reach Y", "trace X to Y"). Pick exactly TWO candidates — the source and the destination — and put them in `selected`, comma-separated, in that order.
- symbol: the query asks to find or read a symbol, or about one symbol's relationships (who calls it / what it calls). Pick the relevant candidate(s).
- none: none of the candidates is relevant to the query.

Rules:
- `selected` must contain ONLY exact names copied verbatim from the candidate list (case-sensitive), comma-separated, WITHOUT the `(kind)` suffix. Never invent names that are not in the list.
- Prefer the fewest, most confident selections. Leave `selected` empty for `none`.
- Fill intent first, then selected, then reasoning.
"""

// MARK: - Formatting

struct JSONOutput: Encodable {
    let intent: String
    let selected: String
    let reasoning: String
}

func formatResult(_ plan: QueryPlan, jsonMode: Bool) -> String {
    if jsonMode {
        let output = JSONOutput(
            intent: plan.intent.rawValue,
            selected: plan.selected,
            reasoning: plan.reasoning
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        if let data = try? encoder.encode(output), let str = String(data: data, encoding: .utf8) {
            return str
        }
        return "{}"
    }

    return """
    Intent:    \(plan.intent.rawValue)
    Selected:  \(plan.selected.isEmpty ? "(none)" : plan.selected)
    Reasoning: \(plan.reasoning)
    """
}

// MARK: - Entry point

@main
struct NLQuery {
    static func main() async {
        let args = Array(CommandLine.arguments.dropFirst())

        if args.isEmpty {
            printUsage()
            return
        }

        var jsonMode = true
        var diagnoseTokens = false
        var promptArgs: [String] = []
        var parsingFlags = true

        for arg in args {
            if !parsingFlags {
                promptArgs.append(arg)
            } else if arg == "--" {
                parsingFlags = false
            } else if arg == "--help" || arg == "-h" {
                printUsage()
                return
            } else if arg == "--version" || arg == "-v" {
                print("nl-query 0.2.0")
                return
            } else if arg == "--json" {
                jsonMode = true
            } else if arg == "--text" {
                jsonMode = false
            } else if arg == "--tokens" {
                diagnoseTokens = true
            } else if arg.hasPrefix("-") && arg.count > 1 {
                fputs("error: unknown option '\(arg)'\n", stderr)
                exit(1)
            } else {
                promptArgs.append(arg)
                parsingFlags = false
            }
        }

        let prompt = promptArgs.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)

        guard !prompt.isEmpty else {
            fputs("error: no query provided\n", stderr)
            exit(1)
        }

        do {
            let model = SystemLanguageModel(guardrails: .permissiveContentTransformations)

            guard model.isAvailable else {
                fputs("error: Apple Intelligence is not available on this device.\n", stderr)
                fputs("       Requires macOS 26 (Tahoe) with Apple Intelligence enabled.\n", stderr)
                exit(1)
            }

            let segment = Transcript.TextSegment(content: systemPrompt)
            let instructions = Transcript.Instructions(
                segments: [.text(segment)],
                toolDefinitions: []
            )
            let session = LanguageModelSession(
                model: model,
                transcript: Transcript(entries: [.instructions(instructions)])
            )

            if diagnoseTokens {
                print("contextSize: \(model.contextSize) tokens")
                if #available(macOS 26.4, *) {
                    print("system prompt: \(try await model.tokenCount(for: systemPrompt)) tokens")
                    print("generation schema: \(try await model.tokenCount(for: QueryPlan.generationSchema)) tokens")
                    print("prompt (query + candidates): \(try await model.tokenCount(for: prompt)) tokens")
                }
                return
            }

            let response: LanguageModelSession.Response<QueryPlan> =
                try await session.respond(
                    to: prompt,
                    generating: QueryPlan.self,
                    options: GenerationOptions(sampling: .greedy, maximumResponseTokens: 256)
                )

            print(formatResult(response.content, jsonMode: jsonMode))
        } catch {
            fputs("error: \(error.localizedDescription)\n", stderr)
            exit(1)
        }
    }

    static func printUsage() {
        print("""
        nl-query — pick relevant symbols from a candidate list for a code query

        Usage:
          nl-query [options] <query-with-candidate-list>

        Options:
          --json    Output result as JSON (default)
          --text    Output human-readable text
          --tokens  Print context-window token breakdown and exit
          --version Show version
          --help    Show this help

        Requirements:
          macOS 26 (Tahoe) — uses Apple's on-device 3B model (Neural Engine)
        """)
    }
}
