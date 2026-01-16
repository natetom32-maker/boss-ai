import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  Dimensions,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Video, ResizeMode } from 'expo-av';
import * as Speech from 'expo-speech';
import { useBossStore } from '../src/store/bossStore';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';

/**
 * UNIFIED BOSS AI ARCHITECTURE
 * 
 * Boss AI Core = Single source of truth (api.boss.ai)
 * D-ID Avatar = Presentation layer only (speaks what Boss decides)
 * 
 * Real-time streaming: WebRTC connection to D-ID for instant speech
 */

interface Message {
  id: string;
  type: 'user' | 'boss';
  content: string;
  timestamp: Date;
  memoryUsed?: Array<{ key: string; scope: string }>;
  modelUsed?: string;
  checkpointRequired?: {
    checkpoint_id: string;
    type: string;
    reason: string;
    title?: string;
    approve_text?: string;
    reject_text?: string;
  };
}

// Avatar images
const BOSS_AVATAR_IDLE = 'https://customer-assets.emergentagent.com/job_2aa2b813-f5fe-4ade-a9d9-bc418df86344/artifacts/ymhkyqfe_generated_video_hd.mp4';
const BOSS_AVATAR_IMAGE = 'https://customer-assets.emergentagent.com/job_2aa2b813-f5fe-4ade-a9d9-bc418df86344/artifacts/maffvqbd_nate%20without%20background.png';

// WebRTC Stream state
interface StreamState {
  isConnected: boolean;
  isConnecting: boolean;
  streamId: string | null;
  sessionId: string | null;
}

export default function BossScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const streamVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const { user, logout } = useAuth();
  
  const {
    sendMessage,
    resolveCheckpoint,
    memoryReceipt,
    fetchMemoryReceipt,
    currentProject,
    isLoading,
  } = useBossStore();

  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [showMemoryReceipt, setShowMemoryReceipt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [avatarState, setAvatarState] = useState<'idle' | 'thinking' | 'speaking'>('idle');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  
  // Real-time stream state
  const [streamState, setStreamState] = useState<StreamState>({
    isConnected: false,
    isConnecting: false,
    streamId: null,
    sessionId: null,
  });

  useEffect(() => {
    fetchMemoryReceipt(currentProject?.project_id);
  }, [currentProject]);

  /**
   * Connect to D-ID real-time stream via WebRTC
   */
  const connectStream = useCallback(async () => {
    if (streamState.isConnected || streamState.isConnecting) return;
    
    setStreamState(prev => ({ ...prev, isConnecting: true }));
    
    try {
      // 1. Create stream on backend
      const createResponse = await api.post('/avatar/stream/create', {});
      const { stream_id, session_id, offer, ice_servers } = createResponse.data;
      
      // 2. Create RTCPeerConnection (web only for now)
      if (Platform.OS === 'web' && typeof RTCPeerConnection !== 'undefined') {
        const config: RTCConfiguration = {
          iceServers: ice_servers?.length > 0 
            ? ice_servers 
            : [{ urls: 'stun:stun.l.google.com:19302' }],
        };
        
        const pc = new RTCPeerConnection(config);
        peerConnectionRef.current = pc;
        
        // Handle incoming video
        pc.ontrack = (event) => {
          if (event.track.kind === 'video' && streamVideoRef.current) {
            const stream = new MediaStream([event.track]);
            streamVideoRef.current.srcObject = stream;
            streamVideoRef.current.play().catch(console.error);
          }
        };
        
        // Set remote description and create answer
        if (offer) {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          
          // Send answer to backend
          await api.post('/avatar/stream/connect', {
            stream_id,
            session_id,
            sdp_answer: answer,
          });
        }
        
        setStreamState({
          isConnected: true,
          isConnecting: false,
          streamId: stream_id,
          sessionId: session_id,
        });
      } else {
        // Mobile - use fallback TTS
        setStreamState(prev => ({ ...prev, isConnecting: false }));
      }
    } catch (error) {
      console.error('Stream connection error:', error);
      setStreamState(prev => ({ ...prev, isConnecting: false }));
    }
  }, [streamState.isConnected, streamState.isConnecting]);

  /**
   * Make avatar speak via real-time stream
   */
  const streamSpeak = useCallback(async (text: string) => {
    if (!streamState.isConnected || !streamState.streamId) {
      // Fallback to TTS
      speakWithTTS(text);
      return;
    }
    
    setAvatarState('speaking');
    
    try {
      await api.post('/avatar/stream/speak', {
        stream_id: streamState.streamId,
        session_id: streamState.sessionId,
        text: text,
      });
      
      // Estimate speaking duration
      const wordCount = text.split(' ').length;
      const duration = Math.max(2000, wordCount * 150);
      
      setTimeout(() => {
        setAvatarState('idle');
      }, duration);
    } catch (error) {
      console.error('Stream speak error:', error);
      setAvatarState('idle');
      // Fallback to TTS
      speakWithTTS(text);
    }
  }, [streamState]);

  /**
   * Fallback: Browser TTS
   */
  const speakWithTTS = async (text: string) => {
    try {
      await Speech.stop();
      setAvatarState('speaking');
      
      Speech.speak(text, {
        language: 'en-US',
        pitch: 0.9,
        rate: 0.95,
        onDone: () => setAvatarState('idle'),
        onError: () => setAvatarState('idle'),
      });
    } catch (error) {
      setAvatarState('idle');
    }
  };

  /**
   * Stop speaking
   */
  const stopSpeaking = async () => {
    await Speech.stop();
    setAvatarState('idle');
  };

  /**
   * Send message to Boss AI
   */
  const handleSend = async (shouldSpeak: boolean = false) => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputText.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const messageText = inputText.trim();
    setInputText('');
    setAvatarState('thinking');

    try {
      // Send to Boss AI Core
      const response = await sendMessage(messageText, currentProject?.project_id);

      const bossMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'boss',
        content: response.response,
        timestamp: new Date(),
        memoryUsed: response.memory_used,
        modelUsed: response.model_used,
        checkpointRequired: response.checkpoint_required,
      };

      setMessages(prev => [...prev, bossMessage]);
      setAvatarState('idle');
      fetchMemoryReceipt(currentProject?.project_id);

      // Speak response if requested
      if (shouldSpeak && !response.checkpoint_required) {
        setTimeout(() => {
          if (streamState.isConnected) {
            streamSpeak(response.response);
          } else {
            speakWithTTS(response.response);
          }
        }, 300);
      }
    } catch (error: any) {
      setAvatarState('idle');
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'boss',
        content: `Error: ${error.message || 'Failed to get response'}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handleCheckpointResolve = async (checkpointId: string, status: 'APPROVED' | 'REJECTED') => {
    await resolveCheckpoint(checkpointId, status);
  };

  const totalMemoryItems = memoryReceipt.reduce((sum, r) => sum + r.items_count, 0);

  const getAvatarBorderColor = () => {
    switch (avatarState) {
      case 'speaking': return '#22C55E';
      case 'thinking': return '#F59E0B';
      default: return '#6366F1';
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.headerCenter} onPress={() => setShowAvatarModal(true)}>
          <View style={[styles.avatarContainer, { borderColor: getAvatarBorderColor() }]}>
            <Image source={{ uri: BOSS_AVATAR_IMAGE }} style={styles.avatarImage} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Boss AI</Text>
            <Text style={[styles.statusBadge, { color: getAvatarBorderColor() }]}>
              {avatarState === 'speaking' ? 'Speaking...' : 
               avatarState === 'thinking' ? 'Thinking...' : 
               streamState.isConnected ? 'Stream Ready' : 'Ready'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsButton}>
          <Ionicons name="ellipsis-vertical" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      {/* Stream Connection Banner */}
      {!streamState.isConnected && (
        <TouchableOpacity style={styles.streamBanner} onPress={connectStream}>
          <Ionicons name="videocam" size={16} color="#6366F1" />
          <Text style={styles.streamBannerText}>
            {streamState.isConnecting ? 'Connecting stream...' : 'Tap to enable real-time avatar'}
          </Text>
          {streamState.isConnecting && <ActivityIndicator size="small" color="#6366F1" />}
        </TouchableOpacity>
      )}

      {/* Memory Bar */}
      <TouchableOpacity style={styles.memoryBar} onPress={() => setShowMemoryReceipt(true)}>
        <View style={styles.memoryIndicator}>
          <Ionicons name="server" size={14} color="#22C55E" />
          <Text style={styles.memoryBarText}>Memory: ON</Text>
        </View>
        <Text style={styles.memoryBarScope}>
          {currentProject ? `L2: ${currentProject.name}` : 'L0: Global'}
        </Text>
        <Text style={styles.memoryBarCount}>{totalMemoryItems} items</Text>
      </TouchableOpacity>

      {/* Messages */}
      <ScrollView ref={scrollRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Image source={{ uri: BOSS_AVATAR_IMAGE }} style={styles.emptyAvatar} />
            <Text style={styles.emptyTitle}>Boss is ready</Text>
            <Text style={styles.emptySubtitle}>
              I'll proceed automatically and only pause at checkpoints.
              {'\n\n'}
              <Text style={styles.tipText}>Tap send = text • Long-press = Boss speaks</Text>
            </Text>
          </View>
        )}

        {messages.map(msg => (
          <View
            key={msg.id}
            style={[styles.messageBubble, msg.type === 'user' ? styles.userBubble : styles.bossBubble]}
          >
            {msg.type === 'boss' && (
              <View style={styles.bossHeader}>
                <Image source={{ uri: BOSS_AVATAR_IMAGE }} style={styles.bossAvatarSmall} />
                {msg.modelUsed && <Text style={styles.modelBadge}>{msg.modelUsed}</Text>}
                <TouchableOpacity
                  style={styles.speakButton}
                  onPress={() => streamState.isConnected ? streamSpeak(msg.content) : speakWithTTS(msg.content)}
                >
                  <Ionicons name="volume-high" size={16} color="#6366F1" />
                </TouchableOpacity>
              </View>
            )}
            
            <Text style={[styles.messageText, msg.type === 'user' ? styles.userText : styles.bossText]}>
              {msg.content}
            </Text>

            {msg.checkpointRequired && (
              <View style={styles.checkpointCard}>
                <View style={styles.checkpointHeader}>
                  <Ionicons name="hand-right" size={20} color="#6366F1" />
                  <Text style={styles.checkpointTitle}>
                    {msg.checkpointRequired.title || 'Your Approval Needed'}
                  </Text>
                </View>
                <Text style={styles.checkpointReason}>{msg.checkpointRequired.reason}</Text>
                <Text style={styles.checkpointHint}>Boss will save your conversation either way.</Text>
                <View style={styles.checkpointActions}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() => handleCheckpointResolve(msg.checkpointRequired!.checkpoint_id, 'REJECTED')}
                  >
                    <Text style={styles.rejectButtonText}>{msg.checkpointRequired.reject_text || 'Reject'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() => handleCheckpointResolve(msg.checkpointRequired!.checkpoint_id, 'APPROVED')}
                  >
                    <Text style={styles.approveButtonText}>{msg.checkpointRequired.approve_text || 'Approve'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {msg.memoryUsed && msg.memoryUsed.length > 0 && (
              <View style={styles.memoryUsedTag}>
                <Ionicons name="server" size={12} color="#6366F1" />
                <Text style={styles.memoryUsedText}>{msg.memoryUsed.length} memory items used</Text>
              </View>
            )}
          </View>
        ))}

        {isLoading && (
          <View style={styles.loadingBubble}>
            <ActivityIndicator size="small" color="#6366F1" />
            <Text style={styles.loadingText}>Boss is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Speaking Indicator */}
      {avatarState === 'speaking' && (
        <TouchableOpacity style={styles.speakingIndicator} onPress={stopSpeaking}>
          <View style={styles.speakingDot} />
          <Text style={styles.speakingIndicatorText}>Boss is speaking... Tap to stop</Text>
        </TouchableOpacity>
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Tell Boss what you need..."
          placeholderTextColor="#666"
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={() => handleSend(false)}
          onLongPress={() => handleSend(true)}
          disabled={!inputText.trim() || isLoading}
          delayLongPress={500}
        >
          <Ionicons name="send" size={20} color={inputText.trim() && !isLoading ? '#FFF' : '#666'} />
        </TouchableOpacity>
      </View>

      {/* Avatar Modal */}
      <Modal visible={showAvatarModal} animationType="fade" transparent onRequestClose={() => setShowAvatarModal(false)}>
        <View style={styles.avatarModalOverlay}>
          <View style={styles.avatarModalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setShowAvatarModal(false)}>
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            
            <Image source={{ uri: BOSS_AVATAR_IMAGE }} style={styles.fullAvatar} />
            
            <Text style={styles.avatarModalTitle}>Boss AI</Text>
            <Text style={styles.avatarModalSubtitle}>
              {streamState.isConnected ? 'Real-time Stream Active' : 'Operating Layer'}
            </Text>
            
            {!streamState.isConnected && (
              <TouchableOpacity style={styles.connectStreamButton} onPress={connectStream}>
                <Ionicons name="videocam" size={20} color="#FFF" />
                <Text style={styles.connectStreamText}>Enable Real-time Avatar</Text>
              </TouchableOpacity>
            )}
            
            {/* WebRTC Video (hidden, for stream) */}
            {Platform.OS === 'web' && streamState.isConnected && (
              <video
                ref={streamVideoRef as any}
                style={{ width: '100%', maxWidth: 300, borderRadius: 12, marginTop: 16 }}
                autoPlay
                playsInline
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Memory Receipt Modal */}
      <Modal visible={showMemoryReceipt} animationType="slide" transparent onRequestClose={() => setShowMemoryReceipt(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Memory Receipt</Text>
              <TouchableOpacity onPress={() => setShowMemoryReceipt(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.modalScroll}>
              {memoryReceipt.map((receipt, index) => (
                <View key={index} style={styles.receiptCard}>
                  <View style={styles.receiptHeader}>
                    <Text style={styles.receiptScope}>{receipt.scope}</Text>
                    <Text style={styles.receiptCount}>{receipt.items_count} items</Text>
                  </View>
                  {receipt.items_used.map((item, idx) => (
                    <View key={idx} style={styles.receiptItem}>
                      <Text style={styles.receiptKey}>{item.key}</Text>
                      <Text style={styles.receiptValue} numberOfLines={2}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              ))}
              {memoryReceipt.length === 0 && (
                <Text style={styles.noReceipt}>No memory items in context</Text>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="fade" transparent onRequestClose={() => setShowSettings(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowSettings(false)}>
          <View style={styles.settingsMenu}>
            <View style={styles.userInfo}>
              <Ionicons name="person-circle" size={40} color="#6366F1" />
              <View style={styles.userDetails}>
                <Text style={styles.userName}>{user?.name}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
              </View>
            </View>
            
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowSettings(false); router.push('/memory'); }}>
              <Ionicons name="server" size={20} color="#A855F7" />
              <Text style={styles.menuText}>Memory Engine</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.menuItem} onPress={() => { setShowSettings(false); router.push('/projects'); }}>
              <Ionicons name="folder" size={20} color="#22C55E" />
              <Text style={styles.menuText}>Projects</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={() => { setShowSettings(false); logout(); }}>
              <Ionicons name="log-out" size={20} color="#EF4444" />
              <Text style={[styles.menuText, styles.logoutText]}>Logout</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  backButton: { padding: 8 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    marginRight: 12,
    borderWidth: 2,
  },
  avatarImage: { width: '100%', height: '100%' },
  headerTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  statusBadge: { fontSize: 12, marginTop: 2 },
  settingsButton: { padding: 8 },
  streamBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366F115',
    paddingVertical: 8,
    gap: 8,
  },
  streamBannerText: { color: '#6366F1', fontSize: 12 },
  memoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  memoryIndicator: { flexDirection: 'row', alignItems: 'center' },
  memoryBarText: { color: '#22C55E', fontSize: 12, fontWeight: '600', marginLeft: 6 },
  memoryBarScope: { color: '#888', fontSize: 12, marginLeft: 16, flex: 1 },
  memoryBarCount: { color: '#666', fontSize: 12 },
  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyAvatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#1A1A2E' },
  emptyTitle: { color: '#FFF', fontSize: 20, fontWeight: '600', marginTop: 20 },
  emptySubtitle: { color: '#666', fontSize: 14, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 },
  tipText: { color: '#6366F1', fontSize: 12 },
  messageBubble: { maxWidth: '85%', borderRadius: 16, padding: 14, marginBottom: 12 },
  userBubble: { backgroundColor: '#6366F1', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  bossBubble: { backgroundColor: '#1A1A2E', alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  bossHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  bossAvatarSmall: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#0A0A0F' },
  modelBadge: { color: '#666', fontSize: 10, marginLeft: 8, backgroundColor: '#0A0A0F', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, flex: 1 },
  speakButton: { padding: 6, marginLeft: 8, backgroundColor: '#0A0A0F', borderRadius: 12 },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: '#FFF' },
  bossText: { color: '#E5E5E5' },
  checkpointCard: { backgroundColor: '#1A1A2E', borderRadius: 12, padding: 14, marginTop: 12, borderWidth: 1, borderColor: '#6366F140' },
  checkpointHeader: { flexDirection: 'row', alignItems: 'center' },
  checkpointTitle: { color: '#FFF', fontSize: 15, fontWeight: '600', marginLeft: 8 },
  checkpointReason: { color: '#CCC', fontSize: 13, marginTop: 10, lineHeight: 18 },
  checkpointHint: { color: '#666', fontSize: 11, marginTop: 8, fontStyle: 'italic' },
  checkpointActions: { flexDirection: 'row', marginTop: 14, gap: 12 },
  rejectButton: { flex: 1, backgroundColor: '#2A2A3E', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  rejectButtonText: { color: '#AAA', fontWeight: '500', fontSize: 13 },
  approveButton: { flex: 1, backgroundColor: '#6366F1', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  approveButtonText: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  memoryUsedTag: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#333' },
  memoryUsedText: { color: '#6366F1', fontSize: 11, marginLeft: 6 },
  loadingBubble: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A2E', borderRadius: 16, padding: 14, alignSelf: 'flex-start' },
  loadingText: { color: '#888', fontSize: 14, marginLeft: 10 },
  speakingIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E20', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#22C55E40' },
  speakingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#22C55E', marginRight: 8 },
  speakingIndicatorText: { color: '#22C55E', fontSize: 13, fontWeight: '500' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#1A1A2E', backgroundColor: '#0A0A0F' },
  input: { flex: 1, backgroundColor: '#1A1A2E', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 12, color: '#FFF', fontSize: 15, maxHeight: 120, marginRight: 12 },
  sendButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#6366F1', justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#1A1A2E' },
  avatarModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  avatarModalContent: { width: SCREEN_WIDTH * 0.9, maxWidth: 400, alignItems: 'center' },
  closeButton: { position: 'absolute', top: -50, right: 0, padding: 10 },
  fullAvatar: { width: 200, height: 200, borderRadius: 100, backgroundColor: '#1A1A2E' },
  avatarModalTitle: { color: '#FFF', fontSize: 24, fontWeight: '700', marginTop: 20 },
  avatarModalSubtitle: { color: '#6366F1', fontSize: 14, marginTop: 4 },
  connectStreamButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#6366F1', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 20, marginTop: 20, gap: 8 },
  connectStreamText: { color: '#FFF', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#12121A', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: '#1A1A2E' },
  modalTitle: { color: '#FFF', fontSize: 18, fontWeight: '600' },
  modalScroll: { padding: 20 },
  receiptCard: { backgroundColor: '#1A1A2E', borderRadius: 12, padding: 16, marginBottom: 16 },
  receiptHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  receiptScope: { color: '#6366F1', fontSize: 14, fontWeight: '600' },
  receiptCount: { color: '#666', fontSize: 12 },
  receiptItem: { backgroundColor: '#0A0A0F', borderRadius: 8, padding: 10, marginBottom: 8 },
  receiptKey: { color: '#A855F7', fontSize: 12, fontWeight: '600' },
  receiptValue: { color: '#888', fontSize: 12, marginTop: 4 },
  noReceipt: { color: '#666', fontSize: 14, textAlign: 'center', paddingVertical: 40 },
  settingsMenu: { backgroundColor: '#12121A', borderRadius: 16, margin: 20, marginTop: 'auto', marginBottom: 40, padding: 16 },
  userInfo: { flexDirection: 'row', alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#1A1A2E', marginBottom: 8 },
  userDetails: { marginLeft: 12 },
  userName: { color: '#FFF', fontSize: 16, fontWeight: '600' },
  userEmail: { color: '#888', fontSize: 13, marginTop: 2 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  menuText: { color: '#FFF', fontSize: 15, marginLeft: 14 },
  logoutItem: { borderTopWidth: 1, borderTopColor: '#1A1A2E', marginTop: 8, paddingTop: 16 },
  logoutText: { color: '#EF4444' },
});
