# Fix for Issue #7: [$50 BOUNTY] [TypeScript] Add per-endpoint API timeout configuration

*/
export class ApiClient {
  private client: AxiosInstance;
  private timeoutPolicies: TimeoutPolicyEntry[];
  private defaultTimeout: number;

  constructor(config: ApiClientConfig) {
    this.defaultTimeout = config.defaultTimeout ?? DEFAULT_TIMEOUT;
    this.timeoutPolicies = [
      ...(config.customTimeoutPolicies ?? []),
      ...DEFAULT_TIMEOUT_POLICIES,
    ];

    this.client = axios.create({
      baseURL: config.baseURL,
      timeout: this.defaultTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to apply per-endpoint timeouts
    this.client.interceptors.request.use((requestConfig) => {
      const url = requestConfig.url ?? '';
      const extendedConfig = requestConfig as ExtendedRequestConfig;
      
      // Only auto-resolve if timeout wasn't explicitly set or skipTimeoutResolution is false
      if (!extendedConfig.skipTimeoutResolution) {
        requestConfig.timeout = resolveTimeout(url, this.timeoutPolicies, extendedConfig);
      }

      return requestConfig;
    });
  }

  /**
   * Perform a GET request
   */
  async get<T = unknown>(url: string, config?: ExtendedRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.get<T>(url, config);
  }

  /**
   * Perform a POST request
   */
  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: ExtendedRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.post<T>(url, data, config);
  }

  /**
   * Perform a PUT request
   */
  async put<T = unknown>(
    url: string,
    data?: unknown,
    config?: ExtendedRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.put<T>(url, data, config);
  }

  /**
   * Perform a PATCH request
   */
  async patch<T = unknown>(
    url: string,
    data?: unknown,
    config?: ExtendedRequestConfig
  ): Promise<AxiosResponse<T>> {
    return this.client.patch<T>(url, data, config);
  }

  /**
   * Perform a DELETE request
   */
  async delete<T = unknown>(url: string, config?: ExtendedRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.delete<T>(url, config);
  }

  /**
   * Get the underlying axios instance for advanced use cases
   */
  getAxiosInstance(): AxiosInstance {
    return this.client;
  }

  /**
   * Get the current timeout policies (useful for debugging)
   */
  getTimeoutPolicies(): TimeoutPolicyEntry[] {
    return [...this.timeoutPolicies];
  }

  /**
   * Add a custom timeout policy at runtime
   * Note: Added policies take precedence over default policies
   */
  addTimeoutPolicy(policy: TimeoutPolicyEntry): void {
    this.timeoutPolicies.unshift(policy);
  }
}

// ============================================================================
// Default Instance
// ============================================================================

/**
 * Default API client instance
 * Configure via environment or replace with custom instance
 */
export const apiClient = new ApiClient({
  baseURL: process.env.REACT_APP_API_BASE_URL ?? '/api/v1',
});

export default apiClient;