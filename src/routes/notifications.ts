import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../middleware/auth";
import { requireUserJwt } from "./auth";

type ContextWithAuth = Context<{ Bindings: Env }> & {
  userAuth?: any;
};
import { NotificationService } from "../services/notification-service";

const notifications = new Hono<{ Bindings: Env }>();

// Apply JWT middleware to all notification routes
notifications.use("*", requireUserJwt);

/**
 * Get unread notifications for the current user
 */
notifications.get("/unread", async (c: ContextWithAuth) => {
  try {
    const userAuth = (c as any).userAuth;
    const notificationService = new NotificationService(c.env);

    const unreadNotifications =
      await notificationService.getUnreadNotifications(userAuth.username);

    return c.json({
      success: true,
      notifications: unreadNotifications,
      count: unreadNotifications.length,
    });
  } catch (error) {
    console.error("Error fetching unread notifications:", error);
    return c.json({ error: "Failed to fetch notifications" }, 500);
  }
});

/**
 * Get all notifications for the current user (with pagination)
 */
notifications.get("/", async (c: ContextWithAuth) => {
  try {
    const userAuth = (c as any).userAuth;
    const notificationService = new NotificationService(c.env);

    const limit = parseInt(c.req.query("limit") || "50");
    const offset = parseInt(c.req.query("offset") || "0");

    const result = await notificationService.getUserNotifications(
      userAuth.username,
      limit,
      offset
    );

    return c.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return c.json({ error: "Failed to fetch notifications" }, 500);
  }
});

/**
 * Mark a specific notification as read
 */
notifications.patch("/:id/read", async (c: ContextWithAuth) => {
  try {
    const userAuth = (c as any).userAuth;
    const notificationId = c.req.param("id");
    const notificationService = new NotificationService(c.env);

    const success = await notificationService.markAsRead(
      notificationId,
      userAuth.username
    );

    if (!success) {
      return c.json({ error: "Notification not found" }, 404);
    }

    return c.json({
      success: true,
      message: "Notification marked as read",
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return c.json({ error: "Failed to update notification" }, 500);
  }
});

/**
 * Mark all notifications as read for the current user
 */
notifications.patch("/read-all", async (c: ContextWithAuth) => {
  try {
    const userAuth = (c as any).userAuth;
    const notificationService = new NotificationService(c.env);

    const updatedCount = await notificationService.markAllAsRead(
      userAuth.username
    );

    return c.json({
      success: true,
      message: `${updatedCount} notifications marked as read`,
      updatedCount,
    });
  } catch (error) {
    console.error("Error marking all notifications as read:", error);
    return c.json({ error: "Failed to update notifications" }, 500);
  }
});

/**
 * Cleanup endpoint (for maintenance/admin use)
 */
notifications.delete("/cleanup", async (c: Context<{ Bindings: Env }>) => {
  try {
    const notificationService = new NotificationService(c.env);
    const daysOld = parseInt(c.req.query("days") || "30");

    const result = await notificationService.cleanupOldNotifications(daysOld);

    return c.json({
      success: true,
      message: `Cleaned up ${result.deleted} old notifications`,
      deleted: result.deleted,
    });
  } catch (error) {
    console.error("Error cleaning up notifications:", error);
    return c.json({ error: "Failed to cleanup notifications" }, 500);
  }
});

export { notifications };
