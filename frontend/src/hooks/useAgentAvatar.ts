/**
 * D-ID Agent SDK Hook for Real-Time Avatar
 * 
 * Uses the official @d-id/client-sdk for WebRTC streaming.
 * This handles all the WebRTC plumbing automatically.
 * 
 * Flow:
 * 1. Create agent manager with client key
 * 2. Connect to agent (establishes WebRTC)
 * 3. Call agent.chat(text) to make avatar speak in real-time
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';

// D-ID Client SDK types
interface AgentManager {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  chat: (message: string) => Promise<void>;
  on: (event: string, callback: (...args: any[]) => void) => void;
  off: (event: string, callback: (...args: any[]) => void) => void;
}

interface DIDClientSDK {
  createAgentManager: (config: {
    auth: { type: 'client-key'; clientKey: string };
    agentId: string;
    callbacks: {
      onVideoStateChange?: (state: string) => void;
      onConnectionStateChange?: (state: string) => void;
      onAgentMessage?: (message: any) => void;
      onAgentStartSpeaking?: () => void;
      onAgentEndSpeaking?: () => void;
      onDisconnect?: () => void;
      onVideoTrackAvailable?: (track: MediaStreamTrack) => void;
    };
  }) => AgentManager;
}

interface AgentState {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  videoState: string;
  error: string | null;
}

interface UseAgentAvatarReturn {
  state: AgentState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  connect: () => Promise<boolean>;
  speak: (text: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

// D-ID Client Key (obtained from D-ID API)
const DID_CLIENT_KEY = 'Z29vZ2xlLW9hdXRoMnwxMTM0MDI1Nzg1OTM5NTA5MTQ3OTU6b0dOeW5WYnJfb0drTU1DVDRoMWJ1';
const DID_AGENT_ID = 'v2_agt_WV53uomE';

export function useAgentAvatar(): UseAgentAvatarReturn {
  const [state, setState] = useState<AgentState>({
    isConnected: false,
    isConnecting: false,
    isSpeaking: false,
    videoState: 'idle',
    error: null,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const agentRef = useRef<AgentManager | null>(null);
  const sdkLoadedRef = useRef<boolean>(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (agentRef.current) {
        agentRef.current.disconnect().catch(console.error);
      }
    };
  }, []);

  /**
   * Load D-ID SDK dynamically (web only)
   */
  const loadSDK = useCallback(async (): Promise<DIDClientSDK | null> => {
    if (Platform.OS !== 'web') {
      console.log('[Agent] SDK only available on web');
      return null;
    }

    try {
      // Dynamic import for web
      const sdk = await import('@d-id/client-sdk');
      sdkLoadedRef.current = true;
      return sdk as unknown as DIDClientSDK;
    } catch (error) {
      console.error('[Agent] Failed to load SDK:', error);
      return null;
    }
  }, []);

  /**
   * Connect to D-ID Agent via WebRTC
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'web') {
      setState(prev => ({ ...prev, error: 'Agent SDK only available on web' }));
      return false;
    }

    if (state.isConnected || state.isConnecting) {
      return state.isConnected;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const sdk = await loadSDK();
      if (!sdk) {
        throw new Error('Failed to load D-ID SDK');
      }

      console.log('[Agent] Creating agent manager...');

      const agent = sdk.createAgentManager({
        auth: {
          type: 'client-key',
          clientKey: DID_CLIENT_KEY,
        },
        agentId: DID_AGENT_ID,
        callbacks: {
          onVideoStateChange: (videoState: string) => {
            console.log('[Agent] Video state:', videoState);
            setState(prev => ({ ...prev, videoState }));
          },
          onConnectionStateChange: (connectionState: string) => {
            console.log('[Agent] Connection state:', connectionState);
            const isConnected = connectionState === 'connected';
            setState(prev => ({ 
              ...prev, 
              isConnected,
              isConnecting: connectionState === 'connecting',
            }));
          },
          onAgentStartSpeaking: () => {
            console.log('[Agent] Started speaking');
            setState(prev => ({ ...prev, isSpeaking: true }));
          },
          onAgentEndSpeaking: () => {
            console.log('[Agent] Stopped speaking');
            setState(prev => ({ ...prev, isSpeaking: false }));
          },
          onAgentMessage: (message: any) => {
            console.log('[Agent] Message:', message);
          },
          onDisconnect: () => {
            console.log('[Agent] Disconnected');
            setState(prev => ({ 
              ...prev, 
              isConnected: false, 
              isConnecting: false,
              isSpeaking: false,
            }));
          },
          onVideoTrackAvailable: (track: MediaStreamTrack) => {
            console.log('[Agent] Video track available');
            if (videoRef.current) {
              const stream = new MediaStream([track]);
              videoRef.current.srcObject = stream;
              videoRef.current.play().catch(e => console.log('[Agent] Video play error:', e));
            }
          },
        },
      });

      agentRef.current = agent;

      console.log('[Agent] Connecting...');
      await agent.connect();

      setState(prev => ({
        ...prev,
        isConnected: true,
        isConnecting: false,
        error: null,
      }));

      console.log('[Agent] Connected successfully!');
      return true;

    } catch (error: any) {
      console.error('[Agent] Connection error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        isConnected: false,
        error: error.message || 'Failed to connect',
      }));
      return false;
    }
  }, [state.isConnected, state.isConnecting, loadSDK]);

  /**
   * Make the avatar speak text in real-time
   * This sends text directly to the agent - the avatar speaks it immediately
   */
  const speak = useCallback(async (text: string): Promise<boolean> => {
    if (!agentRef.current || !state.isConnected) {
      console.warn('[Agent] Cannot speak: not connected');
      return false;
    }

    if (!text || text.trim().length === 0) {
      return false;
    }

    try {
      console.log('[Agent] Speaking:', text.substring(0, 50) + '...');
      
      // The agent.chat() method makes the avatar speak in real-time
      // Note: The agent's LLM will process this, but we've set it to "repeat exactly"
      await agentRef.current.chat(text);

      return true;
    } catch (error: any) {
      console.error('[Agent] Speak error:', error);
      setState(prev => ({ ...prev, error: error.message }));
      return false;
    }
  }, [state.isConnected]);

  /**
   * Disconnect from the agent
   */
  const disconnect = useCallback(async (): Promise<void> => {
    console.log('[Agent] Disconnecting...');

    if (agentRef.current) {
      try {
        await agentRef.current.disconnect();
      } catch (e) {
        console.log('[Agent] Disconnect error:', e);
      }
      agentRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setState({
      isConnected: false,
      isConnecting: false,
      isSpeaking: false,
      videoState: 'idle',
      error: null,
    });

    console.log('[Agent] Disconnected');
  }, []);

  return {
    state,
    videoRef,
    connect,
    speak,
    disconnect,
  };
}
