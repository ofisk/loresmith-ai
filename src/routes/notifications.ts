import type { Context } from "hono";
import { SignJWT } from "jose";
import type { Env } from "../middleware/auth";
import { AuthService } from "../services/auth-service";
import { API_CONFIG } from "../shared-config";

/**
 * Handle minting short-lived stream tokens
 */
export async function handleMintStreamToken(
  c: Context<{ Bindings: Env }>
): Promise<Response> {
  try {
    // Authenticate user with their main JWT
    const authResult = await AuthService.extractAuthFromHeader(
      c.req.header("Authorization") || "",
      c.env
    );

    if (!authResult || !authResult.username) {
      return new Response("Invalid or expired token", {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
        },
      });
    }

    const userId = authResult.username;

    // Create a short-lived token specifically for SSE
    const authService = new AuthService(c.env);
    const jwtSecret = await authService.getJwtSecret();

    const streamToken = await new SignJWT({
      type: "sse-stream",
      userId,
      purpose: "notification-stream",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      // Use a longer expiry to reduce 401s from token expiration
      .setExpirationTime("15m") // 15 minutes instead of 5
      .setSubject(userId)
      .sign(jwtSecret);

    // Create the stream URL with the short-lived token
    const streamUrl = new URL(
      API_CONFIG.buildUrl(API_CONFIG.ENDPOINTS.NOTIFICATIONS.STREAM),
      c.req.url
    );
    streamUrl.searchParams.set("token", streamToken);

    const response = {
      streamUrl: streamUrl.toString(),
      expiresIn: 900, // 15 minutes in seconds
    };

    return c.json(response);
  } catch (error) {
    console.error("[Notifications] Error minting stream token:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

/**
 * Handle SSE notification stream requests
 */
export async function handleNotificationStream(
  c: Context<{ Bindings: Env }>
): Promise<Response> {
  try {
    // Get short-lived stream token from query parameter
    const streamToken = c.req.query("token");

    if (!streamToken) {
      return new Response("Missing stream token", {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Session-ID",
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        },
      });
    }

    // Validate the short-lived stream token
    const authService = new AuthService(c.env);
    const jwtSecret = await authService.getJwtSecret();

    try {
      const { jwtVerify } = await import("jose");
      // Allow small clock drift to reduce false 401s
      const { payload } = await jwtVerify(streamToken, jwtSecret, {
        clockTolerance: 60, // seconds
      });

      // Verify this is a stream token with correct purpose
      if (
        !payload ||
        payload.type !== "sse-stream" ||
        payload.purpose !== "notification-stream"
      ) {
        return new Response("Invalid stream token", {
          status: 401,
          headers: {
            "WWW-Authenticate": "Bearer",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, X-Session-ID",
            "Access-Control-Allow-Methods":
              "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          },
        });
      }

      const userId = payload.userId as string;
      if (!userId) {
        return new Response("Invalid stream token: missing user ID", {
          status: 401,
          headers: {
            "WWW-Authenticate": "Bearer",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, X-Session-ID",
            "Access-Control-Allow-Methods":
              "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          },
        });
      }

      // Get or create NotificationHub Durable Object
      const notificationHubId = c.env.NOTIFICATIONS.idFromName(
        `user-${userId}`
      );
      const notificationHub = c.env.NOTIFICATIONS.get(notificationHubId);

      // Create request to Durable Object directly
      const doRequest = new Request("http://localhost/subscribe", {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
        },
        // Remove signal to avoid hanging
      });

      // Add userId as query parameter
      const doUrl = new URL(doRequest.url);
      doUrl.searchParams.set("userId", userId);
      const finalRequest = new Request(doUrl.toString(), doRequest);

      const response = await notificationHub.fetch(finalRequest);

      if (!response.ok) {
        console.error(
          `[handleNotificationStream] DO response error: ${response.status} ${response.statusText}`
        );
        return new Response("Failed to establish notification stream", {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, X-Session-ID",
            "Access-Control-Allow-Methods":
              "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          },
        });
      }

      // Clone the response and add CORS headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Session-ID",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      };

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          ...corsHeaders,
        },
      });
    } catch (jwtError) {
      console.error("[Notifications] JWT verification error:", jwtError);

      // Check if this is a Durable Object reset error
      if (
        jwtError instanceof Error &&
        jwtError.message.includes("Durable Object reset")
      ) {
        // Return a successful SSE response with a reset message
        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const encoder = new TextEncoder();

        const resetMessage = `data: {"type": "durable-object-reset", "message": "Durable Object reset detected - reconnecting", "timestamp": ${Date.now()}}\n\n`;
        writer.write(encoder.encode(resetMessage));

        // Close the stream after sending the reset message
        setTimeout(async () => {
          try {
            await writer.close();
          } catch (_error) {
            // Ignore error closing reset stream
          }
        }, 100);

        return new Response(readable, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers":
              "Content-Type, Authorization, X-Session-ID",
            "Access-Control-Allow-Methods":
              "GET, POST, PUT, DELETE, PATCH, OPTIONS",
          },
        });
      }

      return new Response("Invalid or expired stream token", {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers":
            "Content-Type, Authorization, X-Session-ID",
          "Access-Control-Allow-Methods":
            "GET, POST, PUT, DELETE, PATCH, OPTIONS",
        },
      });
    }
  } catch (error) {
    console.error("[Notifications] Error handling stream request:", error);
    return new Response("Internal Server Error", {
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, X-Session-ID",
        "Access-Control-Allow-Methods":
          "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      },
    });
  }
}

export async function handleNotificationPublish(
  c: Context<{ Bindings: Env }>
): Promise<Response> {
  try {
    // Authenticate user
    const authResult = await AuthService.extractAuthFromHeader(
      c.req.header("Authorization") || "",
      c.env
    );

    if (!authResult || !authResult.username) {
      return new Response("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": "Bearer",
        },
      });
    }

    const userId = authResult.username;

    // Parse notification payload
    const payload = await c.req.json();

    // Validate payload structure
    if (!payload.type || !payload.title || !payload.message) {
      return new Response("Invalid payload: missing required fields", {
        status: 400,
      });
    }

    // Add timestamp if not provided
    if (!payload.timestamp) {
      payload.timestamp = Date.now();
    }

    // Get NotificationHub Durable Object
    const notificationHubId = c.env.NOTIFICATIONS.idFromName(`user-${userId}`);
    const notificationHub = c.env.NOTIFICATIONS.get(notificationHubId);

    // Create publish request to call the Durable Object directly
    const doRequest = new Request("http://localhost/publish", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    return await notificationHub.fetch(doRequest);
  } catch (error) {
    console.error("[Notifications] Error handling publish request:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
