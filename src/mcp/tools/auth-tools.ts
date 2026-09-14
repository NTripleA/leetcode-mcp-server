import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { performBrowserLogin } from "../../auth/browser-login.js";
import { saveStoredSession } from "../../auth/credentials-store.js";
import { LeetCodeBaseService } from "../../leetcode/leetcode-base-service.js";
import logger from "../../utils/logger.js";
import { ToolRegistry } from "./tool-registry.js";

/**
 * Auth tool registry class that handles registration of the LeetCode sign-in tool.
 * Registered unconditionally (regardless of current auth state) so it can be used
 * to bootstrap authentication for an already-running server.
 */
export class AuthToolRegistry extends ToolRegistry {
    protected registerCommon(): void {
        this.server.tool(
            "leetcode_login",
            "Signs in to LeetCode by opening a real browser window for you to log in manually (handles password/captcha/2FA on LeetCode's own page). Once you finish logging in there, this tool captures the resulting session, applies it to the current server immediately, and caches it locally so future server starts are pre-authenticated. Already-authenticated tools you were calling before this completes may need the MCP connection reconnected to appear if they weren't available at server startup.",
            {
                force: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe(
                        "Sign in again even if a valid session is already active (e.g. to switch accounts)"
                    )
            },
            async ({ force }) => {
                if (this.isAuthenticated() && !force) {
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    status: "already_authenticated",
                                    message:
                                        "Already signed in to LeetCode. Pass force=true to sign in again."
                                })
                            }
                        ]
                    };
                }

                const site = this.isCN() ? "cn" : "global";

                try {
                    const session = await performBrowserLogin(site);
                    await this.leetcodeService.reauthenticate(session);
                    saveStoredSession(site, session);

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    status: "signed_in",
                                    message:
                                        "Signed in to LeetCode. The session is now active on this server and cached for future runs."
                                })
                            }
                        ]
                    };
                } catch (error: any) {
                    logger.error("LeetCode sign-in failed: %s", error);
                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify({
                                    error: "Failed to sign in to LeetCode",
                                    message: error.message
                                })
                            }
                        ]
                    };
                }
            }
        );
    }
}

/**
 * Registers the LeetCode sign-in tool with the MCP server.
 *
 * @param server - The MCP server instance to register tools with
 * @param leetcodeService - The LeetCode service implementation to use for API calls
 */
export function registerAuthTools(
    server: McpServer,
    leetcodeService: LeetCodeBaseService
): void {
    const registry = new AuthToolRegistry(server, leetcodeService);
    registry.registerTools();
}
