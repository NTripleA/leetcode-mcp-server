import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    getCredentialsFilePath,
    loadStoredSession,
    saveStoredSession
} from "../../src/auth/credentials-store.js";

describe("credentials-store", () => {
    let baseDir: string;

    beforeEach(() => {
        baseDir = mkdtempSync(join(tmpdir(), "leetcode-mcp-test-"));
    });

    afterEach(() => {
        rmSync(baseDir, { recursive: true, force: true });
    });

    it("returns undefined when nothing has been saved", () => {
        expect(loadStoredSession("global", baseDir)).toBeUndefined();
    });

    it("round-trips a saved session for a site", () => {
        saveStoredSession("global", "abc123", baseDir);
        expect(loadStoredSession("global", baseDir)).toBe("abc123");
        expect(loadStoredSession("cn", baseDir)).toBeUndefined();
    });

    it("keeps sessions for different sites independent", () => {
        saveStoredSession("global", "global-session", baseDir);
        saveStoredSession("cn", "cn-session", baseDir);

        expect(loadStoredSession("global", baseDir)).toBe("global-session");
        expect(loadStoredSession("cn", baseDir)).toBe("cn-session");
    });

    it("overwrites a previously saved session for the same site", () => {
        saveStoredSession("global", "first", baseDir);
        saveStoredSession("global", "second", baseDir);

        expect(loadStoredSession("global", baseDir)).toBe("second");
    });

    it("restricts file and directory permissions to the owner", () => {
        saveStoredSession("global", "abc123", baseDir);

        const filePath = getCredentialsFilePath(baseDir);
        const fileMode = statSync(filePath).mode & 0o777;
        const dirMode =
            statSync(join(baseDir, ".leetcode-mcp-server")).mode & 0o777;

        expect(fileMode).toBe(0o600);
        expect(dirMode).toBe(0o700);
    });
});
