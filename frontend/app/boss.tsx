import React, { useState, useRef, useEffect } from 'react';
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
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import * as Speech from 'expo-speech';
import { useBossStore } from '../src/store/bossStore';
import { useAuth } from '../src/context/AuthContext';
import { api } from '../src/services/api';

/**
 * UNIFIED BOSS AI ARCHITECTURE
 * 
 * Boss AI Core (memory + autopilot + checkpoints)
 *        ↑
 *   API boundary (/api/boss/message, /api/avatar/generate)
 *        ↑
 * UI / D-ID Avatar (presentation layer only)
 * 
 * The avatar speaks what Boss decides.
 * Boss does not live inside the avatar.
 * 
 * Avatar States:
 * 1. IDLE: Static image - Boss is listening/thinking
 * 2. SPEAKING: D-ID video - Boss is speaking exact response text
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
  videoUrl?: string;
  videoStatus?: 'generating' | 'ready' | 'failed';
}

// Boss AI Avatar - IDLE state (static image or looping video)
const BOSS_AVATAR_IDLE = 'https://customer-assets.emergentagent.com/job_2aa2b813-f5fe-4ade-a9d9-bc418df86344/artifacts/ymhkyqfe_generated_video_hd.mp4';

// Boss AI Avatar - User's image (Nate) for display
const BOSS_AVATAR_IMAGE = 'https://customer-assets.emergentagent.com/job_2aa2b813-f5fe-4ade-a9d9-bc418df86344/artifacts/maffvqbd_nate%20without%20background.png';

export default function BossScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const videoRef = useRef<Video>(null);
  const speakingVideoRef = useRef<Video>(null);
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
  
  // Avatar states
  const [avatarState, setAvatarState] = useState<'idle' | 'thinking' | 'speaking'>('idle');
  const [speakingVideoUrl, setSpeakingVideoUrl] = useState<string | null>(null);
  const [currentSpeakingText, setCurrentSpeakingText] = useState<string>('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  useEffect(() => {
    fetchMemoryReceipt(currentProject?.project_id);
  }, [currentProject]);

  /**
   * Generate D-ID video for Boss AI response
   * This is the ONLY way the avatar speaks - with exact text from Boss AI Core
   */
  const generateAvatarVideo = async (text: string, messageId?: string): Promise<string | null> => {
    try {
      setIsGeneratingVideo(true);
      setAvatarState('thinking');
      
      // Call backend to generate D-ID video with exact Boss AI response text
      const response = await api.post('/avatar/generate', {
        script_text: text.substring(0, 500), // D-ID limit
        voice_id: 'en-US-GuyNeural' // Male voice for Boss
      });
      
      const videoId = response.data.video_id;
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await api.get(`/avatar/status/${videoId}`);
        
        if (statusResponse.data.status === 'completed') {
          const videoUrl = statusResponse.data.result_video_url;
          
          // Update message if messageId provided
          if (messageId) {
            setMessages(prev => prev.map(msg => 
              msg.id === messageId 
                ? { ...msg, videoUrl, videoStatus: 'ready' }
                : msg
            ));
          }
          
          setIsGeneratingVideo(false);
          return videoUrl;
        } else if (statusResponse.data.status === 'failed') {
          if (messageId) {
            setMessages(prev => prev.map(msg => 
              msg.id === messageId 
                ? { ...msg, videoStatus: 'failed' }
                : msg
            ));
          }
          setIsGeneratingVideo(false);
          return null;
        }
        
        attempts++;
      }
      
      setIsGeneratingVideo(false);
      return null;
    } catch (error) {
      console.error('D-ID video generation error:', error);
      setIsGeneratingVideo(false);
      return null;
    }
  };

  /**
   * Play the avatar speaking video
   */
  const playAvatarVideo = (videoUrl: string, text: string) => {
    setSpeakingVideoUrl(videoUrl);
    setCurrentSpeakingText(text);
    setAvatarState('speaking');
    setShowAvatarModal(true);
  };

  /**
   * Fallback: Use browser TTS if D-ID fails
   */
  const speakWithTTS = async (text: string) => {
    try {
      await Speech.stop();
      setAvatarState('speaking');
      setCurrentSpeakingText(text);
      
      Speech.speak(text, {
        language: 'en-US',
        pitch: 0.9,
        rate: 0.95,
        onDone: () => {
          setAvatarState('idle');
          setCurrentSpeakingText('');
        },
        onError: () => {
          setAvatarState('idle');
          setCurrentSpeakingText('');
        },
      });
    } catch (error) {
      console.error('TTS error:', error);
      setAvatarState('idle');
    }
  };

  /**
   * Stop any speaking
   */
  const stopSpeaking = async () => {
    await Speech.stop();
    setSpeakingVideoUrl(null);
    setCurrentSpeakingText('');
    setAvatarState('idle');
  };

  /**
   * Handle video playback end
   */
  const handleVideoEnd = (status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      setAvatarState('idle');
      setSpeakingVideoUrl(null);
      setCurrentSpeakingText('');
    }
  };

  /**
   * UNIFIED FLOW:
   * 1. User input (text)
   * 2. Send to Boss AI Core (/api/boss/message)
   * 3. Boss AI processes with memory, autopilot, checkpoints
   * 4. Boss AI returns response.response (exact text)
   * 5. UI renders text immediately
   * 6. If shouldSpeak: Generate D-ID video with exact response.response
   * 7. Play video (avatar speaks Boss's words)
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
      // Send to Boss AI Core - the SINGLE source of truth
      const response = await sendMessage(
        messageText,
        currentProject?.project_id
      );

      // Create Boss response message with exact text
      const bossMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'boss',
        content: response.response, // EXACT text from Boss AI
        timestamp: new Date(),
        memoryUsed: response.memory_used,
        modelUsed: response.model_used,
        checkpointRequired: response.checkpoint_required,
        videoStatus: shouldSpeak ? 'generating' : undefined,
      };

      setMessages(prev => [...prev, bossMessage]);
      setAvatarState('idle');
      fetchMemoryReceipt(currentProject?.project_id);

      // If user wants Boss to speak, generate D-ID video with EXACT response text
      if (shouldSpeak && !response.checkpoint_required) {
        const videoUrl = await generateAvatarVideo(response.response, bossMessage.id);
        
        if (videoUrl) {
          // Play the D-ID video
          playAvatarVideo(videoUrl, response.response);
        } else {
          // Fallback to TTS if D-ID fails
          speakWithTTS(response.response);
        }
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

  /**
   * Speak a specific message (tap speaker icon)
   */
  const speakMessage = async (message: Message) => {
    if (message.videoUrl) {
      // Already has video, just play it
      playAvatarVideo(message.videoUrl, message.content);
    } else {
      // Generate new video
      const videoUrl = await generateAvatarVideo(message.content, message.id);
      if (videoUrl) {
        playAvatarVideo(videoUrl, message.content);
      } else {
        speakWithTTS(message.content);
      }
    }
  };

  const handleCheckpointResolve = async (
    checkpointId: string,
    status: 'APPROVED' | 'REJECTED'
  ) => {
    await resolveCheckpoint(checkpointId, status);
  };

  const totalMemoryItems = memoryReceipt.reduce(
    (sum, r) => sum + r.items_count,
    0
  );

  // Avatar border color based on state
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
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.headerCenter}
          onPress={() => setShowAvatarModal(true)}
        >
          <View style={[
            styles.avatarContainer, 
            { borderColor: getAvatarBorderColor() },
            avatarState === 'speaking' && styles.avatarSpeaking
          ]}>
            <Video
              ref={videoRef}
              source={{ uri: BOSS_AVATAR_IDLE }}
              style={styles.avatarVideo}
              resizeMode={ResizeMode.COVER}
              shouldPlay={avatarState !== 'idle'}
              isLooping={true}
              isMuted={true}
            />
          </View>
          <View>
            <Text style={styles.headerTitle}>Boss AI</Text>
            <Text style={[styles.statusBadge, { color: getAvatarBorderColor() }]}>
              {avatarState === 'speaking' ? 'Speaking...' : 
               avatarState === 'thinking' ? 'Thinking...' : 
               currentProject ? currentProject.name : 'Ready'}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setShowSettings(true)}
          style={styles.settingsButton}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      {/* Memory Receipt Bar */}
      <TouchableOpacity
        style={styles.memoryBar}
        onPress={() => setShowMemoryReceipt(true)}
      >
        <View style={styles.memoryIndicator}>
          <Ionicons name="server" size={14} color="#22C55E" />
          <Text style={styles.memoryBarText}>Memory: ON</Text>
        </View>
        <Text style={styles.memoryBarScope}>
          {currentProject ? `L2: ${currentProject.name}` : 'L0: Global'}
        </Text>
        <Text style={styles.memoryBarCount}>{totalMemoryItems} items</Text>
        <Ionicons name="chevron-forward" size={16} color="#666" />
      </TouchableOpacity>

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <TouchableOpacity 
              style={styles.emptyAvatarContainer}
              onPress={() => setShowAvatarModal(true)}
            >
              <Video
                source={{ uri: BOSS_AVATAR_IDLE }}
                style={styles.emptyAvatarVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={true}
                isLooping={true}
                isMuted={true}
              />
            </TouchableOpacity>
            <Text style={styles.emptyTitle}>Boss is ready</Text>
            <Text style={styles.emptySubtitle}>
              I'll proceed automatically and only pause at checkpoints.
              {'\n\n'}
              <Text style={styles.tipText}>💡 Tap send = text • Long-press = Boss speaks</Text>
            </Text>
          </View>
        )}

        {messages.map(msg => (
          <View
            key={msg.id}
            style={[
              styles.messageBubble,
              msg.type === 'user' ? styles.userBubble : styles.bossBubble,
            ]}
          >
            {msg.type === 'boss' && (
              <View style={styles.bossHeader}>
                <View style={styles.bossAvatarSmall}>
                  <Image
                    source={{ uri: BOSS_AVATAR_IMAGE }}
                    style={styles.bossAvatarSmallImage}
                  />
                </View>
                {msg.modelUsed && (
                  <Text style={styles.modelBadge}>{msg.modelUsed}</Text>
                )}
                {/* Speak Button - generates D-ID video with exact message content */}
                <TouchableOpacity
                  style={styles.speakButton}
                  onPress={() => speakMessage(msg)}
                  disabled={msg.videoStatus === 'generating' || isGeneratingVideo}
                >
                  {msg.videoStatus === 'generating' || (isGeneratingVideo && !msg.videoUrl) ? (
                    <ActivityIndicator size="small" color="#6366F1" />
                  ) : msg.videoUrl ? (
                    <Ionicons name="play-circle" size={18} color="#22C55E" />
                  ) : (
                    <Ionicons name="volume-high" size={16} color="#6366F1" />
                  )}
                </TouchableOpacity>
              </View>
            )}
            
            <Text
              style={[
                styles.messageText,
                msg.type === 'user' ? styles.userText : styles.bossText,
              ]}
            >
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
                <Text style={styles.checkpointReason}>
                  {msg.checkpointRequired.reason}
                </Text>
                <Text style={styles.checkpointHint}>
                  Boss will save your conversation either way.
                </Text>
                <View style={styles.checkpointActions}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() =>
                      handleCheckpointResolve(
                        msg.checkpointRequired!.checkpoint_id,
                        'REJECTED'
                      )
                    }
                  >
                    <Text style={styles.rejectButtonText}>
                      {msg.checkpointRequired.reject_text || "Don't proceed"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() =>
                      handleCheckpointResolve(
                        msg.checkpointRequired!.checkpoint_id,
                        'APPROVED'
                      )
                    }
                  >
                    <Text style={styles.approveButtonText}>
                      {msg.checkpointRequired.approve_text || 'Yes, continue'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {msg.memoryUsed && msg.memoryUsed.length > 0 && (
              <View style={styles.memoryUsedTag}>
                <Ionicons name="server" size={12} color="#6366F1" />
                <Text style={styles.memoryUsedText}>
                  {msg.memoryUsed.length} memory items used
                </Text>
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

        {isGeneratingVideo && (
          <View style={styles.generatingBubble}>
            <ActivityIndicator size="small" color="#22C55E" />
            <Text style={styles.generatingText}>Generating avatar video...</Text>
          </View>
        )}
      </ScrollView>

      {/* Speaking Indicator */}
      {avatarState === 'speaking' && (
        <TouchableOpacity 
          style={styles.speakingIndicator}
          onPress={stopSpeaking}
        >
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
        {/* Send Button - Tap for text, Long-press to hear Boss speak */}
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
          ]}
          onPress={() => handleSend(false)}
          onLongPress={() => handleSend(true)}
          disabled={!inputText.trim() || isLoading}
          delayLongPress={500}
        >
          <Ionicons
            name="send"
            size={20}
            color={inputText.trim() && !isLoading ? '#FFF' : '#666'}
          />
        </TouchableOpacity>
      </View>

      {/* Avatar Speaking Modal - D-ID Video Player */}
      <Modal
        visible={showAvatarModal && !!speakingVideoUrl}
        animationType="fade"
        transparent
        onRequestClose={() => {
          setShowAvatarModal(false);
          stopSpeaking();
        }}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={styles.avatarModalContent}>
            <TouchableOpacity
              style={styles.closeAvatarButton}
              onPress={() => {
                setShowAvatarModal(false);
                stopSpeaking();
              }}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            
            {/* D-ID Speaking Video */}
            <Video
              ref={speakingVideoRef}
              source={{ uri: speakingVideoUrl || BOSS_AVATAR_IDLE }}
              style={styles.fullAvatarVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={true}
              isLooping={false}
              onPlaybackStatusUpdate={handleVideoEnd}
              useNativeControls={false}
            />
            
            <Text style={styles.avatarModalTitle}>Boss AI</Text>
            <Text style={styles.avatarModalSubtitle}>Speaking Response</Text>
            
            {currentSpeakingText && (
              <View style={styles.speakingTextContainer}>
                <Text style={styles.speakingTextLabel}>Speaking:</Text>
                <Text style={styles.speakingTextContent} numberOfLines={3}>
                  "{currentSpeakingText}"
                </Text>
              </View>
            )}
            
            <TouchableOpacity style={styles.stopButton} onPress={stopSpeaking}>
              <Ionicons name="stop-circle" size={24} color="#EF4444" />
              <Text style={styles.stopButtonText}>Stop</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Avatar Idle Modal - View avatar without speaking */}
      <Modal
        visible={showAvatarModal && !speakingVideoUrl}
        animationType="fade"
        transparent
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <View style={styles.avatarModalOverlay}>
          <View style={styles.avatarModalContent}>
            <TouchableOpacity
              style={styles.closeAvatarButton}
              onPress={() => setShowAvatarModal(false)}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            
            <Video
              source={{ uri: BOSS_AVATAR_IDLE }}
              style={styles.fullAvatarVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={true}
              isLooping={true}
              isMuted={true}
            />
            
            <Text style={styles.avatarModalTitle}>Boss AI</Text>
            <Text style={styles.avatarModalSubtitle}>
              {avatarState === 'thinking' ? 'Thinking...' : 'Operating Layer'}
            </Text>
            
            <Text style={styles.avatarHint}>
              The avatar speaks what Boss decides.{'\n'}
              Boss does not live inside the avatar.
            </Text>
          </View>
        </View>
      </Modal>

      {/* Memory Receipt Modal */}
      <Modal
        visible={showMemoryReceipt}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMemoryReceipt(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Memory Receipt</Text>
              <TouchableOpacity onPress={() => setShowMemoryReceipt(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.architectureNote}>
              Single source of truth: All memory managed by Boss AI Core
            </Text>

            <ScrollView style={styles.modalScroll}>
              {memoryReceipt.map((receipt, index) => (
                <View key={index} style={styles.receiptCard}>
                  <View style={styles.receiptHeader}>
                    <Text style={styles.receiptScope}>{receipt.scope}</Text>
                    <Text style={styles.receiptCount}>
                      {receipt.items_count} items
                    </Text>
                  </View>
                  {receipt.items_used.map((item, idx) => (
                    <View key={idx} style={styles.receiptItem}>
                      <Text style={styles.receiptKey}>{item.key}</Text>
                      <Text style={styles.receiptValue} numberOfLines={2}>
                        {item.value}
                      </Text>
                    </View>
                  ))}
                  <Text style={styles.receiptWhy}>{receipt.why_used}</Text>
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
      <Modal
        visible={showSettings}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <View style={styles.settingsMenu}>
            <View style={styles.userInfo}>
              <Ionicons name="person-circle" size={40} color="#6366F1" />
              <View style={styles.userDetails}>
                <Text style={styles.userName}>{user?.name}</Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
              </View>
            </View>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowSettings(false);
                router.push('/memory');
              }}
            >
              <Ionicons name="server" size={20} color="#A855F7" />
              <Text style={styles.menuText}>Memory Engine</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowSettings(false);
                router.push('/projects');
              }}
            >
              <Ionicons name="folder" size={20} color="#22C55E" />
              <Text style={styles.menuText}>Projects</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setShowSettings(false);
                router.push('/decisions');
              }}
            >
              <Ionicons name="checkmark-done" size={20} color="#F59E0B" />
              <Text style={styles.menuText}>Decisions</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.menuItem, styles.logoutItem]}
              onPress={() => {
                setShowSettings(false);
                logout();
              }}
            >
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
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  backButton: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    marginRight: 12,
    borderWidth: 2,
  },
  avatarSpeaking: {
    borderWidth: 3,
  },
  avatarVideo: {
    width: '100%',
    height: '100%',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  statusBadge: {
    fontSize: 12,
    marginTop: 2,
  },
  settingsButton: {
    padding: 8,
  },
  memoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  memoryIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memoryBarText: {
    color: '#22C55E',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  memoryBarScope: {
    color: '#888',
    fontSize: 12,
    marginLeft: 16,
    flex: 1,
  },
  memoryBarCount: {
    color: '#666',
    fontSize: 12,
    marginRight: 8,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyAvatarContainer: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: 'hidden',
    backgroundColor: '#1A1A2E',
    borderWidth: 3,
    borderColor: '#6366F1',
  },
  emptyAvatarVideo: {
    width: '100%',
    height: '100%',
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
    marginTop: 20,
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
    lineHeight: 20,
  },
  tipText: {
    color: '#6366F1',
    fontSize: 12,
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  userBubble: {
    backgroundColor: '#6366F1',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bossBubble: {
    backgroundColor: '#1A1A2E',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
  },
  bossHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  bossAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0A0A0F',
  },
  bossAvatarSmallImage: {
    width: '100%',
    height: '100%',
  },
  modelBadge: {
    color: '#666',
    fontSize: 10,
    marginLeft: 8,
    backgroundColor: '#0A0A0F',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    flex: 1,
  },
  speakButton: {
    padding: 6,
    marginLeft: 8,
    backgroundColor: '#0A0A0F',
    borderRadius: 12,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFF',
  },
  bossText: {
    color: '#E5E5E5',
  },
  checkpointCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#6366F140',
  },
  checkpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkpointTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  checkpointReason: {
    color: '#CCC',
    fontSize: 13,
    marginTop: 10,
    lineHeight: 18,
  },
  checkpointHint: {
    color: '#666',
    fontSize: 11,
    marginTop: 8,
    fontStyle: 'italic',
  },
  checkpointActions: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#2A2A3E',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#AAA',
    fontWeight: '500',
    fontSize: 13,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#6366F1',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 13,
  },
  memoryUsedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  memoryUsedText: {
    color: '#6366F1',
    fontSize: 11,
    marginLeft: 6,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 14,
    alignSelf: 'flex-start',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginLeft: 10,
  },
  generatingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A2E1A',
    borderRadius: 16,
    padding: 14,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  generatingText: {
    color: '#22C55E',
    fontSize: 13,
    marginLeft: 10,
  },
  speakingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E20',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#22C55E40',
  },
  speakingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    marginRight: 8,
  },
  speakingIndicatorText: {
    color: '#22C55E',
    fontSize: 13,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1A1A2E',
    backgroundColor: '#0A0A0F',
  },
  input: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: '#FFF',
    fontSize: 15,
    maxHeight: 120,
    marginRight: 12,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#1A1A2E',
  },
  avatarModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarModalContent: {
    width: SCREEN_WIDTH * 0.9,
    maxWidth: 400,
    alignItems: 'center',
  },
  closeAvatarButton: {
    position: 'absolute',
    top: -50,
    right: 0,
    padding: 10,
    zIndex: 10,
  },
  fullAvatarVideo: {
    width: SCREEN_WIDTH * 0.85,
    height: SCREEN_WIDTH * 0.85,
    borderRadius: 20,
    backgroundColor: '#1A1A2E',
  },
  avatarModalTitle: {
    color: '#FFF',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 20,
  },
  avatarModalSubtitle: {
    color: '#6366F1',
    fontSize: 14,
    marginTop: 4,
  },
  speakingTextContainer: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
  },
  speakingTextLabel: {
    color: '#888',
    fontSize: 12,
    marginBottom: 8,
  },
  speakingTextContent: {
    color: '#FFF',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 20,
  },
  stopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#EF444420',
    borderRadius: 20,
  },
  stopButtonText: {
    color: '#EF4444',
    marginLeft: 6,
    fontWeight: '600',
  },
  avatarHint: {
    color: '#555',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#12121A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  architectureNote: {
    color: '#6366F1',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 8,
    backgroundColor: '#6366F110',
  },
  modalScroll: {
    padding: 20,
  },
  receiptCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  receiptScope: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '600',
  },
  receiptCount: {
    color: '#666',
    fontSize: 12,
  },
  receiptItem: {
    backgroundColor: '#0A0A0F',
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  receiptKey: {
    color: '#A855F7',
    fontSize: 12,
    fontWeight: '600',
  },
  receiptValue: {
    color: '#888',
    fontSize: 12,
    marginTop: 4,
  },
  receiptWhy: {
    color: '#555',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 8,
  },
  noReceipt: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 40,
  },
  settingsMenu: {
    backgroundColor: '#12121A',
    borderRadius: 16,
    margin: 20,
    marginTop: 'auto',
    marginBottom: 40,
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
    marginBottom: 8,
  },
  userDetails: {
    marginLeft: 12,
  },
  userName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  userEmail: {
    color: '#888',
    fontSize: 13,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuText: {
    color: '#FFF',
    fontSize: 15,
    marginLeft: 14,
  },
  logoutItem: {
    borderTopWidth: 1,
    borderTopColor: '#1A1A2E',
    marginTop: 8,
    paddingTop: 16,
  },
  logoutText: {
    color: '#EF4444',
  },
});
