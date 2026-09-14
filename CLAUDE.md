# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An MCP server (`@jinzcdev/leetcode-mcp-server`) exposing LeetCode data as MCP tools and resources. It supports both leetcode.com ("global") and leetcode.cn ("cn"), and runs over stdio (default) or Streamable HTTP. Published to npm; `build/index.js` is the CLI entry point.

## Commands

```bash
npm install                 # also installs the husky pre-commit hook
npm run build               # tsc -> build/, then chmod +x build/index.js
npm run dev                 # tsc-watch, re-runs node build/index.js on success
npm start                   # node build/index.js
npm test                    # vitest run | pino-pretty
npm run test:watch
npm run lint / lint:fix     # eslint
npm run format              # prettier --write .
```

Run a single test file or test name:

```bash
npx vitest run tests/auth/credentials-store.test.ts
npx vitest run -t "fetchDailyChallenge"
```

Run the built server locally:

```bash
node build/index.js --site global                       # stdio, unauthenticated
node build/index.js --site cn --session <COOKIE>        # authenticated
node build/index.js --transport http --port 3000        # Streamable HTTP at /mcp
node build/index.js login --site global                 # browser sign-in, caches session
```

Every CLI flag has an env-var equivalent (`LEETCODE_SITE`, `LEETCODE_SESSION`, `LEETCODE_TRANSPORT`, `LEETCODE_HTTP_PORT`, `LEETCODE_HTTP_HOST`, `LEETCODE_HTTP_ENDPOINT`); flags win over env vars.

Notes on tooling:

- The pre-commit hook runs `lint-staged` (prettier + eslint --fix) and then `npm run build`, so a commit fails if the build fails.
- `tests/services/*.test.ts` hit the live LeetCode APIs over the network (30s timeouts, no mocks). `tests/auth` and `tests/utils` are pure unit tests. CI runs `npm test` then `npm run build` on Node 24.
- Prettier: 4-space indent, double quotes, no trailing commas, 80 cols, imports auto-organized by `prettier-plugin-organize-imports`.
- The project is ESM with `moduleResolution: NodeNext`, so relative imports between TS files must use the `.js` extension (`./foo.js`, not `./foo`).

## Architecture

Three layers, wired together in `src/index.ts`:

1. **Entry / transport** (`src/index.ts`, `src/transport/streamable-http.ts`). `main()` handles the `login` subcommand, parses args, resolves the session cookie (`--session`/env first, then the cached credentials file), builds a `LeetCodeBaseService` via `LeetCodeServiceFactory`, and connects an `McpServer`. Stdio creates one server; HTTP creates a fresh `McpServer` per MCP session (`createServer` callback) sharing the single service instance.

2. **Service layer** (`src/leetcode/`). `LeetCodeBaseService` is the interface every tool talks to. `LeetCodeGlobalService` and `LeetCodeCNService` implement it by wrapping the `leetcode-query` clients (`LeetCode` / `LeetCodeCN`) plus hand-written GraphQL documents under `src/leetcode/graphql/{global,cn}/` for queries the library doesn't cover (problem search, solution articles, CN notes). Code run/submit go through raw REST calls in `src/utils/leetcode-http.ts`, which builds the cookie + `x-csrftoken` headers from the `Credential` and polls the `check/` endpoint with 429 backoff. `isAuthenticated()` means the credential has both a session and a csrf token; `reauthenticate()` re-inits the same `Credential` object in place, so the running service picks up a new session without being rebuilt.

3. **MCP registration layer** (`src/common/registry-base.ts`, `src/mcp/tools/*`, `src/mcp/resources/*`). Every tool/resource group is a class extending `ToolRegistry` or `ResourceRegistry` (both thin wrappers over `RegistryBase`). `RegistryBase.register()` calls hook methods in a fixed order: `registerCommon` → `registerGlobal`|`registerChina` → (only if authenticated) `registerAuthenticatedCommon` → `registerAuthenticatedGlobal`|`registerAuthenticatedChina`. Override only the hooks you need. Each file also exports a `registerXxxTools(server, service)` helper that `createMcpServer()` in `index.ts` calls; new groups must be added there.

Consequences of this design worth knowing:

- Which tools exist is decided once at startup from `isAuthenticated()` and `isCN()`. The `leetcode_login` tool (registered unconditionally in `registerCommon`) can authenticate a running server, but authenticated tools won't appear until the client reconnects. This is documented behavior, not a bug.
- Site differences live in the hook split, not in `if (isCN())` branches inside tool handlers. Notes tools are CN-only (`registerAuthenticatedChina`); solution-article tools differ per site and use separate GraphQL files.
- Tool handlers return `{ content: [{ type: "text", text: JSON.stringify(...) }] }`, including for errors. Parameter schemas are zod; enum values for languages, categories and tags come from `src/common/constants.ts`.
- Auth persistence: `src/auth/credentials-store.ts` reads/writes `~/.leetcode-mcp-server/credentials.json` (0600, keyed by site; `baseDir` parameter exists for tests). `src/auth/browser-login.ts` lazily imports `playwright-core` and drives the user's installed Chrome or Edge (no bundled browser), polling cookies for `LEETCODE_SESSION`.
- Logging is pino JSON via `src/utils/logger.ts` with no destination configured, so it writes to stdout. In stdio transport stdout is also the MCP channel, so avoid adding chatty logging on request paths.

## When adding or changing tools

The README's "Available Tools", "Tool Parameters", and "Available Resources" tables are the user-facing contract, and there is a parallel `README_zh-CN.md`. Update both when a tool, parameter, or resource URI changes. `CHANGELOG.md` is maintained by hand; the npm-publish workflow refuses to publish if `package.json` version doesn't match the release tag.
