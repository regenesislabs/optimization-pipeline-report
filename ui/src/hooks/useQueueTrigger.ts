import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config';

const COOKIE_NAME = 'queue_trigger_password';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, maxAge: number): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Strict`;
}

interface QueueTriggerState {
  isLoading: boolean;
  error: string | null;
  success: boolean;
  lastTriggeredId: string | null;
}

type EntityType = 'scene' | 'wearable' | 'emote';

interface UseQueueTriggerResult {
  state: QueueTriggerState;
  triggerQueue: (entityId: string, prioritize?: boolean, entityType?: EntityType) => Promise<boolean>;
  clearState: () => void;
}

export function useQueueTrigger(): UseQueueTriggerResult {
  const [state, setState] = useState<QueueTriggerState>({
    isLoading: false,
    error: null,
    success: false,
    lastTriggeredId: null,
  });

  const clearState = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      success: false,
      lastTriggeredId: null,
    });
  }, []);

  const triggerQueue = useCallback(async (entityId: string, prioritize = true, entityType?: EntityType): Promise<boolean> => {
    // Check for stored password first
    let password = getCookie(COOKIE_NAME);

    // If no stored password, prompt for it
    if (!password) {
      password = window.prompt('Enter password to add to queue:');
      if (!password) {
        setState(prev => ({ ...prev, error: 'Password required' }));
        return false;
      }
    }

    setState({
      isLoading: true,
      error: null,
      success: false,
      lastTriggeredId: entityId,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/api/monitoring/queue-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          entityId,
          prioritize,
          entityType: entityType || 'scene',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // If password was wrong, don't save it
        if (response.status === 401) {
          setState({
            isLoading: false,
            error: 'Invalid password',
            success: false,
            lastTriggeredId: entityId,
          });
          return false;
        }
        setState({
          isLoading: false,
          error: data.error || 'Failed to add to queue',
          success: false,
          lastTriggeredId: entityId,
        });
        return false;
      }

      // Password was correct, save it to cookie
      setCookie(COOKIE_NAME, password, COOKIE_MAX_AGE);

      setState({
        isLoading: false,
        error: null,
        success: true,
        lastTriggeredId: entityId,
      });
      return true;
    } catch (error) {
      setState({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Network error',
        success: false,
        lastTriggeredId: entityId,
      });
      return false;
    }
  }, []);

  return { state, triggerQueue, clearState };
}
