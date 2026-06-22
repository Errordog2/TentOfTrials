 ```diff
--- a/frontend/src/services/api.ts
+++ b/frontend/src/services/api.ts
@@ -1,3 +1,4 @@
+
 /**
 * @fileoverview Legacy API service layer.
 *
@@ -24,7 +25,7 @@
 // TODO: Remove the fallback to localhost once the staging server is stable.
 const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
   || 'http://localhost:8080/api/v1';
-
+ 
 // Request timeout in milliseconds. The default is 30 seconds which matches
 // the old API gateway timeout. Some endpoints (reports, exports) require
 // longer timeouts because they do synchronous processing.
@@ -49,7 +50,7 @@
 // been updated. We send both the legacy and new auth headers.
 const LEGACY_API_KEY_HEADER = 'X-API-Key';
 
-// ---------------------------------------------------------------------------
+// --------------------------------------------------------------------------- 
 // TYPES
 // ---------------------------------------------------------------------------
 
@@ -90,7 +91,7 @@
   path?: string;
   suggestion?: string;
 }
-
+ 
 export interface RequestConfig {
   timeout?: number;
   retries?: number;
@@ -102,7 +103,7 @@
   withCredentials?: boolean;
   // Legacy options that 
 }
-
+ 
 // ---------------------------------------------------------------------------
 // INTERCEPTORS
 // ---------------------------------------------------------------------------
@@ -112,7 +113,7 @@
  * before the request is sent.
  */
 export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
-
+ 
 /**
  * Response interceptor that can transform the response or handle errors.
  */
@@ -122,7 +123,7 @@
  * Error interceptor that can transform errors or perform side effects.
  */
 export type ErrorInterceptor = (error: ApiError) => ApiError | Promise<ApiError>;
-
+ 
 const requestInterceptors: RequestInterceptor[] = [];
 const responseInterceptors: Array<(response: ApiResponse<unknown>) => ApiResponse<unknown> | Promise<ApiResponse<unknown>>> = [];
 const errorInterceptors: ErrorInterceptor[] = [];
@@ -132,7 +133,7 @@
  * Add a request interceptor to the chain.
  */
 export function addRequestInterceptor(interceptor: RequestInterceptor): void {
-  requestInterceptors.push(interceptor);
+  requestInterceptors.push(interceptor); 
 }
 
 /**
@@ -146,7 +147,7 @@
 /**
  * Add an error interceptor to the chain.
  */
-export function addErrorInterceptor(interceptor: ErrorInterceptor): void {
+export function addErrorInterceptor(interceptor: ErrorInterceptor): void { 
   errorInterceptors.push(interceptor);
 }
 
@@ -154,7 +155,7 @@
  * Remove a request interceptor from the chain.
  */
 export function removeRequestInterceptor(interceptor: RequestInterceptor): void {
-  const index = requestInterceptors.indexOf(interceptor);
+  const index = requestInterceptors.indexOf(interceptor); 
   if (index !== -1) {
     requestInterceptors.splice(index, 1);
   }
@@ -172,7 +173,7 @@
 /**
  * Remove an error interceptor from the chain.
  */
-export function removeErrorInterceptor(interceptor: ErrorInterceptor): void {
+export function removeErrorInterceptor(interceptor: ErrorInterceptor): void { 
   const index = errorInterceptors.indexOf(interceptor);
   if (index !== -1) {
     errorInterceptors.splice(index, 1);
@@ -183,7 +184,7 @@
 // HELPER FUNCTIONS
 // ---------------------------------------------------------------------------
 
-/**
+/** 
  * Apply all request interceptors to the config.
  */
 async function applyRequestInterceptors(config: RequestConfig): Promise<RequestConfig> {
@@ -194,7 +195,7 @@
   return result;
 }
 
-/**
+/** 
  * Apply all response interceptors to the response.
  */
 async function applyResponseInterceptors<T>(response: ApiResponse<T>): Promise<ApiResponse<T>> {
@@ -205,7 +206,7 @@
   return result as ApiResponse<T>;
 }
 
-/**
+/** 
  * Apply all error interceptors to the error.
  */
 async function applyErrorInterceptors(error: ApiError): Promise<ApiError> {
@@ -216,7 +217,7 @@
   return result;
 }
 
-/**
+/** 
  * Generate a unique request ID for tracing.
  */
 function generateRequestId(): string {
@@ -227,7 +228,7 @@
 /**
  * Normalize various error types into an ApiError.
  */
-function normalizeError(error: unknown, requestId?: string): ApiError {
+function normalizeError(error: unknown, requestId?: string): ApiError { 
   if (typeof error === 'object' && error !== null) {
     const err = error as Record<string, unknown>;
     if ('code' in err && 'message' in err) {
@@ -258,7 +259,7 @@
 /**
  * Build the full URL from the endpoint and query parameters.
  */
-function buildUrl(endpoint: string, params?: Record<string, string>): string {
+function buildUrl(endpoint: string, params?: Record<string, string>): string { 
   const url = new URL(endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`);
   if (params) {
     Object.entries(params).forEach(([key, value]) => {
@@ -271,7 +272,7 @@
 /**
  * Parse the response based on the responseType config.
  */
-async function parseResponse<T>(response: Response, config: RequestConfig): Promise<T> {
+async function parseResponse<T>(response: Response, config: RequestConfig): Promise<T> { 
   const contentType = response.headers.get('content-type') || '';
   
   if (config.responseType === 'text') {
@@ -292,7 +293,7 @@
 /**
  * Build headers for the request.
  */
-function buildHeaders(config: RequestConfig): Headers {
+function buildHeaders(config: RequestConfig): Headers { 
   const headers = new Headers();
   
   headers.set(API_VERSION_HEADER, '2021-06-01');
@@ -316,7 +317,7 @@
 /**
  * Execute a fetch with timeout support.
  */
-async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
+async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> { 
   const controller = new AbortController();
   const id = setTimeout(() => controller.abort(), timeout);
   
@@ -333,7 +334,7 @@
 /**
  * Sleep for a given number of milliseconds.
  */
-function sleep(ms: number): Promise<void> {
+function sleep(ms: number): Promise<void> { 
   return new Promise(resolve => setTimeout(resolve, ms));
 }
 
@@ -341,7 +342,7 @@
 /**
  * Calculate retry delay with exponential backoff and jitter.
  */
-function calculateRetryDelay(attempt: number): number {
+function calculateRetryDelay(attempt: number): number { 
  