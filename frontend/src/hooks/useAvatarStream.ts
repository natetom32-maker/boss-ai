/**
 * D-ID Real-Time Avatar Streaming Hook
 * 
 * Uses WebRTC to stream real-time avatar video from D-ID.
 * The avatar speaks EXACTLY what Boss AI tells it - no AI interpretation.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '../services/api';

// WebRTC types
interface RTCSessionDescriptionInit {
  type: 'offer' | 'answer';
  sdp: string;
}

interface StreamState {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  error: string | null;
  streamId: string | null;
  sessionId: string | null;
}

interface UseAvatarStreamReturn {
  state: StreamState;
  videoRef: React.RefObject<HTMLVideoElement>;
  connect: () => Promise<boolean>;
  speak: (text: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

export function useAvatarStream(): UseAvatarStreamReturn {
  const [state, setState] = useState<StreamState>({
    isConnected: false,
    isConnecting: false,
    isSpeaking: false,
    error: null,
    streamId: null,
    sessionId: null,
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const streamIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  /**
   * Create WebRTC peer connection and connect to D-ID stream
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (state.isConnected || state.isConnecting) {
      return state.isConnected;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // 1. Create stream on backend (which creates D-ID stream)
      const createResponse = await api.post('/avatar/stream/create', {});
      const { stream_id, session_id, offer, ice_servers } = createResponse.data;

      streamIdRef.current = stream_id;
      sessionIdRef.current = session_id;

      // 2. Create RTCPeerConnection
      const config: RTCConfiguration = {
        iceServers: ice_servers && ice_servers.length > 0 
          ? ice_servers 
          : [{ urls: 'stun:stun.l.google.com:19302' }],
      };

      const peerConnection = new RTCPeerConnection(config);
      peerConnectionRef.current = peerConnection;

      // 3. Handle incoming video track
      peerConnection.ontrack = (event) => {
        console.log('Received track:', event.track.kind);
        if (event.track.kind === 'video' && videoRef.current) {
          const stream = new MediaStream([event.track]);
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      };

      // 4. Handle ICE candidates
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate) {
          // Send ICE candidate to backend/D-ID
          try {
            await api.post('/avatar/stream/ice', {
              stream_id,
              session_id,
              candidate: event.candidate.toJSON(),
            });
          } catch (e) {
            // ICE candidate sending may fail for some candidates, that's ok
            console.log('ICE candidate send:', e);
          }
        }
      };

      // 5. Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        console.log('Connection state:', peerConnection.connectionState);
        if (peerConnection.connectionState === 'connected') {
          setState(prev => ({ ...prev, isConnected: true, isConnecting: false }));
        } else if (peerConnection.connectionState === 'failed' || 
                   peerConnection.connectionState === 'disconnected') {
          setState(prev => ({ 
            ...prev, 
            isConnected: false, 
            isConnecting: false,
            error: 'Connection lost'
          }));
        }
      };

      // 6. Set remote description (D-ID's offer)
      if (offer) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      }

      // 7. Create and send answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // 8. Send answer to backend/D-ID
      await api.post('/avatar/stream/connect', {
        stream_id,
        session_id,
        sdp_answer: answer,
      });

      setState(prev => ({
        ...prev,
        streamId: stream_id,
        sessionId: session_id,
        isConnecting: false,
        isConnected: true,
      }));

      return true;
    } catch (error: any) {
      console.error('Stream connection error:', error);
      setState(prev => ({
        ...prev,
        isConnecting: false,
        error: error.message || 'Failed to connect to avatar stream',
      }));
      return false;
    }
  }, [state.isConnected, state.isConnecting]);

  /**
   * Make the avatar speak text in real-time
   * This sends the EXACT text from Boss AI - avatar does NOT interpret it
   */
  const speak = useCallback(async (text: string): Promise<boolean> => {
    if (!state.isConnected || !streamIdRef.current || !sessionIdRef.current) {
      console.error('Not connected to stream');
      return false;
    }

    setState(prev => ({ ...prev, isSpeaking: true }));

    try {
      await api.post('/avatar/stream/speak', {
        stream_id: streamIdRef.current,
        session_id: sessionIdRef.current,
        text: text,
      });

      // Speaking duration estimate (rough: 150ms per word)
      const wordCount = text.split(' ').length;
      const estimatedDuration = Math.max(2000, wordCount * 150);

      setTimeout(() => {
        setState(prev => ({ ...prev, isSpeaking: false }));
      }, estimatedDuration);

      return true;
    } catch (error: any) {
      console.error('Speak error:', error);
      setState(prev => ({ ...prev, isSpeaking: false, error: error.message }));
      return false;
    }
  }, [state.isConnected]);

  /**
   * Disconnect from stream
   */
  const disconnect = useCallback(async (): Promise<void> => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    if (streamIdRef.current) {
      try {
        await api.delete(`/avatar/stream/${streamIdRef.current}`);
      } catch (e) {
        console.log('Stream cleanup error:', e);
      }
    }

    streamIdRef.current = null;
    sessionIdRef.current = null;

    setState({
      isConnected: false,
      isConnecting: false,
      isSpeaking: false,
      error: null,
      streamId: null,
      sessionId: null,
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    videoRef,
    connect,
    speak,
    disconnect,
  };
}
