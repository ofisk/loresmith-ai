/**
 * Helper utilities for constructing Durable Object action URLs and requests
 */

/**
 * Action names for UploadSession Durable Object
 */
export const UPLOAD_SESSION_ACTIONS = {
  CREATE: "create",
  GET: "get",
  UPDATE: "update",
  ADD_PART: "addPart",
  GET_PARTS: "getParts",
  COMPLETE: "complete",
  DELETE: "delete",
} as const;

/**
 * Constructs a URL with an action query parameter for Durable Object fetch calls.
 * The domain format doesn't matter for Durable Objects - only the query parameter is used for routing.
 * @param objectName - Name identifier for the Durable Object (e.g., "upload-session")
 * @param action - Action name to pass as query parameter
 * @returns URL string with action query parameter
 */
export function buildDurableObjectActionUrl(
  objectName: string,
  action: string
): string {
  return `https://${objectName}?action=${action}`;
}

/**
 * Creates a Request object for calling a Durable Object action
 * @param objectName - Name identifier for the Durable Object (e.g., "upload-session")
 * @param action - Action name to pass as query parameter
 * @param init - Request initialization options (method, headers, body, etc.)
 * @returns Request object ready to be passed to Durable Object's fetch() method
 */
export function createDurableObjectActionRequest(
  objectName: string,
  action: string,
  init?: RequestInit
): Request {
  return new Request(buildDurableObjectActionUrl(objectName, action), init);
}

/**
 * Upload Session Durable Object name constant
 */
export const UPLOAD_SESSION_OBJECT_NAME = "upload-session";

/**
 * Convenience functions for UploadSession actions
 */
export const UploadSessionActions = {
  /**
   * Creates a Request for creating an upload session
   */
  createRequest: (body: unknown): Request =>
    createDurableObjectActionRequest(
      UPLOAD_SESSION_OBJECT_NAME,
      UPLOAD_SESSION_ACTIONS.CREATE,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),

  /**
   * Creates a Request for getting an upload session
   */
  getRequest: (): Request =>
    createDurableObjectActionRequest(
      UPLOAD_SESSION_OBJECT_NAME,
      UPLOAD_SESSION_ACTIONS.GET,
      {
        method: "GET",
      }
    ),

  /**
   * Creates a Request for adding a part to an upload session
   */
  addPartRequest: (body: unknown): Request =>
    createDurableObjectActionRequest(
      UPLOAD_SESSION_OBJECT_NAME,
      UPLOAD_SESSION_ACTIONS.ADD_PART,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    ),

  /**
   * Creates a Request for getting parts from an upload session
   */
  getPartsRequest: (): Request =>
    createDurableObjectActionRequest(
      UPLOAD_SESSION_OBJECT_NAME,
      UPLOAD_SESSION_ACTIONS.GET_PARTS,
      {
        method: "GET",
      }
    ),

  /**
   * Creates a Request for completing an upload session
   */
  completeRequest: (): Request =>
    createDurableObjectActionRequest(
      UPLOAD_SESSION_OBJECT_NAME,
      UPLOAD_SESSION_ACTIONS.COMPLETE,
      {
        method: "POST",
      }
    ),

  /**
   * Creates a Request for deleting an upload session
   */
  deleteRequest: (): Request =>
    createDurableObjectActionRequest(
      UPLOAD_SESSION_OBJECT_NAME,
      UPLOAD_SESSION_ACTIONS.DELETE,
      {
        method: "DELETE",
      }
    ),
};
