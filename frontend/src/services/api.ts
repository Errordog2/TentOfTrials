# Fix for Issue #7: [$50 BOUNTY] [TypeScript] Add per-endpoint API timeout configuration

/**
 * API Client Service
 * 
 * Provides HTTP request handling with per-endpoint timeout configuration.
 * 
 * @module api
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

// ============================================================================
// Constants
// ============================================================================

/** Default timeout for standard API requests (30 seconds) */
export const DEFAULT_TIMEOUT = 30000;

/** Extended timeout for long-running operations (5 minutes) */
export const LONG_RUNNING_TIMEOUT = 300000;

/** Extended timeout for export operations (3 minutes) */
export const EXPORT_TIMEOUT = 180000;

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Request category for timeout classification
 */
export type RequestCategory = 'default' | 'reports' | 'exports' | 'batch' | 'upload';

/**
 * Timeout policy entry defining timeout for an endpoint pattern
 */
export interface TimeoutPolicyEntry {
  /** Regex pattern to match endpoint paths */
  pattern: RegExp;
  /** Timeout in milliseconds */
  timeout: number;
  /** Optional category for grouping/documentation */
  category: RequestCategory;
  /** Description of why this timeout is needed */
  description?: string;
}

/**
 * Configuration for the API client
 */
export interface ApiClientConfig {
  baseURL: string;
  defaultTimeout?: number;
  customTimeoutPolicies?: TimeoutPolicyEntry[];
}

/**
 * Extended request config with category override
 */
export interface ExtendedRequestConfig extends AxiosRequestConfig {
  /** Override timeout category for this specific request */
  timeoutCategory?: RequestCategory;
  /** Skip automatic timeout resolution (use provided timeout directly) */
  skipTimeoutResolution?: boolean;
}

// ============================================================================
// Default Timeout Policies
// ============================================================================

/**
 * Default timeout policies for known long-running endpoints.
 * 
 * To add a new endpoint-specific timeout:
 * 1. Add a new entry to this array
 * 2. Specify the pattern (regex) matching the endpoint path
 * 3. Set the appropriate timeout in milliseconds
 * 4. Assign a category for documentation/grouping
 * 5. Add a description explaining why this timeout is needed
 * 
 * Patterns are evaluated in order; first match wins.
 */
export const DEFAULT_TIMEOUT_POLICIES: TimeoutPolicyEntry[] = [
  {
    pattern: /^\/api\/v\d+\/reports\/(generate|export)/i,
    timeout: LONG_RUNNING_TIMEOUT,
    category: 'reports',
    description: 'Report generation can involve complex aggregations and large datasets',
  },
  {
    pattern: /^\/api\/v\d+\/reports/i,
    timeout: EXPORT_TIMEOUT,
    category: 'reports',
    description: 'Standard report endpoints may require extended processing',
  },
  {
    pattern: /^\/api\/v\d+\/exports/i,
    timeout: EXPORT_TIMEOUT,
    category: 'exports',
    description: 'Export operations generate files which takes longer than standard requests',
  },
  {
    pattern: /^\/api\/v\d+\/batch/i,
    timeout: LONG_RUNNING_TIMEOUT,
    category: 'batch',
    description: 'Batch operations process multiple items and need extended time',
  },
  {
    pattern: /^\/api\/v\d+\/upload/i,
    timeout: EXPORT_TIMEOUT,
    category: 'upload',
    description: 'File uploads may take longer depending on file size and network',
  },
  {
    pattern: /\/export$/i,
    timeout: EXPORT_TIMEOUT,
    category: 'exports',
    description: 'Any endpoint ending in /export likely generates downloadable content',
  },
];

/**
 * Category-based timeout mapping for manual category overrides
 */
export const CATEGORY_TIMEOUTS: Record<RequestCategory, number> = {
  default: DEFAULT_TIMEOUT,
  reports: LONG_RUNNING_TIMEOUT,
  exports: EXPORT_TIMEOUT,
  batch: LONG_RUNNING_TIMEOUT,
  upload: EXPORT_TIMEOUT,
};

// ============================================================================
// Timeout Resolution
// ============================================================================

/**
 * Resolves the appropriate timeout for a given endpoint URL.
 * 
 * Resolution order:
 * 1. Explicit timeout in request config (if skipTimeoutResolution is false)
 * 2. Category override via timeoutCategory
 * 3. Pattern matching against timeout policies
 * 4. Default timeout
 * 
 * @param url - The endpoint URL path
 * @param policies - Array of timeout policies to check against
 * @param config - Optional request configuration
 * @returns Resolved timeout in milliseconds
 */
export function resolveTimeout(
  url: string,
  policies: TimeoutPolicyEntry[] = DEFAULT_TIMEOUT_POLICIES,
  config?: ExtendedRequestConfig
): number {
  // If explicit timeout provided and skipTimeoutResolution is true, use it directly
  if (config?.skipTimeoutResolution && config?.timeout) {
    return config.timeout;
  }

  // If category override specified, use category timeout
  if (config?.timeoutCategory) {
    return CATEGORY_TIMEOUTS[config.timeoutCategory] ?? DEFAULT_TIMEOUT;
  }

  // Check against timeout policies (first match wins)
  for (const policy of policies) {
    if (policy.pattern.test(url)) {
      return policy.timeout;
    }
  }

  // Fall back to default
  return DEFAULT_TIMEOUT;
}

/**
 * Gets the category for a given endpoint URL based on policies.
 * Useful for logging and debugging.
 * 
 * @param url - The endpoint URL path
 * @param policies - Array of timeout policies to check against
 * @returns The matched category or 'default'
 */
export function getEndpointCategory(
  url: string,
  policies: TimeoutPolicyEntry[] = DEFAULT_TIMEOUT_POLICIES
): RequestCategory {
  for (const policy of policies) {
    if (policy.pattern.test(url)) {
      return policy.category;
    }
  }
  return 'default';
}

// ============================================================================
// API Client Class
// ============================================================================

/**
 * API Client with per-endpoint timeout configuration.
 * 
 * @example
 *