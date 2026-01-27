// Centralized configuration for the backend

export const CONFIG = {
  // API version for optimized assets
  OPTIMIZATION_API_VERSION: 'v3',

  // Base URL for optimization assets
  OPTIMIZATION_BASE_URL: 'https://optimized-assets.dclexplorer.com',

  // S3/R2 bucket name
  S3_BUCKET: process.env.S3_BUCKET || 'optimized-assets',
} as const;

// Derived URLs and paths
export const PATHS = {
  // Get the full optimization API URL
  get optimizationApiUrl() {
    return `${CONFIG.OPTIMIZATION_BASE_URL}/${CONFIG.OPTIMIZATION_API_VERSION}`;
  },

  // Get S3 key prefix for optimized assets
  get s3Prefix() {
    return `${CONFIG.OPTIMIZATION_API_VERSION}/`;
  },

  // Get scene optimized asset URL
  getOptimizedAssetUrl(sceneId: string) {
    return `${this.optimizationApiUrl}/${sceneId}-mobile.zip`;
  },

  // Get scene report URL
  getReportUrl(sceneId: string) {
    return `${this.optimizationApiUrl}/${sceneId}-report.json`;
  },

  // Get S3 key for optimized asset
  getOptimizedAssetKey(sceneId: string) {
    return `${CONFIG.OPTIMIZATION_API_VERSION}/${sceneId}-mobile.zip`;
  },

  // Get S3 key for report
  getReportKey(sceneId: string) {
    return `${CONFIG.OPTIMIZATION_API_VERSION}/${sceneId}-report.json`;
  },
} as const;
