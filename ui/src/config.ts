// Centralized configuration for the UI

// API URLs - can be overridden via environment variables at build time
// Use VITE_* prefix for variables exposed to the frontend
export const CONFIG = {
  // Base URL for optimization assets (reports, optimized files, etc.)
  // Can be changed from v2 to v3 etc via VITE_OPTIMIZATION_API_URL env var
  OPTIMIZATION_API_URL: import.meta.env.VITE_OPTIMIZATION_API_URL || 'https://optimized-assets.dclexplorer.com/v3',

  // API URL for monitoring endpoints and report data
  // Empty string means same-origin (works for both local dev with Vite proxy and Docker deployment)
  VERCEL_APP_URL: '',

  // Worlds content server API
  WORLDS_API_URL: import.meta.env.VITE_WORLDS_API_URL || 'https://worlds-content-server.decentraland.org',
} as const;

// Derived URLs
export const URLS = {
  // Full URL for fetching report data (from local API)
  get reportData() {
    return `${CONFIG.VERCEL_APP_URL}/api/report-data`;
  },

  // Full URL for fetching report status
  get reportStatus() {
    return `${CONFIG.VERCEL_APP_URL}/api/report-status`;
  },

  // Full URL for fetching worlds list
  get worldsList() {
    return `${CONFIG.WORLDS_API_URL}/index`;
  },

  // Get scene report URL
  getSceneReport(sceneId: string) {
    return `${CONFIG.OPTIMIZATION_API_URL}/${sceneId}-report.json`;
  },

  // Get optimized asset URL
  getOptimizedAsset(sceneId: string) {
    return `${CONFIG.OPTIMIZATION_API_URL}/${sceneId}-mobile.zip`;
  },

  // Get monitoring status URL
  get monitoringStatus() {
    return `${CONFIG.VERCEL_APP_URL}/api/monitoring/status`;
  },
} as const;

// Export API base URL for direct use in components
export const API_BASE_URL = CONFIG.VERCEL_APP_URL;
