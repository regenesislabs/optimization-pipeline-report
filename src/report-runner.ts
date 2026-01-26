import { DecentralandAPI } from './api/decentraland';
import { WorldsAPI } from './api/worlds';
import { DataProcessor } from './processor';
import { ReportGenerator } from './report-generator';
import { R2Uploader } from './r2-uploader';

export interface ReportGenerationResult {
  success: boolean;
  stats?: {
    totalLands: number;
    occupiedLands: number;
    totalScenes: number;
    optimizationPercentage: number;
  };
  reportData?: any;
  error?: string;
}

export type ProgressCallback = (percent: number, message: string) => void;

export interface ReportGenerationOptions {
  skipR2Upload?: boolean;
  onProgress?: ProgressCallback;
}

/**
 * Run the report generation process.
 * This function can be called from CLI (index.ts) or scheduler (report-scheduler.ts)
 * @param options.skipR2Upload - If true, skip uploading to R2 (for local storage mode)
 */
export async function runReportGeneration(options: ReportGenerationOptions = {}): Promise<ReportGenerationResult> {
  console.log('🚀 Starting Decentraland Asset Optimization Pipeline Report Generator');
  console.log('='.repeat(60));

  try {
    const { onProgress } = options;

    console.log('\n📡 Step 1: Fetching world data from Decentraland...');
    onProgress?.(5, 'Fetching world data from Decentraland...');
    const api = new DecentralandAPI();
    let scenes = await api.fetchWorld();
    onProgress?.(15, 'World data fetched, checking optimization status...');

    console.log('\n⚡ Step 2: Checking asset optimization status...');
    scenes = await api.checkOptimizationStatus(scenes, (percent, message) => {
      // Map 0-100% of optimization check to 15-85% of total progress
      const mappedPercent = 15 + (percent * 0.7);
      onProgress?.(mappedPercent, message);
    });

    console.log('\n🔄 Step 3: Processing scene data...');
    onProgress?.(85, 'Processing scene data...');
    const processor = new DataProcessor();
    const worldData = processor.processScenes(scenes);
    const stats = processor.getStatistics(worldData);

    console.log('\n📊 Genesis City Statistics:');
    console.log(`  - Total Lands: ${stats.totalLands}`);
    console.log(`  - Occupied Lands: ${stats.occupiedLands}`);
    console.log(`  - Empty Lands: ${stats.emptyLands}`);
    console.log(`  - Total Scenes: ${stats.totalScenes}`);
    console.log(`  - Average Lands per Scene: ${stats.averageLandsPerScene.toFixed(2)}`);
    console.log(`  - Scenes with Optimized Assets: ${stats.scenesWithOptimizedAssets}`);
    console.log(`  - Scenes without Optimized Assets: ${stats.scenesWithoutOptimizedAssets}`);
    console.log(`  - Optimization Coverage: ${stats.optimizationPercentage.toFixed(1)}%`);
    console.log(`  - Scenes with Reports: ${stats.scenesWithReports}`);
    console.log(`  - Successful Optimizations: ${stats.successfulOptimizations}`);
    console.log(`  - Failed Optimizations: ${stats.failedOptimizations}`);

    // Step 4: Fetch and check Worlds optimization
    console.log('\n🌍 Step 4: Fetching Decentraland Worlds...');
    onProgress?.(88, 'Fetching Decentraland Worlds...');
    const worldsAPI = new WorldsAPI();
    const worldsList = await worldsAPI.fetchWorlds();
    const worldsData = await worldsAPI.checkWorldsOptimization(worldsList);

    console.log('\n📝 Step 5: Generating report data...');
    onProgress?.(95, 'Generating report data...');
    const generator = new ReportGenerator();
    const reportData = generator.generateReportData(worldData, stats, worldsData);

    // Step 6: Upload JSON data to CloudFlare R2 (optional)
    if (!options.skipR2Upload) {
      console.log('\n☁️ Step 6: Uploading report data to R2...');
      const uploader = new R2Uploader();
      await uploader.uploadReportData(reportData);
      console.log('🌐 React frontend will fetch data from R2 at runtime.');
    } else {
      console.log('\n💾 Step 6: Skipping R2 upload (local storage mode)');
    }

    console.log('\n✅ Report generation complete!');

    return {
      success: true,
      stats: {
        totalLands: stats.totalLands,
        occupiedLands: stats.occupiedLands,
        totalScenes: stats.totalScenes,
        optimizationPercentage: stats.optimizationPercentage
      },
      reportData
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('\n❌ Error generating report:', error);
    return {
      success: false,
      error: errorMessage
    };
  }
}
