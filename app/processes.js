// processes.js — detect running apps that are not allowed during the exam
import { execFile } from "child_process";
import { promisify } from "util";

const run = promisify(execFile);

// Remote control, screen sharing, messaging and AI assistants. Matched on exact app name, case-insensitive.
export const RESTRICTED_APPS = [
    "zoom.us", "zoom", "microsoft teams", "ms-teams", "teams", "discord", "slack", "skype",
    "anydesk", "teamviewer", "obs", "obs64", "whatsapp", "telegram",
    "chatgpt", "claude", "copilot", "perplexity", "gemini"
];

// macOS `ps -axo comm=` → names of running .app bundles; Windows `tasklist /fo csv /nh` → image names without .exe
export function appNames(output, platform) {
    const names = new Set();
    for (const line of output.split(/\r?\n/)) {
        const name = platform === "win32"
            ? line.match(/^"([^"]+?)(?:\.exe)?"/i)?.[1]
            : line.match(/\/([^/]+)\.app\/Contents\/MacOS\//)?.[1];
        if (name) names.add(name);
    }
    return [...names];
}

export async function runningRestrictedApps() {
    const { stdout } = process.platform === "win32"
        ? await run("tasklist", ["/fo", "csv", "/nh"])
        : await run("ps", ["-axo", "comm="], { maxBuffer: 10 * 1024 * 1024 });
    return appNames(stdout, process.platform).filter((name) => RESTRICTED_APPS.includes(name.toLowerCase()));
}
