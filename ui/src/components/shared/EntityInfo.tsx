import { useState, useEffect } from 'react';
import type { EntityType } from '../../types';

// Shared metadata types
export interface SceneMetadata {
  name: string;
  thumbnail?: string;
  positions: string[];
  loading: boolean;
  isWorld?: boolean;
  worldName?: string;
}

// API URLs
const CATALYST_URL = 'https://peer.decentraland.org/content';
const WORLDS_URL = 'https://worlds-content-server.decentraland.org';

// Global cache for scene metadata (shared across all components)
const sceneMetadataCache = new Map<string, SceneMetadata>();

// Entity response structure from Catalyst/Worlds
interface EntityResponse {
  content?: { file: string; hash: string }[];
  metadata?: {
    display?: {
      title?: string;
      navmapThumbnail?: string;
    };
    scene?: {
      base?: string;
      parcels?: string[];
    };
    worldConfiguration?: {
      name?: string;
    };
  };
}

// Fetch scene data from a specific server
async function fetchSceneData(
  baseUrl: string,
  hash: string,
  isWorld: boolean = false
): Promise<SceneMetadata | null> {
  try {
    const response = await fetch(`${baseUrl}/contents/${hash}`);
    if (!response.ok) return null;

    const entity: EntityResponse = await response.json();
    if (!entity.metadata) return null;

    const metadata = entity.metadata;
    const name = metadata.display?.title || 'Unnamed Scene';
    const baseParcel = metadata.scene?.base;
    const positions = baseParcel ? [baseParcel] : [];
    const worldName = metadata.worldConfiguration?.name;

    let thumbnail: string | undefined;
    const navmapThumbnail = metadata.display?.navmapThumbnail;
    if (navmapThumbnail && entity.content) {
      const thumbContent = entity.content.find(c => c.file === navmapThumbnail);
      if (thumbContent) {
        thumbnail = `${baseUrl}/contents/${thumbContent.hash}`;
      }
    }

    return { name, thumbnail, positions, loading: false, isWorld, worldName };
  } catch {
    return null;
  }
}

// Fetch scene metadata (tries Catalyst first, then Worlds)
export async function fetchSceneMetadata(sceneId: string): Promise<SceneMetadata> {
  const cached = sceneMetadataCache.get(sceneId);
  if (cached && !cached.loading) return cached;

  let metadata = await fetchSceneData(CATALYST_URL, sceneId, false);
  if (!metadata) {
    metadata = await fetchSceneData(WORLDS_URL, sceneId, true);
  }

  if (!metadata) {
    const errorMetadata: SceneMetadata = {
      name: 'Unknown',
      positions: [],
      loading: false,
    };
    sceneMetadataCache.set(sceneId, errorMetadata);
    return errorMetadata;
  }

  sceneMetadataCache.set(sceneId, metadata);
  return metadata;
}

// Get cached metadata (for filtering/searching)
export function getCachedMetadata(sceneId: string): SceneMetadata | undefined {
  return sceneMetadataCache.get(sceneId);
}

// Entity type helpers
export function getEntityTypeInfo(entityType: EntityType | undefined): {
  icon: string;
  label: string;
  className: string;
} {
  switch (entityType) {
    case 'wearable':
      return { icon: '👕', label: 'Wearable', className: 'entity-wearable' };
    case 'emote':
      return { icon: '💃', label: 'Emote', className: 'entity-emote' };
    case 'scene':
    default:
      return { icon: '🏠', label: 'Scene', className: 'entity-scene' };
  }
}

// Props for EntityInfo component
export interface EntityInfoProps {
  entityId: string;
  entityType?: EntityType;
  variant?: 'default' | 'compact' | 'inline';
  showThumbnail?: boolean;
  showEntityBadge?: boolean;
  className?: string;
}

/**
 * Reusable component for displaying entity information
 * Handles scenes, wearables, and emotes with appropriate display
 */
export function EntityInfo({
  entityId,
  entityType,
  variant = 'default',
  showThumbnail = true,
  showEntityBadge = false,
  className = '',
}: EntityInfoProps) {
  const [metadata, setMetadata] = useState<SceneMetadata | null>(null);
  const isScene = !entityType || entityType === 'scene';
  const entityInfo = getEntityTypeInfo(entityType);

  useEffect(() => {
    // Only fetch metadata for scenes
    if (isScene) {
      const cached = sceneMetadataCache.get(entityId);
      if (cached) {
        setMetadata(cached);
      } else {
        setMetadata({ name: '', positions: [], loading: true });
        fetchSceneMetadata(entityId).then(setMetadata);
      }
    }
  }, [entityId, isScene]);

  const containerClass = `entity-info entity-info--${variant} ${className}`.trim();

  return (
    <div className={containerClass}>
      {showThumbnail && (
        <div className="entity-info__visual">
          {isScene ? (
            // Scene: show thumbnail or placeholder
            metadata?.thumbnail ? (
              <img
                src={metadata.thumbnail}
                alt={metadata.name}
                className="entity-info__thumbnail"
              />
            ) : (
              <div className="entity-info__thumbnail-placeholder" />
            )
          ) : (
            // Wearable/Emote: show icon
            <div className={`entity-info__icon ${entityInfo.className}`}>
              {entityInfo.icon}
            </div>
          )}
        </div>
      )}

      <div className="entity-info__details">
        {showEntityBadge && !isScene && (
          <span className={`entity-info__badge ${entityInfo.className}`}>
            {entityInfo.icon} {entityInfo.label}
          </span>
        )}

        {isScene ? (
          // Scene: show metadata
          metadata?.loading ? (
            <div className="entity-info__name entity-info__name--loading">Loading...</div>
          ) : (
            <>
              <div className="entity-info__name" title={metadata?.name}>
                {metadata?.name || 'Unknown Scene'}
              </div>
              {metadata?.isWorld && metadata?.worldName ? (
                <div className="entity-info__subtitle">🌐 {metadata.worldName}</div>
              ) : (
                metadata?.positions && metadata.positions.length > 0 && (
                  <div className="entity-info__subtitle">{metadata.positions[0]}</div>
                )
              )}
            </>
          )
        ) : (
          // Wearable/Emote: show type label
          <div className="entity-info__name">{entityInfo.label}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Hook for fetching entity metadata
 * Useful when you need more control over the display
 */
export function useEntityMetadata(entityId: string, entityType?: EntityType) {
  const [metadata, setMetadata] = useState<SceneMetadata | null>(null);
  const isScene = !entityType || entityType === 'scene';

  useEffect(() => {
    if (isScene) {
      const cached = sceneMetadataCache.get(entityId);
      if (cached) {
        setMetadata(cached);
      } else {
        setMetadata({ name: '', positions: [], loading: true });
        fetchSceneMetadata(entityId).then(setMetadata);
      }
    } else {
      setMetadata(null);
    }
  }, [entityId, isScene]);

  return {
    metadata,
    isScene,
    entityInfo: getEntityTypeInfo(entityType),
    isLoading: isScene && metadata?.loading,
  };
}
