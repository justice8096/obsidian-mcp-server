# Obsidian MCP Server

An [MCP](https://modelcontextprotocol.io) server that lets Claude (and other MCP
clients) read, write, search, and manage an [Obsidian](https://obsidian.md)
vault as a native tool. Local filesystem access only, no cloud sync.

## Tools

| Tool | Description | Read-only |
|------|-------------|-----------|
| `obsidian_read_note` | Read a note's full markdown content | yes |
| `obsidian_write_note` | Create or overwrite a note (refuses overwrite unless asked) | no |
| `obsidian_append_to_note` | Append markdown to a note, creating it if missing | no |
| `obsidian_list_notes` | List notes in the vault or a folder | yes |
| `obsidian_search_vault` | Case-insensitive full-text search with line context | yes |
| `obsidian_read_frontmatter` | Parse a note's YAML frontmatter as structured data | yes |
| `obsidian_resolve_wikilinks` | Extract and resolve `[[wikilinks]]` to vault files | yes |

All paths are relative to the vault root. The `.md` extension is optional.
Paths are validated to stay inside the vault (no directory traversal).

## Setup

```bash
npm install
npm run build
```

The vault location is set with the `OBSIDIAN_VAULT_PATH` environment variable.
If unset, it defaults to `D:\SecondBrainData` on Windows or `~/Obsidian`
elsewhere.

## Configure in an MCP client

Add to your client's MCP config (example for a stdio client):

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "node",
      "args": ["D:\\obsidian-mcp-server\\dist\\index.js"],
      "env": {
        "OBSIDIAN_VAULT_PATH": "D:\\SecondBrainData"
      }
    }
  }
}
```

## Develop

```bash
npm run dev        # run from source with tsx
npm run typecheck  # type-check without emitting
npm run inspect    # launch the MCP Inspector against the server
```

## Roadmap

- Semantic/vector search (embed notes, query by meaning)
- Dataview query passthrough
- Template-aware note creation
- Backlink graph traversal

## License

MIT
