import { DurableObject } from "cloudflare:workers";
import { type CorsEnv, getCorsHeaders } from "@/lib/cors";
import { createLogger, type RequestLogger } from "@/lib/logger";

const PING_INTERVAL_MS = 30000; // 30 seconds
const NOTIFICATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const HISTORY_KEY_PREFIX = "history:";

export interface NotificationPayload {
	type: string;
	title: string;
	message: string;
	data?: Record<string, any>;
	timestamp: number;
	/** Set by server for durable history; used for dismiss */
	id?: string;
}

export interface NotificationSubscriber {
	userId: string;
	writer: WritableStreamDefaultWriter;
	lastPing: number;
	abortSignal?: AbortSignal;
}

export class NotificationHub extends DurableObject {
	private subscribers: Map<string, NotificationSubscriber> = new Map();
	private pingInterval: ReturnType<typeof setInterval> | null = null;
	private logger: RequestLogger;
	private bindings: CorsEnv;

	constructor(ctx: DurableObjectState, env: CorsEnv) {
		super(ctx, env);
		this.bindings = env;
		this.logger = createLogger(
			env as unknown as Record<string, unknown>,
			"[NotificationHub]"
		);
		this.startPingInterval();
		// Clean up expired notifications on initialization
		this.cleanupExpiredNotifications().catch(() => {
			// Ignore errors during cleanup
		});
	}

	/**
	 * Add a notification to durable history (replayed on connect until cleared or TTL).
	 * Assigns payload.id and returns the payload with id set.
	 */
	private async addToHistory(
		payload: NotificationPayload
	): Promise<NotificationPayload> {
		const ts = payload.timestamp;
		const randomId = crypto.randomUUID();
		const id = `${ts}:${randomId}`;
		const key = `${HISTORY_KEY_PREFIX}${id}`;
		const withId = { ...payload, id };

		try {
			await this.ctx.storage.put(key, withId);
			this.logger.trace(`History added: ${payload.type} (id: ${id})`);
		} catch (error) {
			this.logger.error("Failed to add to history:", error);
			throw error;
		}
		return withId;
	}

	/**
	 * Get all notifications in history that are within the TTL window (newest first).
	 */
	private async getHistory(): Promise<NotificationPayload[]> {
		const now = Date.now();
		const cutoffTime = now - NOTIFICATION_TTL_MS;
		const list: NotificationPayload[] = [];

		try {
			const all = await this.ctx.storage.list<NotificationPayload>({
				prefix: HISTORY_KEY_PREFIX,
			});
			for (const [, payload] of all.entries()) {
				if (payload.timestamp >= cutoffTime) {
					list.push(payload);
				}
			}
			list.sort((a, b) => b.timestamp - a.timestamp);
		} catch (error) {
			this.logger.error("Failed to get history:", error);
		}
		return list;
	}

	/**
	 * Clean up expired notifications from history (older than TTL).
	 */
	private async cleanupExpiredNotifications(): Promise<void> {
		const now = Date.now();
		const cutoffTime = now - NOTIFICATION_TTL_MS;
		const expiredKeys: string[] = [];

		try {
			const all = await this.ctx.storage.list<NotificationPayload>({
				prefix: HISTORY_KEY_PREFIX,
			});
			for (const [key, payload] of all.entries()) {
				if (payload.timestamp < cutoffTime) {
					expiredKeys.push(key);
				}
			}
			if (expiredKeys.length > 0) {
				await this.ctx.storage.delete(expiredKeys);
				this.logger.debug(
					`Cleaned up ${expiredKeys.length} expired notifications`
				);
			}
		} catch (error) {
			this.logger.error("Failed to cleanup expired notifications:", error);
		}
	}

	/**
	 * Handle SSE connection requests
	 */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname.endsWith("/subscribe")) {
			return this.handleSubscribe(request);
		}

		if (url.pathname.endsWith("/publish")) {
			return this.handlePublish(request);
		}

		if (url.pathname.endsWith("/dismiss")) {
			return this.handleDismiss(request);
		}

		if (url.pathname.endsWith("/clear")) {
			return this.handleClear(request);
		}

		return new Response("Not Found", { status: 404 });
	}

	/**
	 * Handle SSE subscription
	 */
	private async handleSubscribe(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const userId = url.searchParams.get("userId");

		if (!userId) {
			return new Response("Missing userId", { status: 400 });
		}

		const isReconnect = this.subscribers.has(userId);

		// Check if this is a reconnection (user already exists)
		if (isReconnect) {
			const oldSubscriber = this.subscribers.get(userId);
			if (oldSubscriber) {
				try {
					await oldSubscriber.writer.close();
				} catch (_error) {
					// Ignore error closing old connection
				}
			}
			this.subscribers.delete(userId);
		}

		// Clean up expired notifications (fire-and-forget)
		this.cleanupExpiredNotifications().catch(() => {
			// Ignore errors during cleanup
		});

		// Get durable history (replay until cleared or TTL)
		const history = await this.getHistory();

		// Create SSE stream
		const { readable, writable } = new TransformStream();
		const writer = writable.getWriter();
		const encoder = new TextEncoder();

		// Store subscriber
		const subscriber: NotificationSubscriber = {
			userId,
			writer,
			lastPing: Date.now(),
			abortSignal: request.signal || undefined,
		};

		this.subscribers.set(userId, subscriber);
		if (isReconnect) {
			this.logger.debug(
				`Subscriber reconnected: ${userId}. Total: ${this.subscribers.size}`
			);
		} else {
			this.logger.info(
				`Subscriber connected: ${userId}. Total: ${this.subscribers.size}`
			);
		}

		// Replay history first (newest first), then send "connected"
		const deliveryPromise =
			history.length > 0
				? (async () => {
						this.logger.debug(
							`Replaying ${history.length} notifications to ${userId}`
						);
						for (let i = 0; i < history.length; i++) {
							const payload = history[i];
							try {
								await this.sendSSEMessage(writer, encoder, payload);
							} catch (error) {
								const errorMessage =
									error instanceof Error ? error.message : String(error);
								this.logger.error(
									`Failed to replay notification ${i + 1}/${history.length}: ${errorMessage}`
								);
								if (
									errorMessage.includes("writer") ||
									errorMessage.includes("stream") ||
									errorMessage.includes("closed")
								) {
									break;
								}
							}
						}
					})()
				: Promise.resolve();

		deliveryPromise.catch((error) => {
			this.logger.error("Error replaying history:", error);
		});

		// Send connection message after history replay (writes are queued)
		this.sendSSEMessage(writer, encoder, {
			type: "connected",
			title: "Connected",
			message: "Notification stream established",
			timestamp: Date.now(),
		}).catch(() => {});

		// Handle client disconnect
		request.signal?.addEventListener("abort", () => {
			this.logger.debug(`Connection aborted for subscriber: ${userId}`);
			this.subscribers.delete(userId);
			// Close writer asynchronously (don't await, but handle errors)
			writer.close().catch(() => {
				// Ignore errors when closing aborted connections
			});
		});

		const response = new Response(readable, {
			headers: {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache",
				Connection: "keep-alive",
				"Access-Control-Allow-Headers": "Cache-Control",
				...getCorsHeaders(request, this.bindings),
			},
		});

		return response;
	}

	/**
	 * Handle notification publishing
	 */
	private async handlePublish(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			const payload: NotificationPayload = await request.json();
			// Ensure timestamp for history
			const withTs = {
				...payload,
				timestamp: payload.timestamp ?? Date.now(),
			};
			// Always add to durable history (assigns id); replay on next connect until cleared or TTL
			const withId = await this.addToHistory(withTs);
			// Broadcast to connected subscribers so they see it live
			await this.broadcastNotification(withId);

			return new Response(JSON.stringify({ success: true }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (_error) {
			return new Response("Invalid JSON", { status: 400 });
		}
	}

	/**
	 * Handle dismiss (remove one notification from history)
	 */
	private async handleDismiss(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}
		try {
			const body = (await request.json()) as { id?: string };
			const id = body?.id;
			if (!id || typeof id !== "string") {
				return new Response(
					JSON.stringify({ success: false, error: "Missing id" }),
					{ status: 400, headers: { "Content-Type": "application/json" } }
				);
			}
			const key = `${HISTORY_KEY_PREFIX}${id}`;
			await this.ctx.storage.delete(key);
			this.logger.debug(`Dismissed notification: ${id}`);
			return new Response(JSON.stringify({ success: true }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (_error) {
			return new Response("Invalid JSON", { status: 400 });
		}
	}

	/**
	 * Handle clear (remove all notifications from history)
	 */
	private async handleClear(request: Request): Promise<Response> {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}
		try {
			const all = await this.ctx.storage.list({ prefix: HISTORY_KEY_PREFIX });
			const keys = Array.from(all.keys());
			if (keys.length > 0) {
				await this.ctx.storage.delete(keys);
				this.logger.debug(`Cleared ${keys.length} notifications`);
			}
			return new Response(JSON.stringify({ success: true }), {
				headers: { "Content-Type": "application/json" },
			});
		} catch (error) {
			this.logger.error("Failed to clear notifications:", error);
			return new Response("Internal Server Error", { status: 500 });
		}
	}

	/**
	 * Broadcast notification to all connected subscribers (live delivery only).
	 */
	async broadcastNotification(payload: NotificationPayload): Promise<void> {
		if (this.subscribers.size === 0) {
			this.logger.debug(
				`No subscribers, notification stored in history: ${payload.type}`
			);
			return;
		}

		const encoder = new TextEncoder();
		const deadSubscribers: string[] = [];

		this.logger.debug(
			`Broadcasting: ${payload.type}. Subscribers: ${this.subscribers.size}`
		);

		for (const [userId, subscriber] of this.subscribers.entries()) {
			if (subscriber.abortSignal?.aborted) {
				deadSubscribers.push(userId);
				continue;
			}
			if (subscriber.writer.desiredSize === null) {
				deadSubscribers.push(userId);
				continue;
			}
			try {
				await this.sendSSEMessage(subscriber.writer, encoder, payload);
				subscriber.lastPing = Date.now();
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				this.logger.warn(
					`Failed to broadcast to subscriber ${userId}: ${errorMessage}`
				);
				deadSubscribers.push(userId);
			}
		}

		for (const userId of deadSubscribers) {
			this.subscribers.delete(userId);
		}
	}

	/**
	 * Send SSE message to a specific subscriber
	 */
	private async sendSSEMessage(
		writer: WritableStreamDefaultWriter,
		encoder: TextEncoder,
		payload: NotificationPayload
	): Promise<void> {
		// Check if writer is closed before attempting to write
		// desiredSize is null when the stream is closed
		if (writer.desiredSize === null) {
			throw new Error("Writer is closed - connection terminated");
		}

		const data = JSON.stringify(payload);
		const message = `data: ${data}\n\n`;

		try {
			await writer.write(encoder.encode(message));
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			const errorName = error instanceof Error ? error.name : "UnknownError";
			throw new Error(
				`Failed to send SSE message: ${errorName}: ${errorMessage}`
			);
		}
	}

	/**
	 * Start ping interval to keep connections alive
	 */
	private startPingInterval(): void {
		this.pingInterval = setInterval(() => {
			this.sendPing();
		}, PING_INTERVAL_MS);
	}

	/**
	 * Send ping to all subscribers
	 */
	private async sendPing(): Promise<void> {
		const encoder = new TextEncoder();
		const deadSubscribers: string[] = [];

		for (const [userId, subscriber] of this.subscribers.entries()) {
			// Check if writer is closed before attempting to write
			if (subscriber.writer.desiredSize === null) {
				this.logger.trace(
					`Detected closed writer for subscriber: ${userId} (during ping)`
				);
				deadSubscribers.push(userId);
				continue;
			}

			try {
				const pingMessage = `: ping\n\n`;
				await subscriber.writer.write(encoder.encode(pingMessage));
				subscriber.lastPing = Date.now();
			} catch (_error) {
				// Clean up the failed subscriber immediately
				this.logger.debug(`Ping failed for subscriber: ${userId}, cleaning up`);
				try {
					await subscriber.writer.close();
				} catch (_closeError) {
					// Ignore close errors
				}
				deadSubscribers.push(userId);
			}
		}

		// Clean up dead subscribers
		for (const userId of deadSubscribers) {
			this.subscribers.delete(userId);
		}
	}

	/**
	 * Get subscriber count (for debugging)
	 */
	getSubscriberCount(): number {
		return this.subscribers.size;
	}

	/**
	 * Cleanup on destroy
	 */
	async destroy(): Promise<void> {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
		}

		// Close all connections
		for (const subscriber of this.subscribers.values()) {
			try {
				await subscriber.writer.close();
			} catch (_error) {
				// Ignore errors when closing
			}
		}

		this.subscribers.clear();
	}
}
