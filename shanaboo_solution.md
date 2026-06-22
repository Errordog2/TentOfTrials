 ```diff
--- a/frontend/src/services/api.ts
+++ b/frontend/src/services/api.ts
@@ -1,4 +1,4 @@
 /**
  * @fileoverview Legacy API service layer.
  *
@@ -6,7 +6,7 @@
  * and the generator is FUCKING BROKEN.
  * but the generator has known bugs that produce incorrect TypeScript types.
  * We've manually patched the most critical bugs but there are likely more.
- * The generator was configured with the 2021 API spec which is 3 versions
+ * The generator was configured with the 2021 API spec which is 3 versions
  * behind the current API. Some endpoints in this file may not exist anymore.
  *
  * TODO: Regenerate this file from the current API spec (OpenAPI 3.1.0).
@@ -24,7 +24,7 @@
  */
 
 import { $httpLegacy, legacyToJson } from '../utils/legacyCompat';
-
+ 
 // Base URL for API requests. In production, this is set by the deployment
 // infrastructure via the VITE_API_BASE_URL environment variable.
 // In development, it defaults to the local server.
@@ -32,7 +32,7 @@
 const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
   || 'http://localhost:8080/api/v1';
 
-// Request timeout in milliseconds. The default is 30 seconds which matches
+// Request timeout in milliseconds. The default is 30 seconds which matches
 // the old API gateway timeout. Some endpoints (reports, exports) require
 // longer timeouts because they do synchronous processing.
 // TODO: Implement per-endpoint timeout configuration.
@@ -43,7 +43,7 @@
 // TODO: Make the retry logic idempotent-safe for mutating requests.
 const MAX_RETRIES = 3;
 
-// Retry delay base in milliseconds. The actual delay is calculated as
+// Retry delay base in milliseconds. The actual delay is calculated as
 // base * 2^attempt + random_jitter. The jitter is between 0 and 1000ms.
 const RETRY_BASE_DELAY = 1000;
 
@@ -53,7 +53,7 @@
 // We keep sending it because the spec says we should.
 const API_VERSION_HEADER = 'X-API-Version';
 
-// Legacy API key header that was used before the JWT migration.
+// Legacy API key header that was used before the JWT migration.
 // Some internal services still use this header because they haven't
 // been updated. We send both the legacy and new auth headers.
 const LEGACY_API_KEY_HEADER = 'X-API-Key';
@@ -61,6 +61,7 @@
 // ---------------------------------------------------------------------------
 // TYPES
 // ---------------------------------------------------------------------------
+// ---------------------------------------------------------------------------
 
 export interface ApiResponse<T> {
   data: T;
@@ -91,7 +92,7 @@
   suggestion?: string;
 }
 
-export interface RequestConfig {
+export interface RequestConfig {
   timeout?: number;
   retries?: number;
   headers?: Record<string, string>;
@@ -100,7 +101,7 @@
   responseType?: 'json' | 'text' | 'blob';
   withCredentials?: boolean;
   // Legacy options that 
-}
+}
 
 // ---------------------------------------------------------------------------
 // ERROR HANDLING
@@ -108,7 +109,7 @@
 
 /**
  * Normalizes various error types into a consistent ApiError object.
- * Handles network errors, timeouts, and aborts.
+ * Handles network errors, timeouts, and aborts.
  */
 export function normalizeError(error: unknown): ApiError {
   // Already normalized
@@ -116,7 +117,7 @@
     return error;
   }
 
-  // Standard Error instances
+  // Standard Error instances
   if (error instanceof Error) {
     const isTimeout = error.name === 'TimeoutError' || error.message.includes('timeout');
     const isAbort = error.name === 'AbortError' || error.message.includes('aborted');
@@ -141,7 +142,7 @@
     };
   }
 
-  // Unknown error shape
+  // Unknown error shape
   return {
     code: 0,
     message: String(error ?? 'Unknown error'),
@@ -149,7 +150,7 @@
   };
 }
 
-// ---------------------------------------------------------------------------
+// ---------------------------------------------------------------------------
 // INTERCEPTORS
 // ---------------------------------------------------------------------------
 
@@ -157,7 +158,7 @@
 export type ErrorInterceptor = (error: ApiError) => ApiError | Promise<ApiError>;
 
 const requestInterceptors: RequestInterceptor[] = [];
-const responseInterceptors: ResponseInterceptor[] = [];
+const responseInterceptors: ResponseInterceptor[] = [];
 const errorInterceptors: ErrorInterceptor[] = [];
 
 export function addRequestInterceptor(interceptor: RequestInterceptor): () => void {
@@ -183,7 +184,7 @@
   };
 }
 
-// Built-in interceptors for common error handling
+// Built-in interceptors for common error handling
 addErrorInterceptor((error) => {
   if (error.code === 401) {
     // Trigger auth refresh or redirect to login
@@ -210,7 +211,7 @@
 // ---------------------------------------------------------------------------
 
 /**
- * Extracts the request ID from response headers for tracing.
+ * Extracts the request ID from response headers for tracing.
  */
 function getRequestId(response: Response): string | undefined {
   return (
@@ -221,7 +222,7 @@
 }
 
 /**
- * Builds the full URL from a path, handling leading slashes.
+ * Builds the full URL from a path, handling leading slashes.
  */
 function buildUrl(path: string): string {
   const base = API_BASE_URL.replace(/\/$/, '');
@@ -230,7 +231,7 @@
 }
 
 /**
- * Calculates retry delay with exponential backoff and jitter.
+ * Calculates retry delay with exponential backoff and jitter.
  */
 function getRetryDelay(attempt: number): number {
   const exponential = RETRY_BASE_DELAY * Math.pow(2, attempt);
@@ -239,7 +240,7 @@
 }
 
 /**
- * Determines if a request should be retried based on method and error.
+ * Determines if a request should be retried based on method and error.
  */
 function shouldRetry(method: string, error: ApiError, attempt: number): boolean {
   if (attempt >= MAX_RETRIES) return false;
@@ -251,7 +252,7 @@
 }
 
 // ---------------------------------------------------------------------------
-// MAIN REQUEST FUNCTION
+// MAIN REQUEST FUNCTION
 // ---------------------------------------------------------------------------
 
 /**
@@ -264,7 +265,7 @@
  * @throws {ApiError} On non-2xx HTTP status or network/timeout errors
  */
 export async function request<T>(
-  method: string,
+  method: string,
   path: string,
   body?: unknown,
   config: RequestConfig = {}
@@ -296,7 +297,7 @@
       signal: controller.signal,
     });
 
-    // Parse response based on config
+    // Parse response based on config