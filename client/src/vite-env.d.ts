/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base origin of the Express API, without a trailing /api segment.
   * Example: https://api.example.com
   *
   * Leave unset for local development: requests then stay same-origin and the
   * Vite dev-server proxy forwards /api -> http://127.0.0.1:4000.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
