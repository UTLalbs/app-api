import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

import { logger } from '../../config/logger';
import { AppError } from '../../shared/errors/AppError';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface HttpClientOptions {
  baseUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  params?: Record<string, string>;
}

// ── Cliente HTTP ───────────────────────────────────────────────────────────

export class HttpClient {
  private readonly client: AxiosInstance;

  constructor(options: HttpClientOptions) {
    this.client = axios.create({
      baseURL: options.baseUrl.replace(/\/$/, ''),
      timeout: options.timeoutMs ?? 10_000,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    // ── Interceptor de request ───────────────────────────────────────────
    this.client.interceptors.request.use((config) => {
      logger.debug(
        { url: config.url, method: config.method?.toUpperCase() },
        'HTTP request',
      );
      return config;
    });

    // ── Interceptor de response ──────────────────────────────────────────
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (axios.isAxiosError(error)) {
          // Timeout
          if (error.code === 'ECONNABORTED') {
            throw new AppError(
              'El servicio externo tardó demasiado — intenta de nuevo',
              504,
              'EXTERNAL_SERVICE_TIMEOUT',
            );
          }

          // Sin respuesta del servidor
          if (!error.response) {
            throw new AppError(
              'No se pudo conectar con el servicio externo',
              502,
              'EXTERNAL_SERVICE_ERROR',
            );
          }

          // Error con respuesta HTTP
          logger.warn(
            {
              url: error.config?.url,
              method: error.config?.method?.toUpperCase(),
              status: error.response.status,
            },
            'HTTP request failed',
          );

          throw new AppError(
            `External service error: ${error.response.status}`,
            502,
            'EXTERNAL_SERVICE_ERROR',
          );
        }

        throw error;
      },
    );
  }

  // ── GET ──────────────────────────────────────────────────────────────────

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const config: AxiosRequestConfig = {
      headers: options.headers,
      timeout: options.timeoutMs,
      params:  options.params,
    };

    const response = await this.client.get<T>(path, config);
    return response.data;
  }

  // ── POST ─────────────────────────────────────────────────────────────────

  async post<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      headers: options.headers,
      timeout: options.timeoutMs,
    };

    const response = await this.client.post<T>(path, body, config);
    return response.data;
  }

  // ── PATCH ────────────────────────────────────────────────────────────────

  async patch<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      headers: options.headers,
      timeout: options.timeoutMs,
    };

    const response = await this.client.patch<T>(path, body, config);
    return response.data;
  }

  // ── PUT ──────────────────────────────────────────────────────────────────

  async put<T>(
    path: string,
    body: unknown,
    options: RequestOptions = {},
  ): Promise<T> {
    const config: AxiosRequestConfig = {
      headers: options.headers,
      timeout: options.timeoutMs,
    };

    const response = await this.client.put<T>(path, body, config);
    return response.data;
  }

  // ── DELETE ───────────────────────────────────────────────────────────────

  async delete<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const config: AxiosRequestConfig = {
      headers: options.headers,
      timeout: options.timeoutMs,
    };

    const response = await this.client.delete<T>(path, config);
    return response.data;
  }
}