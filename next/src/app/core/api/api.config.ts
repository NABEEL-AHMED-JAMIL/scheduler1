/**
 * The API lives on a fixed port beside whatever host serves the UI, so it is derived at
 * runtime rather than baked in at build time -- the same bundle then works on localhost,
 * a staging box, or a customer's on-premise install with no rebuild.
 */
export const API_BASE = `${window.location.protocol}//${window.location.hostname}:9098/api/v1`;

/** Every endpoint answers with this envelope; `status` is the real success signal, not the HTTP code. */
export interface ApiResponse<T = unknown> {
  status: 'SUCCESS' | 'ERROR';
  message: string;
  data?: T;
}

export const API_SUCCESS = 'SUCCESS';
