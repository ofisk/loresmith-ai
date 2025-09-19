import { DurableObject } from "cloudflare:workers";

const PING_INTERVAL_MS = 30000; // 30 seconds

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
}

export class NotificationHub extends DurableObject {
  private subscribers: Map<string, NotificationSubscriber> = new Map();
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(ctx: DurableObjectState, env: any) {
    super(ctx, env);
    this.startPingInterval();
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

    // Create SSE stream
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    // Store subscriber
    const subscriber: NotificationSubscriber = {
      userId,
      writer,
      lastPing: Date.now(),
    };

    this.subscribers.set(userId, subscriber);
    try {
      console.log(
        `[NotificationHub] Subscriber added: ${userId}. Total: ${this.subscribers.size}`
      );
    } catch (_e) {
      // ignore log errors
    }

    // Send initial connection message (fire-and-forget to avoid hanging tests)
    this.sendSSEMessage(writer, encoder, {
      type: "connected",
      title: "Connected",
      message: "Notification stream established",
      timestamp: Date.now(),
    }).catch(() => {});

    // Handle client disconnect
    request.signal?.addEventListener("abort", () => {
      this.subscribers.delete(userId);
      writer.close();
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
    const encoder = new TextEncoder();
    const deadSubscribers: string[] = [];

    try {
      console.log(
        `[NotificationHub] Broadcasting: ${payload.type}. Subscribers: ${this.subscribers.size}`
      );
    } catch (_e) {
      // ignore log errors
    }

    for (const [userId, subscriber] of this.subscribers.entries()) {
      try {
        await this.sendSSEMessage(subscriber.writer, encoder, payload);
        subscriber.lastPing = Date.now();
      } catch (_error) {
        deadSubscribers.push(userId);
      }
    }

    // Clean up dead subscribers
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
    const data = JSON.stringify(payload);
    const message = `data: ${data}\n\n`;

    try {
      await writer.write(encoder.encode(message));
    } catch (error) {
      throw new Error(`Failed to send SSE message: ${error}`);
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
      try {
        const pingMessage = `: ping\n\n`;
        await subscriber.writer.write(encoder.encode(pingMessage));
        subscriber.lastPing = Date.now();
      } catch (_error) {
        // Clean up the failed subscriber immediately
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
