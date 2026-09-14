import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type LeetCodeSite = "global" | "cn";

type StoredCredentials = {
    [site in LeetCodeSite]?: {
        session: string;
        savedAt: string;
    };
};

/**
 * Resolves the path to the local credentials file, defaulting to a dotfile
 * under the user's home directory.
 *
 * @param baseDir - Override for the base directory (used in tests)
 */
export function getCredentialsFilePath(baseDir: string = os.homedir()): string {
    return path.join(baseDir, ".leetcode-mcp-server", "credentials.json");
}

function readStore(baseDir?: string): StoredCredentials {
    const filePath = getCredentialsFilePath(baseDir);
    if (!fs.existsSync(filePath)) {
        return {};
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
        return {};
    }
}

/**
 * Loads a previously captured LeetCode session cookie for the given site, if any.
 *
 * @param site - 'global' or 'cn'
 * @param baseDir - Override for the base directory (used in tests)
 */
export function loadStoredSession(
    site: LeetCodeSite,
    baseDir?: string
): string | undefined {
    return readStore(baseDir)[site]?.session;
}

/**
 * Persists a captured LeetCode session cookie for the given site to the local
 * credentials file, restricting file/directory permissions to the owner only.
 *
 * @param site - 'global' or 'cn'
 * @param session - Raw LEETCODE_SESSION cookie value
 * @param baseDir - Override for the base directory (used in tests)
 */
export function saveStoredSession(
    site: LeetCodeSite,
    session: string,
    baseDir?: string
): void {
    const filePath = getCredentialsFilePath(baseDir);
    const dir = path.dirname(filePath);

    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dir, 0o700);

    const store = readStore(baseDir);
    store[site] = { session, savedAt: new Date().toISOString() };

    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), {
        mode: 0o600
    });
    fs.chmodSync(filePath, 0o600);
}
