import { App } from "obsidian";
import type { Feed, FeedItem } from "../types/types";

/**
 * Debug logger that writes per-feed log files tracking article read status
 * across refreshes. Helps diagnose issues where read articles appear as unread.
 *
 * Log files are written to: <plugin-dir>/debug-logs/<sanitized-feed-title>.log
 */
export class FeedDebugLogger {
  private app: App;
  private pluginDir: string;
  private logDir: string;

  constructor(app: App, pluginDir: string) {
    this.app = app;
    this.pluginDir = pluginDir;
    this.logDir = `${pluginDir}/debug-logs`;
  }

  private sanitizeFeedTitle(title: string): string {
    return title
      .replace(/[^a-zA-Z0-9_\- ]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 80);
  }

  private getLogPath(feed: Feed): string {
    const safeName = this.sanitizeFeedTitle(feed.title || "unknown");
    return `${this.logDir}/${safeName}.log`;
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private buildArticleSummary(items: FeedItem[]): string {
    const readCount = items.filter((i) => i.read).length;
    const unreadCount = items.filter((i) => !i.read).length;
    const lines: string[] = [];
    lines.push(`  Total: ${items.length} | Read: ${readCount} | Unread: ${unreadCount}`);
    lines.push(`  Articles:`);
    for (const item of items) {
      const status = item.read ? "READ" : "UNREAD";
      lines.push(`    [${status}] ${item.link || item.guid || "(no link)"}`);
    }
    return lines.join("\n");
  }

  private async appendLog(feed: Feed, content: string): Promise<void> {
    try {
      const logPath = this.getLogPath(feed);
      const adapter = this.app.vault.adapter;

      if (!(await adapter.exists(this.logDir))) {
        await adapter.mkdir(this.logDir);
      }

      let existing = "";
      if (await adapter.exists(logPath)) {
        existing = await adapter.read(logPath);
      }

      await adapter.write(logPath, existing + content + "\n");
    } catch (e) {
      console.error(`[RSS debug-logger] Failed to write log for "${feed.title}":`, e);
    }
  }

  /**
   * Log the current state of articles on plugin startup.
   */
  async logStartup(feeds: Feed[]): Promise<void> {
    for (const feed of feeds) {
      const header = `=== PLUGIN STARTUP === ${this.formatTimestamp()} ===\n`;
      const summary = this.buildArticleSummary(feed.items);
      await this.appendLog(feed, header + summary);
    }
  }

  /**
   * Log the state of articles just before a feed refresh begins.
   */
  async logPreRefresh(feed: Feed): Promise<void> {
    const header = `--- PRE-REFRESH --- ${this.formatTimestamp()} ---\n`;
    const summary = this.buildArticleSummary(feed.items);
    await this.appendLog(feed, header + summary);
  }

  /**
   * Log the raw server response (parsed item GUIDs/links) from a feed fetch.
   */
  async logServerResponse(
    feed: Feed,
    serverItems: Array<{ guid?: string; link?: string; title?: string }>,
  ): Promise<void> {
    const header = `--- SERVER RESPONSE --- ${this.formatTimestamp()} ---\n`;
    const lines: string[] = [];
    lines.push(`  Items from server: ${serverItems.length}`);
    for (const item of serverItems) {
      lines.push(`    ${item.link || item.guid || "(no link)"} — "${item.title || "(no title)"}"`);
    }
    await this.appendLog(feed, header + lines.join("\n"));
  }

  /**
   * Log the state of articles after a feed refresh completes.
   */
  async logPostRefresh(feed: Feed): Promise<void> {
    const header = `--- POST-REFRESH --- ${this.formatTimestamp()} ---\n`;
    const summary = this.buildArticleSummary(feed.items);
    await this.appendLog(feed, header + summary);
  }
}
