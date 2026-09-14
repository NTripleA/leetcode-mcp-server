import logger from "../utils/logger.js";
import { LeetCodeSite } from "./credentials-store.js";

const LOGIN_URLS: Record<LeetCodeSite, string> = {
    global: "https://leetcode.com/accounts/login/",
    cn: "https://leetcode.cn/accounts/login/"
};

const SESSION_COOKIE_NAME = "LEETCODE_SESSION";

export type BrowserLoginOptions = {
    timeoutMs?: number;
    pollIntervalMs?: number;
};

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchBrowser() {
    // playwright-core doesn't bundle a browser download; it drives the
    // user's already-installed Chrome/Edge instead, so importing it is kept
    // lazy and confined to this module.
    const { chromium } = await import("playwright-core");

    for (const channel of ["chrome", "msedge"] as const) {
        try {
            return await chromium.launch({ headless: false, channel });
        } catch {
            // try the next channel
        }
    }

    throw new Error(
        "Could not launch a browser for sign-in. Please install Google Chrome " +
            "or Microsoft Edge, then try again."
    );
}

/**
 * Opens a real, visible browser window at the LeetCode login page, waits for
 * the user to sign in manually, and returns the resulting LEETCODE_SESSION
 * cookie value once it appears.
 *
 * @param site - 'global' or 'cn'
 * @param options - Optional timeout/poll interval overrides
 */
export async function performBrowserLogin(
    site: LeetCodeSite,
    options?: BrowserLoginOptions
): Promise<string> {
    const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
    const pollIntervalMs = options?.pollIntervalMs ?? 1000;

    const browser = await launchBrowser();

    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(LOGIN_URLS[site]);

        logger.info(
            "Waiting for LeetCode sign-in to complete in the opened browser window..."
        );

        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (!browser.isConnected()) {
                throw new Error(
                    "Login window was closed before sign-in completed."
                );
            }

            const cookies = await context.cookies();
            const sessionCookie = cookies.find(
                (cookie) => cookie.name === SESSION_COOKIE_NAME && cookie.value
            );
            if (sessionCookie) {
                return sessionCookie.value;
            }

            await sleep(pollIntervalMs);
        }

        throw new Error(
            `Timed out after ${Math.round(timeoutMs / 1000)}s waiting for LeetCode sign-in.`
        );
    } finally {
        if (browser.isConnected()) {
            await browser.close();
        }
    }
}
