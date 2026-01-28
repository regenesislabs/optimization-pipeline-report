-- Database initialization script for optimization-pipeline-report
-- This script runs automatically when the PostgreSQL container starts

-- Optimization history table (for report statistics)
CREATE TABLE IF NOT EXISTS optimization_history (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP NOT NULL,
  total_lands INTEGER NOT NULL,
  occupied_lands INTEGER NOT NULL,
  total_scenes INTEGER NOT NULL,
  scenes_with_optimized INTEGER NOT NULL,
  scenes_without_optimized INTEGER NOT NULL,
  optimization_percentage DECIMAL(5,2) NOT NULL,
  scenes_with_reports INTEGER NOT NULL,
  successful_optimizations INTEGER NOT NULL,
  failed_optimizations INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pipeline consumers table (for heartbeat tracking)
CREATE TABLE IF NOT EXISTS pipeline_consumers (
  id VARCHAR(36) PRIMARY KEY,
  process_method VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  current_scene_id VARCHAR(255),
  current_step VARCHAR(100),
  progress_percent INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  last_heartbeat TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  jobs_completed INTEGER DEFAULT 0,
  jobs_failed INTEGER DEFAULT 0,
  avg_processing_time_ms INTEGER DEFAULT 0,
  is_priority BOOLEAN DEFAULT FALSE,
  last_job_status VARCHAR(20)
);

-- Pipeline queue metrics table (for queue depth tracking)
-- entity_type: 'scene', 'wearable', 'emote', or 'all' (for backwards compatibility)
CREATE TABLE IF NOT EXISTS pipeline_queue_metrics (
  id SERIAL PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  queue_depth INTEGER DEFAULT 0,
  entity_type VARCHAR(20) DEFAULT 'scene'
);

-- Pipeline process history table (for job completion records)
CREATE TABLE IF NOT EXISTS pipeline_process_history (
  id SERIAL PRIMARY KEY,
  consumer_id VARCHAR(36) NOT NULL,
  scene_id VARCHAR(255) NOT NULL,
  process_method VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  is_priority BOOLEAN DEFAULT FALSE
);

-- Optimization results table (for storing final optimization status per entity)
CREATE TABLE IF NOT EXISTS optimization_results (
  id SERIAL PRIMARY KEY,
  entity_id VARCHAR(255) NOT NULL UNIQUE,
  entity_type VARCHAR(20) NOT NULL,  -- 'scene', 'wearable', 'emote'
  status VARCHAR(20) NOT NULL,        -- 'success', 'failed'
  thumbnail_url TEXT,
  error_message TEXT,
  process_method VARCHAR(50),
  completed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  report_json JSONB                   -- Full processing report (avoids CDN cache issues)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_history_consumer ON pipeline_process_history(consumer_id);
CREATE INDEX IF NOT EXISTS idx_history_created ON pipeline_process_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_queue_metrics_timestamp ON pipeline_queue_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_queue_metrics_entity_type ON pipeline_queue_metrics(entity_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_optimization_history_timestamp ON optimization_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_optimization_results_entity ON optimization_results(entity_id);
CREATE INDEX IF NOT EXISTS idx_optimization_results_status ON optimization_results(status);
CREATE INDEX IF NOT EXISTS idx_optimization_results_type ON optimization_results(entity_type);
CREATE INDEX IF NOT EXISTS idx_optimization_results_completed ON optimization_results(completed_at DESC);

-- Grant permissions (if using a different user)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pipeline;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO pipeline;
