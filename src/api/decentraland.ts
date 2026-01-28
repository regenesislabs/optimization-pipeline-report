import axios from 'axios';
import { Scene, OptimizationReport } from '../types';
import { S3OptimizationChecker } from './s3-client';
import { PATHS } from '../config';

const API_URL = 'https://peer.decentraland.org/content/entities/active';
const BATCH_SIZE = process.env.CI ? 10000 : 50000; // Smaller batches in CI to avoid 500 errors
const MIN_COORD = -175;
const MAX_COORD = 175;

export class DecentralandAPI {
  private async fetchBatch(pointers: string[], retryCount: number = 0): Promise<Scene[]> {
    const MAX_RETRIES = 3;
    const TIMEOUT = 120000; // 120 seconds
    
    try {
      console.log(`Fetching batch of ${pointers.length} pointers... (attempt ${retryCount + 1}/${MAX_RETRIES})`);
      const response = await axios.post(API_URL, {
        pointers: pointers
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: TIMEOUT
      });

      return response.data as Scene[];
    } catch (error: any) {
      const isTimeout = error.code === 'ECONNABORTED' || error.message?.includes('timeout');
      const isRetryable = isTimeout || error.response?.status >= 500;
      
      if (isRetryable && retryCount < MAX_RETRIES - 1) {
        const backoffTime = Math.min(1000 * Math.pow(2, retryCount), 10000); // Exponential backoff, max 10s
        console.log(`Request failed (${error.code || error.message}), retrying in ${backoffTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.fetchBatch(pointers, retryCount + 1);
      }
      
      console.error(`Error fetching batch after ${retryCount + 1} attempts:`, error.message || error);
      throw error;
    }
  }

  private generatePointers(startX: number, endX: number, startY: number, endY: number): string[] {
    const pointers: string[] = [];
    
    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        pointers.push(`${x},${y}`);
      }
    }
    
    return pointers;
  }

  private async checkOptimizedAsset(sceneId: string): Promise<boolean> {
    try {
      const url = PATHS.getOptimizedAssetUrl(sceneId);
      const response = await axios.head(url, {
        timeout: 10000, // Increased timeout
        validateStatus: (status) => status < 500
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  private async fetchOptimizationReport(sceneId: string, retryCount: number = 0): Promise<OptimizationReport | null> {
    const MAX_RETRIES = 2;

    try {
      const url = PATHS.getReportUrl(sceneId);
      const response = await axios.get(url, {
        timeout: 10000, // Increased timeout
        validateStatus: (status) => status < 500
      });

      if (response.status === 200 && response.data) {
        // Handle both old format (success at top level) and new format (result.success)
        const success = response.data.result?.success ?? response.data.success ?? false;
        const errors = response.data.errors || [];
        const individualAssets = response.data.individualAssets;

        return {
          sceneId,
          success,
          fatalError: response.data.fatalError || false,
          timestamp: response.data.finishedAt || response.data.timestamp,
          error: errors.length > 0 ? errors[0] : response.data.error,
          details: response.data
        };
      }
      return null;
    } catch (error: any) {
      if (retryCount < MAX_RETRIES - 1 && (error.code === 'ECONNABORTED' || error.response?.status >= 500)) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return this.fetchOptimizationReport(sceneId, retryCount + 1);
      }
      return null;
    }
  }

  public async fetchWorld(): Promise<Scene[]> {
    const allScenes: Scene[] = [];
    const totalLands = (MAX_COORD - MIN_COORD + 1) * (MAX_COORD - MIN_COORD + 1);
    console.log(`Total lands to fetch: ${totalLands}`);

    const gridSize = Math.floor(Math.sqrt(BATCH_SIZE));
    let successfulBatches = 0;
    let failedBatches = 0;
    
    for (let startX = MIN_COORD; startX <= MAX_COORD; startX += gridSize) {
      for (let startY = MIN_COORD; startY <= MAX_COORD; startY += gridSize) {
        const endX = Math.min(startX + gridSize - 1, MAX_COORD);
        const endY = Math.min(startY + gridSize - 1, MAX_COORD);
        
        const pointers = this.generatePointers(startX, endX, startY, endY);
        
        try {
          const scenes = await this.fetchBatch(pointers);
          allScenes.push(...scenes);
          successfulBatches++;
          
          const progress = ((startX - MIN_COORD) * (MAX_COORD - MIN_COORD + 1) + (startY - MIN_COORD)) / totalLands * 100;
          console.log(`Progress: ${progress.toFixed(2)}% - Success: ${successfulBatches}, Failed: ${failedBatches}`);
        } catch (error) {
          console.error(`Failed to fetch batch for region (${startX},${startY}) to (${endX},${endY}) after retries`);
          failedBatches++;
          // Continue with next batch instead of throwing
        }
        
        // Small delay between requests to avoid overwhelming the server
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log(`Fetched ${allScenes.length} scenes from ${successfulBatches} successful batches (${failedBatches} failed)`);
    
    // If we failed to fetch most of the data, throw an error
    if (successfulBatches === 0) {
      throw new Error('Failed to fetch any world data');
    }
    
    return allScenes;
  }

  public async checkOptimizationStatus(
    scenes: Scene[],
    onProgress?: (percent: number, message: string) => void
  ): Promise<Scene[]> {
    console.log(`\nChecking optimization status for ${scenes.length} scenes...`);
    const uniqueScenes = Array.from(new Map(scenes.map(s => [s.id, s])).values());

    try {
      // Try to use S3 API for fast checking
      const s3Checker = new S3OptimizationChecker();
      await s3Checker.initialize();

      // Mark scenes based on S3 data
      for (const scene of uniqueScenes) {
        scene.hasOptimizedAssets = s3Checker.hasOptimizedAsset(scene.id);
      }

      const optimizedCount = uniqueScenes.filter(s => s.hasOptimizedAssets).length;
      console.log(`Found ${optimizedCount} scenes with optimized assets (using S3 API)`);
      onProgress?.(50, `Found ${optimizedCount} optimized scenes (S3 API)`);

    } catch (error) {
      console.log('S3 API failed, falling back to HTTP HEAD requests...');
      onProgress?.(0, 'Checking optimization status (HTTP fallback)...');

      // Fallback to HTTP HEAD requests
      let checked = 0;
      const batchSize = 10;

      for (let i = 0; i < uniqueScenes.length; i += batchSize) {
        const batch = uniqueScenes.slice(i, Math.min(i + batchSize, uniqueScenes.length));

        await Promise.all(
          batch.map(async (scene) => {
            scene.hasOptimizedAssets = await this.checkOptimizedAsset(scene.id);
          })
        );

        checked += batch.length;
        const progress = (checked / uniqueScenes.length) * 100;
        console.log(`Optimization check progress: ${progress.toFixed(2)}% (${checked}/${uniqueScenes.length})`);

        // Report progress (0-50% for optimization check)
        onProgress?.(progress * 0.5, `Checking optimization: ${checked}/${uniqueScenes.length} scenes`);

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const optimizedCount = uniqueScenes.filter(s => s.hasOptimizedAssets).length;
      console.log(`Found ${optimizedCount} scenes with optimized assets (using HTTP)`);
    }
    
    // Fetch reports for ALL scenes (to check success status even for scenes with files)
    console.log('\nFetching optimization reports for all scenes...');
    onProgress?.(50, 'Fetching optimization reports...');
    let reportsChecked = 0;
    let reportsFound = 0;
    let failedOptimizations = 0;

    const reportBatchSize = 20;
    for (let i = 0; i < uniqueScenes.length; i += reportBatchSize) {
      const batch = uniqueScenes.slice(i, Math.min(i + reportBatchSize, uniqueScenes.length));

      await Promise.all(
        batch.map(async (scene) => {
          const report = await this.fetchOptimizationReport(scene.id);
          if (report) {
            scene.optimizationReport = report;
            reportsFound++;
            // If report exists and shows failure, mark as NOT optimized
            // even if the -mobile.zip file exists
            if (!report.success) {
              scene.hasOptimizedAssets = false;
              failedOptimizations++;
            }
          }
        })
      );

      reportsChecked += batch.length;
      const progress = (reportsChecked / uniqueScenes.length) * 100;
      console.log(`Report check progress: ${progress.toFixed(2)}% (${reportsChecked}/${uniqueScenes.length}) - Found ${reportsFound} reports (${failedOptimizations} failed)`);

      // Report progress (50-100% for report fetching)
      onProgress?.(50 + progress * 0.5, `Fetching reports: ${reportsChecked}/${uniqueScenes.length}`);

      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`Found ${reportsFound} optimization reports (${failedOptimizations} marked as failed)`);
    
    return scenes.map(scene => {
      const uniqueScene = uniqueScenes.find(s => s.id === scene.id);
      return { 
        ...scene, 
        hasOptimizedAssets: uniqueScene?.hasOptimizedAssets || false,
        optimizationReport: uniqueScene?.optimizationReport
      };
    });
  }
}