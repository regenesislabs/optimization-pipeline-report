import { useState } from 'react';
import type { WorldWithOptimization, WorldsStats } from '../types';
import { ReportModal } from './ReportModal';

type FilterType = 'all' | 'optimized' | 'not-optimized';

interface WorldsListProps {
  worlds: WorldWithOptimization[];
  stats: WorldsStats | null;
}

export function WorldsList({ worlds, stats }: WorldsListProps) {
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedWorld, setSelectedWorld] = useState<WorldWithOptimization | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWorlds = worlds.filter((world) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'optimized' && world.hasOptimizedAssets) ||
      (filter === 'not-optimized' && !world.hasOptimizedAssets);

    const matchesSearch =
      searchQuery === '' ||
      world.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      world.title?.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  if (worlds.length === 0) {
    return (
      <div className="worlds-loading">
        <p>No worlds data available. Run the report generator to fetch worlds.</p>
      </div>
    );
  }

  return (
    <div className="worlds-container">
      {stats && (
        <div className="worlds-stats">
          <div className="stat-card">
            <div className="stat-value">{stats.totalWorlds}</div>
            <div className="stat-label">Total Worlds</div>
          </div>
          <div className="stat-card optimized">
            <div className="stat-value">{stats.optimizedWorlds}</div>
            <div className="stat-label">Optimized</div>
          </div>
          <div className="stat-card not-optimized">
            <div className="stat-value">{stats.notOptimizedWorlds}</div>
            <div className="stat-label">Not Optimized</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.optimizationPercentage}%</div>
            <div className="stat-label">Optimization Rate</div>
          </div>
        </div>
      )}

      <div className="worlds-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search worlds..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All ({worlds.length})
          </button>
          <button
            className={filter === 'optimized' ? 'active' : ''}
            onClick={() => setFilter('optimized')}
          >
            Optimized ({stats?.optimizedWorlds || 0})
          </button>
          <button
            className={filter === 'not-optimized' ? 'active' : ''}
            onClick={() => setFilter('not-optimized')}
          >
            Not Optimized ({stats?.notOptimizedWorlds || 0})
          </button>
        </div>
      </div>

      <div className="worlds-count">
        Showing {filteredWorlds.length} of {worlds.length} worlds
      </div>

      <div className="worlds-grid">
        {filteredWorlds.map((world) => (
          <WorldCard
            key={world.name}
            world={world}
            onViewReport={() => setSelectedWorld(world)}
          />
        ))}
      </div>

      {selectedWorld && (
        <ReportModal
          sceneId={selectedWorld.sceneId}
          entityType="scene"
          onClose={() => setSelectedWorld(null)}
          title={`World: ${selectedWorld.name}`}
        />
      )}
    </div>
  );
}

interface WorldCardProps {
  world: WorldWithOptimization;
  onViewReport: () => void;
}

function WorldCard({ world, onViewReport }: WorldCardProps) {
  return (
    <div className={`world-card ${world.hasOptimizedAssets ? 'optimized' : 'not-optimized'}`}>
      <div className="world-thumbnail">
        {world.thumbnail ? (
          <img src={world.thumbnail} alt={world.name} loading="lazy" />
        ) : (
          <div className="no-thumbnail">No Image</div>
        )}
        <div className={`optimization-badge ${world.hasOptimizedAssets ? 'optimized' : ''}`}>
          {world.hasOptimizedAssets ? 'Optimized' : 'Not Optimized'}
        </div>
      </div>
      <div className="world-info">
        <h3 className="world-name">{world.name}</h3>
        {world.title && world.title !== 'DCL Scene' && world.title !== 'Untitled' && (
          <p className="world-title">{world.title}</p>
        )}
        <div className="world-meta">
          <span>{world.parcels} parcel{world.parcels !== 1 ? 's' : ''}</span>
        </div>
        <div className="world-actions">
          <button onClick={onViewReport} className="view-report-btn">
            View Report
          </button>
        </div>
      </div>
    </div>
  );
}
