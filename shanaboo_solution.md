 ```diff
--- a/frontend/src/services/api.ts
+++ b/frontend/src/services/api.ts
@@ -1,4 +1,3 @@
-
 /**
  * @fileoverview Legacy API service layer.
  *
@@ -24,7 +23,7 @@
 // Base URL for API requests. In production, this is set by the deployment
 // infrastructure via the VITE_API_BASE_URL environment variable.
 // In development, it defaults to the local server.
-// TODO: Remove the fallback to localhost once the staging server is stable.
+// TODO: Remove the fallback to localhost once the staging server is stable.
 const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
   || 'http://localhost:8080/api/v1';
 
@@ -32,7 +31,7 @@
 // the old API gateway timeout. Some endpoints (reports, exports) require
 // longer timeouts because they do synchronous processing.
 // TODO: Implement per-endpoint timeout configuration.
-const DEFAULT_TIMEOUT = 30000;
+const DEFAULT_TIMEOUT = 30000;
 
 // Maximum number of retries for failed requests. The retry logic is
 // exponential backoff with jitter. The retry only applies to GET requests
@@ -56,7 +55,7 @@
 // been updated. We send both the legacy and new auth headers.
 const LEGACY_API_KEY_HEADER = 'X-API-Key';
 
-// ---------------------------------------------------------------------------
+// ---------------------------------------------------------------------------
 // TYPES
 // ---------------------------------------------------------------------------
 
@@ -92,7 +91,7 @@
   path?: string;
   suggestion?: string;
 }
 
 export interface RequestConfig {
   timeout?: number;
   retries?: number;
   headers?: Record<string, string>;
   signal?: AbortSignal;
   cache?: boolean;
   responseType?: 'json' | 'text' | 'blob';
   withCredentials?: boolean;
-  // Legacy options that 
+  // Legacy options that
+}
+
+// ---------------------------------------------------------------------------
+// ERROR TYPES
+// ---------------------------------------------------------------------------
+
+interface ErrorResponseBody {
+  message?: string;
+  error?: string;
+  detail?: string;
+  details?: Record<string, unknown>;
+  requestId?: string;
+  request_id?: string;
+  path?: string;
+  suggestion?: string;
+  code?: number;
+}
+
+// ---------------------------------------------------------------------------
+// INTERCEPTORS
+// ---------------------------------------------------------------------------
+
+type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
+type ResponseInterceptor<T> = (response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;
+type ErrorInterceptor = (error: ApiError) => ApiError | Promise<ApiError>;
+
+const requestInterceptors: RequestInterceptor[] = [];
+const responseInterceptors: ResponseInterceptor<unknown>[] = [];
+const errorInterceptors: ErrorInterceptor[] = [];
+
+export function addRequestInterceptor(interceptor: RequestInterceptor): void {
+  requestInterceptors.push(interceptor);
+}
+
+export function addResponseInterceptor<T>(interceptor: ResponseInterceptor<T>): void {
+  responseInterceptors.push(interceptor as ResponseInterceptor<unknown>);
+}
+
+export function addErrorInterceptor(interceptor: ErrorInterceptor): void {
+  errorInterceptors.push(interceptor);
+}
+
+// Default error interceptors for specific status codes
+addErrorInterceptor((error: ApiError) => {
+  if (error.code === 401) {
+    // Trigger auth refresh or redirect to login
+    console.warn('[API] 401 Unauthorized - authentication required');
+    // Could dispatch event or call auth service here
+  }
+  return error;
+});
+
+addErrorInterceptor((error: ApiError) => {
+  if (error.code === 429) {
+    // Rate limited - could implement retry-after logic
+    console.warn('[API] 429 Rate Limited - too many requests');
+    const retryAfter = error.details?.['retryAfter'] as number | undefined;
+    if (retryAfter) {
+      error.suggestion = `Retry after ${retryAfter} seconds`;
+    } else {
+      error.suggestion = 'Reduce request frequency or implement exponential backoff';
+    }
+  }
+  return error;
+});
+
+// ---------------------------------------------------------------------------
+// HELPER FUNCTIONS
+// ---------------------------------------------------------------------------
+
+/**
+ * Generate a unique request ID for tracing errors without backend IDs.
+ */
+function generateRequestId(): string {
+  return `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
+}
+
+/**
+ * Safely parse an error response body from a non-OK HTTP response.
+ * Attempts JSON first, falls back to plain text.
+ */
+async function parseErrorResponse(
+  response: Response,
+): Promise<{ body: ErrorResponseBody; rawText: string }> {
+  const contentType = response.headers.get('content-type') || '';
+  const rawText = await response.text();
+
+  let parsed: ErrorResponseBody = {};
+
+  if (contentType.includes('application/json') && rawText.trim()) {
+    try {
+      parsed = JSON.parse(rawText) as ErrorResponseBody;
+    } catch {
+      // JSON parse failed, treat as plain text
+      parsed = { message: rawText };
+    }
+  } else if (rawText.trim()) {
+    parsed = { message: rawText };
+  }
+
+  return { body: parsed, rawText };
+}
+
+/**
+ * Build an ApiError from a non-OK HTTP response.
+ */
+async function buildApiError(response: Response, url: string): Promise<ApiError> {
+  const { body } = await parseErrorResponse(response);
+
+  const requestId =
+    body.requestId ||
+    body.request_id ||
+    response.headers.get('x-request-id') ||
+    response.headers.get('X-Request-Id') ||
+    generateRequestId();
+
+  const message =
+    body.message ||
+    body.error ||
+    body.detail ||
+    response.statusText ||
+    `HTTP ${response.status} error`;
+
+  const apiError: ApiError = {
+    code: response.status,
+    message,
+    details: body.details || (body.detail ? { detail: body.detail } : undefined),
+    requestId: typeof requestId === 'string' ? requestId : String(requestId),
+    timestamp: new Date().toISOString(),
+    path: body.path || url,
+    suggestion: body.suggestion,
+  };
+
+  return apiError;
+}
+
+/**
+ * Normalize non-HTTP errors (network failures, timeouts, aborts) into ApiError.
+ */
+export function normalizeError(error: unknown, url?: string): ApiError {
+  if (error && typeof error === 'object' && 'code' in error) {
+    // Already an ApiError
+    return error as ApiError;
+  }
