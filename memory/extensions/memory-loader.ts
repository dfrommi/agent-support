/**
 * Memory Loader Extension
 *
 * Automatically loads project memory (INDEX.md) into the agent's context
 * and warns when there are unprocessed sessions.
 *
 * When `.agents/memory/INDEX.md` exists:
 *   - Its content is appended to the system prompt on every turn.
 *   - On startup, checks for sessions that haven't been ingested yet and
 *     notifies you if any are found.
 *
 * INDEX.md itself tells the agent what's in the other memory files
 * (DECISIONS.md, PREFERENCES.md, etc.) and when to consult them.
 *
 * Installation (pick one):
 *   1. Project-local:  ln -s /path/to/agent-support/memory/memory-loader.ts .pi/extensions/memory-loader.ts
 *   2. Global:          cp memory/memory-loader.ts ~/.pi/agent/extensions/
 *   3. CLI flag:        pi -e /path/to/this/file
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Derive the Pi session directory from CWD.
 * /Users/dennis/my/project → ~/.pi/agent/sessions/--Users-dennis-my-project--
 */
function getSessionDir(cwd: string): string {
    const encoded = "--" + cwd.replace(/^\//, "").replace(/\//g, "-") + "--";
    return path.join(os.homedir(), ".pi", "agent", "sessions", encoded);
}

/**
 * Extract the session UUID from a session filename.
 * "2026-05-14T21-32-16-237Z_019e2867-8fec-71bf-ae3c-a023c077cbaa.jsonl"
 * → "019e2867-8fec-71bf-ae3c-a023c077cbaa"
 */
function extractSessionId(filename: string): string | null {
    const match = filename.match(/_(.{36})\.jsonl$/);
    return match ? match[1] : null;
}

function countUnprocessedSessions(cwd: string): number {
    const sessionDir = getSessionDir(cwd);
    const processedDir = path.join(cwd, ".memory-pipeline", "processed");

    if (!fs.existsSync(sessionDir)) return 0;

    const sessionFiles = fs.readdirSync(sessionDir).filter(f => f.endsWith(".jsonl"));

    // Gather processed session IDs
    const processed = new Set<string>();
    if (fs.existsSync(processedDir)) {
        for (const f of fs.readdirSync(processedDir)) {
            processed.add(f);
        }
    }

    let unprocessed = 0;
    for (const f of sessionFiles) {
        const id = extractSessionId(f);
        if (id && !processed.has(id)) {
            unprocessed++;
        }
    }
    return unprocessed;
}

export default function memoryLoaderExtension(pi: ExtensionAPI) {
    let memoryIndexPath = "";
    let memoryIndexContent = "";

    pi.on("session_start", async (_event, ctx) => {
        memoryIndexPath = path.join(ctx.cwd, ".agents", "memory", "INDEX.md");

        if (!fs.existsSync(memoryIndexPath)) {
            memoryIndexContent = "";
            return;
        }

        memoryIndexContent = fs.readFileSync(memoryIndexPath, "utf-8").trim();
        if (!memoryIndexContent) return;

        ctx.ui.notify("Project memory loaded from .agents/memory/", "info");

        // Warn about unprocessed sessions
        const unprocessed = countUnprocessedSessions(ctx.cwd);
        if (unprocessed > 0) {
            const processedDir = path.join(ctx.cwd, ".memory-pipeline", "processed");
            if (!fs.existsSync(processedDir)) {
                // First run — many sessions, one-time setup reminder
                ctx.ui.notify(
                    `${unprocessed} sessions to ingest. Run memory/ingest-sessions.sh to build initial memory.`,
                    "info",
                );
            } else {
                ctx.ui.notify(
                    `${unprocessed} unprocessed session(s). Run memory/ingest-sessions.sh to update memory.`,
                    "warning",
                );
            }
        }
    });

    // Append memory index to system prompt on every turn
    pi.on("before_agent_start", async (event) => {
        if (memoryIndexPath && fs.existsSync(memoryIndexPath)) {
            memoryIndexContent = fs.readFileSync(memoryIndexPath, "utf-8").trim();
        }

        if (!memoryIndexContent) return;

        return {
            systemPrompt:
                event.systemPrompt +
                "\n\n" +
                memoryIndexContent +
                "\n\n---\nUse the read tool to load individual memory files (.agents/memory/*.md) when relevant to the current task.",
        };
    });
}
