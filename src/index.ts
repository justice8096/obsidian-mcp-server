#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  SERVER_NAME,
  SERVER_VERSION,
  VAULT_PATH,
  CHARACTER_LIMIT,
} from "./constants.js";
import {
  readNote,
  writeNote,
  appendToNote,
  listNotes,
  searchVault,
  readFrontmatter,
  resolveWikilinks,
} from "./vault.js";

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

/** Wrap a handler so VaultErrors return actionable messages instead of throwing. */
function ok(structured: unknown, text?: string) {
  return {
    content: [
      { type: "text" as const, text: text ?? JSON.stringify(structured, null, 2) },
    ],
    structuredContent: structured as Record<string, unknown>,
  };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `Error: ${message}` }],
  };
}

function clamp(text: string): string {
  return text.length > CHARACTER_LIMIT
    ? text.slice(0, CHARACTER_LIMIT) + "\n\n[...truncated...]"
    : text;
}

server.registerTool(
  "obsidian_read_note",
  {
    title: "Read Obsidian Note",
    description:
      "Read the full markdown content of a note in the vault. Path is relative to the vault root; the .md extension is optional. Read-only.",
    inputSchema: {
      path: z
        .string()
        .min(1)
        .describe("Vault-relative path, e.g. 'Projects/Obsidian-MCP-Server.md'"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ path: notePath }) => {
    try {
      const content = await readNote(notePath);
      return ok({ path: notePath, content: clamp(content) }, clamp(content));
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "obsidian_write_note",
  {
    title: "Write Obsidian Note",
    description:
      "Create a new note or overwrite an existing one. Refuses to overwrite unless overwrite=true. Parent folders are created automatically.",
    inputSchema: {
      path: z.string().min(1).describe("Vault-relative path for the note"),
      content: z.string().describe("Full markdown content to write"),
      overwrite: z
        .boolean()
        .default(false)
        .describe("Allow replacing an existing note (default false)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ path: notePath, content, overwrite }) => {
    try {
      const res = await writeNote(notePath, content, overwrite);
      return ok(res, `${res.created ? "Created" : "Updated"} ${res.path}`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "obsidian_append_to_note",
  {
    title: "Append to Obsidian Note",
    description:
      "Append markdown to the end of a note, creating it if it does not exist. A newline is inserted before appended content when the note already has content.",
    inputSchema: {
      path: z.string().min(1).describe("Vault-relative path for the note"),
      content: z.string().min(1).describe("Markdown to append"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async ({ path: notePath, content }) => {
    try {
      const res = await appendToNote(notePath, content);
      return ok(res, `Appended to ${res.path}`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "obsidian_list_notes",
  {
    title: "List Obsidian Notes",
    description:
      "List markdown notes in the vault, optionally scoped to a folder. Hidden folders (.obsidian, .git) are skipped. Read-only.",
    inputSchema: {
      folder: z
        .string()
        .default("")
        .describe("Vault-relative folder to list; empty for the whole vault"),
      recursive: z
        .boolean()
        .default(true)
        .describe("Recurse into subfolders (default true)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ folder, recursive }) => {
    try {
      const notes = await listNotes(folder, recursive);
      return ok({ count: notes.length, notes });
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "obsidian_search_vault",
  {
    title: "Search Obsidian Vault",
    description:
      "Case-insensitive full-text search across note bodies. Returns matching file path, line number, and the matching line. Read-only.",
    inputSchema: {
      query: z.string().min(1).describe("Text to search for"),
      folder: z
        .string()
        .default("")
        .describe("Limit search to this vault-relative folder; empty for all"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(50)
        .describe("Maximum number of matches to return (default 50)"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ query, folder, limit }) => {
    try {
      const matches = await searchVault(query, folder, limit);
      return ok({ query, count: matches.length, matches });
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "obsidian_read_frontmatter",
  {
    title: "Read Note Frontmatter",
    description:
      "Parse and return the YAML frontmatter of a note as structured data, plus a short body preview. Read-only.",
    inputSchema: {
      path: z.string().min(1).describe("Vault-relative path for the note"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ path: notePath }) => {
    try {
      const res = await readFrontmatter(notePath);
      return ok(res);
    } catch (err) {
      return fail(err);
    }
  }
);

server.registerTool(
  "obsidian_resolve_wikilinks",
  {
    title: "Resolve Note Wikilinks",
    description:
      "Extract [[wikilinks]] from a note and resolve each to an actual vault file by basename. Handles [[Note|alias]] and [[Note#heading]]. Unresolved links return target=null. Read-only.",
    inputSchema: {
      path: z.string().min(1).describe("Vault-relative path for the note"),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async ({ path: notePath }) => {
    try {
      const links = await resolveWikilinks(notePath);
      const unresolved = links.filter((l) => l.target === null).length;
      return ok({ count: links.length, unresolved, links });
    } catch (err) {
      return fail(err);
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is reserved for the MCP protocol.
  console.error(
    `${SERVER_NAME} v${SERVER_VERSION} running on stdio. Vault: ${VAULT_PATH}`
  );
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
