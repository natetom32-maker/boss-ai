/**
 * D-ID Real-Time Avatar Streaming Hook (Talks Streams API)
 * 
 * Uses WebRTC to stream real-time avatar video with ElevenLabs voice.
 * The avatar speaks EXACTLY what Boss AI tells it - no AI interpretation.
 * 
 * Flow:
 * 1. Create stream -> Get WebRTC offer from D-ID
 * 2. Create local peer connection
 * 3. Send SDP answer back
 * 4. Stream is ready -> call speak() with text
 * 5. D-ID converts text to speech (ElevenLabs) and animates avatar in real-time
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '../services/api';

interface StreamState {
  isConnected: boolean;
  isConnecting: boolean;
  isSpeaking: boolean;
  error: string | null;
  streamId: string | null;
  sessionId: string | null;
}

interface UseRealtimeAvatarReturn {
  state: StreamState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  connect: () => Promise<boolean>;
  speak: (text: string) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

// Check if WebRTC is available (web only for now)
const isWebRTCSupported = () => {
  if (Platform.OS !== 'web') {
    return false; // Native requires react-native-webrtc
  }
  return typeof RTCPeerConnection !== 'undefined';
};

export function useRealtimeAvatar(): UseRealtimeAvatarReturn {
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
  const dataChannelRef = useRef<RTCDataChannel | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  /**
   * Create WebRTC peer connection and connect to D-ID Talks Stream
   */
  const connect = useCallback(async (): Promise<boolean> => {
    if (!isWebRTCSupported()) {
      setState(prev => ({ 
        ...prev, 
        error: 'WebRTC not supported on this platform. Avatar video will be used instead.' 
      }));
      return false;
    }

    if (state.isConnected || state.isConnecting) {
      return state.isConnected;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      // 1. Create stream on backend (which creates D-ID Agents stream)
      console.log('[Avatar] Creating real-time agent stream...');
      const createResponse = await api.post('/avatar/stream/create', {});
      const { stream_id, session_id, offer, ice_servers, reused } = createResponse.data;

      console.log('[Avatar] Stream created:', { stream_id, reused });
      
      streamIdRef.current = stream_id;
      sessionIdRef.current = session_id;

      // 2. Create RTCPeerConnection with ICE servers
      const config: RTCConfiguration = {
        iceServers: ice_servers && ice_servers.length > 0 
          ? ice_servers 
          : [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
            ],
      };

      const peerConnection = new RTCPeerConnection(config);
      peerConnectionRef.current = peerConnection;

      // 3. Handle incoming video/audio tracks
      peerConnection.ontrack = (event) => {
        console.log('[Avatar] Received track:', event.track.kind);
        if (event.track.kind === 'video' && videoRef.current) {
          const stream = new MediaStream([event.track]);
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(e => console.log('[Avatar] Video play error:', e));
        }
        if (event.track.kind === 'audio' && videoRef.current) {
          // Audio will be part of the video stream
          const existingStream = videoRef.current.srcObject as MediaStream;
          if (existingStream) {
            existingStream.addTrack(event.track);
          }
        }
      };

      // 4. Handle ICE candidates - send to D-ID
      peerConnection.onicecandidate = async (event) => {
        if (event.candidate && streamIdRef.current && sessionIdRef.current) {
          try {
            await api.post('/avatar/talks-stream/ice', {
              stream_id: streamIdRef.current,
              session_id: sessionIdRef.current,
              candidate: event.candidate.toJSON(),
            });
          } catch (e) {
            // Some ICE candidates may fail, that's normal
            console.log('[Avatar] ICE candidate send:', e);
          }
        }
      };

      // 5. Handle connection state changes
      peerConnection.onconnectionstatechange = () => {
        const connectionState = peerConnection.connectionState;
        console.log('[Avatar] Connection state:', connectionState);
        
        if (connectionState === 'connected') {
          setState(prev => ({ 
            ...prev, 
            isConnected: true, 
            isConnecting: false,
            error: null,
          }));
        } else if (connectionState === 'failed' || connectionState === 'disconnected') {
          setState(prev => ({ 
            ...prev, 
            isConnected: false, 
            isConnecting: false,
            error: connectionState === 'failed' ? 'Connection failed' : 'Disconnected',
          }));
        }
      };

      // 6. Handle data channel for status updates (if D-ID sends one)
      peerConnection.ondatachannel = (event) => {
        console.log('[Avatar] Data channel received');
        dataChannelRef.current = event.channel;
        event.channel.onmessage = (msgEvent) => {
          try {
            const data = JSON.parse(msgEvent.data);
            console.log('[Avatar] Data channel message:', data);
            // Handle speaking status updates
            if (data.type === 'speaking_started') {
              setState(prev => ({ ...prev, isSpeaking: true }));
            } else if (data.type === 'speaking_ended') {
              setState(prev => ({ ...prev, isSpeaking: false }));
            }
          } catch (e) {
            console.log('[Avatar] Data channel parse error:', e);
          }
        };
      };

      // 7. Set remote description (D-ID's offer)
      if (offer) {
        console.log('[Avatar] Setting remote description...');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      } else {
        throw new Error('No offer received from D-ID');
      }

      // 8. Create and set local answer
      console.log('[Avatar] Creating answer...');
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // 9. Send answer to D-ID via backend
      console.log('[Avatar] Sending SDP answer...');
      await api.post('/avatar/talks-stream/sdp', {
        stream_id,
        session_id,
        answer: {
          type: answer.type,
          sdp: answer.sdp,
        },
      });

      setState(prev => ({
        ...prev,
        streamId: stream_id,
        sessionId: session_id,
        isConnecting: false,
        isConnected: true,
        error: null,
      }));

      console.log('[Avatar] Stream connected successfully!');
      return true;

    } catch (error: any) {
      console.error('[Avatar] Stream connection error:', error);
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to connect';
      
      setState(prev => ({
        ...prev,
        isConnecting: false,
        isConnected: false,
        error: errorMessage,
      }));
      
      // Cleanup on error
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      return false;
    }
  }, [state.isConnected, state.isConnecting]);

  /**
   * Make the avatar speak text in real-time using ElevenLabs voice
   */
  const speak = useCallback(async (text: string): Promise<boolean> => {
    if (!state.isConnected || !streamIdRef.current || !sessionIdRef.current) {
      console.warn('[Avatar] Cannot speak: not connected');
      return false;
    }

    if (!text || text.trim().length === 0) {
      return false;
    }

    setState(prev => ({ ...prev, isSpeaking: true }));

    try {
      console.log('[Avatar] Speaking:', text.substring(0, 50) + '...');
      
      await api.post('/avatar/talks-stream/speak', {
        stream_id: streamIdRef.current,
        session_id: sessionIdRef.current,
        text: text,
      });

      // Speaking state will be updated via data channel or timeout
      setTimeout(() => {
        setState(prev => ({ ...prev, isSpeaking: false }));
      }, Math.max(2000, text.length * 60)); // Rough estimate based on text length

      return true;

    } catch (error: any) {
      console.error('[Avatar] Speak error:', error);
      setState(prev => ({ ...prev, isSpeaking: false }));
      return false;
    }
  }, [state.isConnected]);

  /**
   * Disconnect and cleanup the stream
   */
  const disconnect = useCallback(async (): Promise<void> => {
    console.log('[Avatar] Disconnecting...');

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // Close stream on backend/D-ID
    if (streamIdRef.current) {
      try {
        await api.delete(`/avatar/talks-stream/${streamIdRef.current}`);
      } catch (e) {
        console.log('[Avatar] Stream close error:', e);
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

    console.log('[Avatar] Disconnected');
  }, []);

  return {
    state,
    videoRef,
    connect,
    speak,
    disconnect,
  };
}
