import { DurableObject } from "cloudflare:workers";

const PING_INTERVAL_MS = 30000; // 30 seconds
const NOTIFICATION_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const QUEUE_KEY_PREFIX = "queued_notification:";

export interface NotificationPayload {
  type: string;
  title: string;
  message: string;
  data?: Record<string, any>;
  timestamp: number;
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

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.startPingInterval();
    // Clean up expired notifications on initialization
    this.cleanupExpiredNotifications().catch(() => {
      // Ignore errors during cleanup
    });
  }

  /**
   * Queue a notification for later delivery
   */
  private async queueNotification(payload: NotificationPayload): Promise<void> {
    const timestamp = Date.now();
    const randomId = crypto.randomUUID();
    const key = `${QUEUE_KEY_PREFIX}${timestamp}:${randomId}`;

    try {
      await this.ctx.storage.put(key, payload);
      console.log(
        `[NotificationHub] Queued notification: ${payload.type} (key: ${key})`
      );
    } catch (error) {
      console.error(`[NotificationHub] Failed to queue notification:`, error);
      throw error;
    }
  }

  /**
   * Get all queued notifications that haven't expired
   */
  private async getQueuedNotifications(): Promise<
    Array<{ key: string; payload: NotificationPayload }>
  > {
    const now = Date.now();
    const cutoffTime = now - NOTIFICATION_QUEUE_TTL_MS;
    const queuedNotifications: Array<{
      key: string;
      payload: NotificationPayload;
    }> = [];

    try {
      // List all queued notifications
      const allQueued = await this.ctx.storage.list<NotificationPayload>({
        prefix: QUEUE_KEY_PREFIX,
      });

      for (const [key, payload] of allQueued.entries()) {
        // Filter by expiration based on notification timestamp
        if (payload.timestamp >= cutoffTime) {
          queuedNotifications.push({ key, payload });
        }
      }

      // Sort by timestamp (oldest first)
      queuedNotifications.sort(
        (a, b) => a.payload.timestamp - b.payload.timestamp
      );
    } catch (error) {
      console.error(
        `[NotificationHub] Failed to get queued notifications:`,
        error
      );
    }

    return queuedNotifications;
  }

  /**
   * Delete queued notifications by their keys
   */
  private async deleteQueuedNotifications(
    notifications: Array<{ key: string; payload: NotificationPayload }>
  ): Promise<void> {
    if (notifications.length === 0) {
      return;
    }

    const keys = notifications.map((n) => n.key);
    try {
      await this.ctx.storage.delete(keys);
      console.log(
        `[NotificationHub] Deleted ${keys.length} queued notifications`
      );
    } catch (error) {
      console.error(
        `[NotificationHub] Failed to delete queued notifications:`,
        error
      );
    }
  }

  /**
   * Clean up expired notifications from storage
   */
  private async cleanupExpiredNotifications(): Promise<void> {
    const now = Date.now();
    const cutoffTime = now - NOTIFICATION_QUEUE_TTL_MS;
    const expiredKeys: string[] = [];

    try {
      // List all queued notifications
      const allQueued = await this.ctx.storage.list<NotificationPayload>({
        prefix: QUEUE_KEY_PREFIX,
      });

      for (const [key, payload] of allQueued.entries()) {
        // Check if notification has expired
        if (payload.timestamp < cutoffTime) {
          expiredKeys.push(key);
        }
      }

      if (expiredKeys.length > 0) {
        await this.ctx.storage.delete(expiredKeys);
        console.log(
          `[NotificationHub] Cleaned up ${expiredKeys.length} expired notifications`
        );
      }
    } catch (error) {
      console.error(
        `[NotificationHub] Failed to cleanup expired notifications:`,
        error
      );
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

    // Check if this is a reconnection (user already exists)
    if (this.subscribers.has(userId)) {
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

    // Get queued notifications before creating the connection
    const queuedNotifications = await this.getQueuedNotifications();

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
    console.log(
      `[NotificationHub] Subscriber added: ${userId}. Total: ${this.subscribers.size}`
    );

    // Deliver queued notifications FIRST (before connection message)
    // This ensures users get missed notifications immediately upon reconnection
    // Note: We deliver synchronously to ensure proper ordering, but we start delivery
    // immediately so the Response can be returned while delivery is in progress
    const deliveryPromise =
      queuedNotifications.length > 0
        ? (async () => {
            console.log(
              `[NotificationHub] Delivering ${queuedNotifications.length} queued notifications to ${userId}`
            );

            const successfullyDelivered: Array<{
              key: string;
              payload: NotificationPayload;
            }> = [];

            for (let i = 0; i < queuedNotifications.length; i++) {
              const { key, payload } = queuedNotifications[i];
              try {
                await this.sendSSEMessage(writer, encoder, payload);
                successfullyDelivered.push({ key, payload });
                console.log(
                  `[NotificationHub] Successfully delivered queued notification ${i + 1}/${queuedNotifications.length}: ${payload.type} (key: ${key})`
                );
              } catch (error) {
                // If delivery fails, keep it in the queue for next reconnection
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                const errorName =
                  error instanceof Error ? error.name : "UnknownError";
                console.error(
                  `[NotificationHub] Failed to deliver queued notification ${i + 1}/${queuedNotifications.length} ${key} (${payload.type}): ${errorName}: ${errorMessage}`
                );
                // If the writer is closed or the stream is broken, stop trying to deliver more
                if (
                  errorMessage.includes("writer") ||
                  errorMessage.includes("stream") ||
                  errorMessage.includes("closed")
                ) {
                  console.error(
                    `[NotificationHub] Stream appears broken, stopping queued notification delivery. ${queuedNotifications.length - i - 1} notifications remain undelivered.`
                  );
                  break;
                }
              }
            }

            // Delete successfully delivered notifications from queue
            if (successfullyDelivered.length > 0) {
              await this.deleteQueuedNotifications(successfullyDelivered);
              console.log(
                `[NotificationHub] Successfully delivered and removed ${successfullyDelivered.length}/${queuedNotifications.length} queued notifications`
              );
            } else {
              console.error(
                `[NotificationHub] Failed to deliver any of ${queuedNotifications.length} queued notifications - all remain in queue`
              );
            }
          })()
        : Promise.resolve();

    // Start delivery (don't await - let it run in parallel with Response creation)
    // Writes to the same writer are queued, so order is preserved
    deliveryPromise.catch((error) => {
      console.error(
        `[NotificationHub] Error delivering queued notifications:`,
        error
      );
    });

    // Send initial connection message after starting queued notification delivery
    // (fire-and-forget to avoid hanging tests)
    // Writes are queued to the writer, so queued notifications will arrive first
    this.sendSSEMessage(writer, encoder, {
      type: "connected",
      title: "Connected",
      message: "Notification stream established",
      timestamp: Date.now(),
    }).catch(() => {});

    // Handle client disconnect
    request.signal?.addEventListener("abort", () => {
      console.log(
        `[NotificationHub] Connection aborted for subscriber: ${userId}`
      );
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
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Cache-Control",
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
      await this.broadcastNotification(payload);

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (_error) {
      return new Response("Invalid JSON", { status: 400 });
    }
  }

  /**
   * Broadcast notification to all subscribers
   */
  async broadcastNotification(payload: NotificationPayload): Promise<void> {
    // If no active subscribers, queue the notification for later delivery
    if (this.subscribers.size === 0) {
      await this.queueNotification(payload);
      console.log(
        `[NotificationHub] No subscribers, queued notification: ${payload.type}`
      );
      return;
    }

    const encoder = new TextEncoder();
    const deadSubscribers: string[] = [];
    let successCount = 0;

    console.log(
      `[NotificationHub] Broadcasting: ${payload.type}. Subscribers: ${this.subscribers.size}`
    );

    for (const [userId, subscriber] of this.subscribers.entries()) {
      // Check if request was aborted
      if (subscriber.abortSignal?.aborted) {
        console.log(
          `[NotificationHub] Detected aborted request for subscriber: ${userId} (during broadcast)`
        );
        deadSubscribers.push(userId);
        continue;
      }

      // Check if writer is closed before attempting to write
      if (subscriber.writer.desiredSize === null) {
        console.log(
          `[NotificationHub] Detected closed writer for subscriber: ${userId} (during broadcast)`
        );
        deadSubscribers.push(userId);
        continue;
      }

      try {
        await this.sendSSEMessage(subscriber.writer, encoder, payload);
        subscriber.lastPing = Date.now();
        successCount++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          `[NotificationHub] Failed to broadcast to subscriber ${userId}: ${errorMessage}`
        );
        deadSubscribers.push(userId);
      }
    }

    // Clean up dead subscribers
    for (const userId of deadSubscribers) {
      this.subscribers.delete(userId);
    }

    // If all subscribers failed (dead connections), queue the notification for later delivery
    if (successCount === 0 && this.subscribers.size === 0) {
      await this.queueNotification(payload);
      console.log(
        `[NotificationHub] All subscribers failed, queued notification: ${payload.type}`
      );
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
        console.log(
          `[NotificationHub] Detected closed writer for subscriber: ${userId} (during ping)`
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
        console.log(
          `[NotificationHub] Ping failed for subscriber: ${userId}, cleaning up`
        );
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
