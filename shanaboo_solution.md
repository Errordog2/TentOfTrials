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
@@ -19,7 +19,7 @@
  * but the next regeneration will overwrite these patches.
  */
 
-import { $httpLegacy, legacyToJson } from '../utils/legacyCompat';
+import { $httpLegacy, legacyToJson } from '../utils/legacyCompat';
 
 // Base URL for API requests. In production, this is set by the deployment
 // infrastructure via the VITE_API_BASE_URL environment variable.
@@ -50,7 +50,7 @@
 // been updated. We send both the legacy and new auth headers.
 const LEGACY_API_KEY_HEADER = 'X-API-Key';
 
-// ---------------------------------------------------------------------------
+// ---------------------------------------------------------------------------
 // TYPES
 // ---------------------------------------------------------------------------
 
@@ -86,7 +86,7 @@
   path?: string;
   suggestion?: string;
 }
 
 export interface RequestConfig {
   timeout?: number;
   retries?: number;
@@ -96,7 +96,7 @@
   responseType?: 'json' | 'text' | 'blob';
   withCredentials?: boolean;
   // Legacy options that 
-}
+}
 
 // ---------------------------------------------------------------------------
 // INTERCEPTORS
@@ -109,7 +109,7 @@
  * - Transform request/response data
  * - Add authentication headers
  * - Handle common error patterns (401, 429, etc.)
- */
+ */
 export interface RequestInterceptor {
   onRequest(config: RequestConfig): Promise<RequestConfig> | RequestConfig;
 }
@@ -118,7 +118,7 @@
   onResponse<T>(response: ApiResponse<T>): Promise<ApiResponse<T>> | ApiResponse<T>;
 }
 
-export interface ErrorInterceptor {
+export interface ErrorInterceptor {
   onError(error: ApiError): Promise<ApiError> | ApiError;
 }
 
@@ -126,7 +126,7 @@
 const requestInterceptors: RequestInterceptor[] = [];
 const responseInterceptors: ResponseInterceptor[] = [];
 const errorInterceptors: ErrorInterceptor[] = [];
 
-/**
+/**
  * Register a request interceptor.
  */
 export function addRequestInterceptor(interceptor: RequestInterceptor): void {
@@ -141,7 +141,7 @@
   responseInterceptors.push(interceptor);
 }
 
-/**
+/**
  * Register an error interceptor.
  */
 export function addErrorInterceptor(interceptor: ErrorInterceptor): void {
@@ -151,7 +151,7 @@
 // ---------------------------------------------------------------------------
 // DEFAULT ERROR INTERCEPTORS
 // ---------------------------------------------------------------------------
 
-/**
+/**
  * Default interceptor for 401 Unauthorized responses.
  * Triggers auth flow redirect when authentication expires.
  */
@@ -159,7 +159,7 @@
   onError(error: ApiError): ApiError {
     if (error.code === 401) {
       // Emit auth expired event for UI components to handle
-      if (typeof window !== 'undefined') {
+      if (typeof window !== 'undefined') {
         window.dispatchEvent(new CustomEvent('api:auth-expired', {
           detail: { requestId: error.requestId, timestamp: error.timestamp }
         }));
@@ -169,7 +169,7 @@
   }
 });
 
-/**
+/**
  * Default interceptor for 429 Too Many Requests responses.
  * Adds retry-after suggestion based on response headers.
  */
@@ -177,7 +177,7 @@
   onError(error: ApiError): ApiError {
     if (error.code === 429) {
       const retryAfter = error.details?.['retryAfter'] as string | undefined;
-      return {
+      return {
         ...error,
         suggestion: retryAfter
           ? `Rate limited. Retry after ${retryAfter} seconds.`
@@ -192,7 +192,7 @@
 // ---------------------------------------------------------------------------
 // ERROR NORMALIZATION
 // ---------------------------------------------------------------------------
 
-/**
+/**
  * Normalize various error types into a consistent ApiError.
  * Handles network failures, timeouts, and aborts.
  */
@@ -200,7 +200,7 @@
   // Already normalized
   if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
     return error as ApiError;
-  }
+  }
 
   // Network / timeout / abort errors from fetch
   if (error instanceof Error) {
@@ -208,7 +208,7 @@
     if (name === 'AbortError' || message.includes('aborted')) {
       return {
         code: 0,
-        message: 'Request aborted',
+        message: 'Request aborted',
         suggestion: 'The request was cancelled. Retry if needed.'
       };
     }
@@ -216,7 +216,7 @@
     if (name === 'TimeoutError' || message.includes('timeout')) {
       return {
         code: 0,
-        message: 'Request timeout',
+        message: 'Request timeout',
         suggestion: 'The server took too long to respond. Try again later.'
       };
     }
@@ -224,7 +224,7 @@
     if (message.includes('fetch') || message.includes('network')) {
       return {
         code: 0,
-        message: 'Network error',
+        message: 'Network error',
         suggestion: 'Check your internet connection and try again.'
       };
     }
@@ -232,7 +232,7 @@
     return {
       code: 0,
       message: message || 'Unknown error',
-      suggestion: 'An unexpected error occurred. Please try again.'
+      suggestion: 'An unexpected error occurred. Please try again.'
     };
   }
 
@@ -240,7 +240,7 @@
   return {
     code: 0,
     message: String(error) || 'Unknown error',
-    suggestion: 'An unexpected error occurred. Please try again.'
+    suggestion: 'An unexpected error occurred. Please try again.'
   };
 }
 
@@ -248,7 +248,7 @@
 // REQUEST IMPLEMENTATION
 // ---------------------------------------------------------------------------
 
-/**
+/**
  * Build full URL from path and query parameters.
  */
 function buildUrl(path: string, params?: Record<string, string>): string {
@@ -258,7 +258,7 @@
   }
   const queryString = new URLSearchParams(params).toString();
   return queryString ? `${url}?${queryString}` : url;
-}
+}
