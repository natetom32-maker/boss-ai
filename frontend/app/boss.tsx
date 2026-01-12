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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { useBossStore } from '../src/store/bossStore';
import { useAuth } from '../src/context/AuthContext';
import api from '../src/services/api';

// Conditionally import WebView only for native platforms
let WebView: any = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

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
  };
  videoStatus?: string;
}

// Boss AI Avatar Video URLs (the topographic glowing face)
const BOSS_AVATAR_VIDEOS = [
  'https://customer-assets.emergentagent.com/job_boss-ai-1/artifacts/qfwcfoxo_generated_video.mp4',
  'https://customer-assets.emergentagent.com/job_boss-ai-1/artifacts/srtfk7f5_generated_1video_hd.mp4',
  'https://customer-assets.emergentagent.com/job_boss-ai-1/artifacts/dezhrl51_generated_2video.mp4',
];

// D-ID Agent Configuration
const DID_AGENT_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Boss AI - Talk</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { 
      width: 100%; 
      height: 100%; 
      background: #0A0A0F;
      overflow: hidden;
    }
    #did-agent-container {
      width: 100%;
      height: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .loading {
      color: #888;
      font-family: system-ui, -apple-system, sans-serif;
      text-align: center;
    }
    .loading-spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top-color: #6366F1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="did-agent-container">
    <div class="loading">
      <div class="loading-spinner"></div>
      <p>Loading Boss AI...</p>
    </div>
  </div>
  <script type="module"
    src="https://agent.d-id.com/v2/index.js"
    data-mode="full"
    data-client-key="Z29vZ2xlLW9hdXRoMnwxMTM0MDI1Nzg1OTM5NTA5MTQ3OTU6b0dOeW5WYnJfb0drTU1DVDRoMWJ1"
    data-agent-id="v2_agt_M6rCWkOz"
    data-name="did-agent"
    data-monitor="true"
    data-target-id="did-agent-container">
  </script>
</body>
</html>
`;

// D-ID Agent URL for web (opens in popup/new tab)
const DID_AGENT_URL = `data:text/html;charset=utf-8,${encodeURIComponent(DID_AGENT_HTML)}`;

export default function BossScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const videoRef = useRef<Video>(null);
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
  const [isAvatarPlaying, setIsAvatarPlaying] = useState(false);
  const [currentVideoIndex, setCurrentVideoIndex] = useState(0);
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [showDIDAgent, setShowDIDAgent] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  useEffect(() => {
    fetchMemoryReceipt(currentProject?.project_id);
  }, [currentProject]);

  const handleSend = async () => {
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

    try {
      const response = await sendMessage(
        messageText,
        currentProject?.project_id
      );

      const bossMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'boss',
        content: response.response,
        timestamp: new Date(),
        memoryUsed: response.memory_used,
        modelUsed: response.model_used,
        checkpointRequired: response.checkpoint_required,
        videoStatus: response.video_status,
      };

      setMessages(prev => [...prev, bossMessage]);
      fetchMemoryReceipt(currentProject?.project_id);
      
      // Play avatar animation when Boss responds
      playAvatarAnimation();
    } catch (error: any) {
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

  const playAvatarAnimation = () => {
    setIsAvatarPlaying(true);
    // Cycle through videos
    setCurrentVideoIndex(prev => (prev + 1) % BOSS_AVATAR_VIDEOS.length);
  };

  const handlePlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (status.isLoaded && status.didJustFinish) {
      setIsAvatarPlaying(false);
    }
  };

  const handleCheckpointResolve = async (
    checkpointId: string,
    status: 'APPROVED' | 'REJECTED'
  ) => {
    await resolveCheckpoint(checkpointId, status);
  };

  const generateAvatarVideo = async (text: string) => {
    try {
      setIsGeneratingVideo(true);
      const response = await api.post('/avatar/generate', {
        script_text: text.substring(0, 300),
        voice_id: 'en-US-JennyNeural'
      });
      
      const videoId = response.data.video_id;
      
      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60;
      
      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const statusResponse = await api.get(`/avatar/status/${videoId}`);
        
        if (statusResponse.data.status === 'completed') {
          setGeneratedVideoUrl(statusResponse.data.result_video_url);
          setShowAvatarModal(true);
          break;
        } else if (statusResponse.data.status === 'failed') {
          console.error('Video generation failed:', statusResponse.data.error_message);
          break;
        }
        
        attempts++;
      }
    } catch (error) {
      console.error('Error generating avatar video:', error);
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const totalMemoryItems = memoryReceipt.reduce(
    (sum, r) => sum + r.items_count,
    0
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header with Avatar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.headerCenter}
          onPress={() => setShowDIDAgent(true)}
        >
          <View style={styles.avatarContainer}>
            <Video
              ref={videoRef}
              source={{ uri: BOSS_AVATAR_VIDEOS[currentVideoIndex] }}
              style={styles.avatarVideo}
              resizeMode={ResizeMode.COVER}
              shouldPlay={isAvatarPlaying}
              isLooping={false}
              isMuted={true}
              onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
            />
            {isAvatarPlaying && (
              <View style={styles.avatarGlow} />
            )}
          </View>
          <View>
            <Text style={styles.headerTitle}>Boss AI</Text>
            {currentProject && (
              <Text style={styles.projectBadge}>{currentProject.name}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Talk to Avatar Button */}
        <TouchableOpacity
          onPress={() => setShowDIDAgent(true)}
          style={styles.talkButton}
        >
          <Ionicons name="mic" size={20} color="#6366F1" />
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
              onPress={() => setShowDIDAgent(true)}
            >
              <Video
                source={{ uri: BOSS_AVATAR_VIDEOS[0] }}
                style={styles.emptyAvatarVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={true}
                isLooping={true}
                isMuted={true}
              />
              <View style={styles.talkOverlay}>
                <Ionicons name="mic" size={32} color="#FFF" />
                <Text style={styles.talkOverlayText}>Tap to Talk</Text>
              </View>
            </TouchableOpacity>
            <Text style={styles.emptyTitle}>Boss is ready</Text>
            <Text style={styles.emptySubtitle}>
              Tap the avatar to talk with Boss, or type below.
              I'll proceed automatically and only pause at checkpoints.
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
                  <Video
                    source={{ uri: BOSS_AVATAR_VIDEOS[currentVideoIndex] }}
                    style={styles.bossAvatarSmallVideo}
                    resizeMode={ResizeMode.COVER}
                    shouldPlay={false}
                    isMuted={true}
                  />
                </View>
                {msg.modelUsed && (
                  <Text style={styles.modelBadge}>{msg.modelUsed}</Text>
                )}
                {/* Generate Video Button */}
                <TouchableOpacity
                  style={styles.videoButton}
                  onPress={() => generateAvatarVideo(msg.content)}
                  disabled={isGeneratingVideo}
                >
                  {isGeneratingVideo ? (
                    <ActivityIndicator size="small" color="#6366F1" />
                  ) : (
                    <Ionicons name="videocam" size={14} color="#6366F1" />
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
                  <Ionicons name="warning" size={20} color="#F59E0B" />
                  <Text style={styles.checkpointTitle}>Checkpoint Required</Text>
                </View>
                <Text style={styles.checkpointType}>
                  {msg.checkpointRequired.type.replace('_', ' ')}
                </Text>
                <Text style={styles.checkpointReason}>
                  {msg.checkpointRequired.reason}
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
                    <Text style={styles.rejectButtonText}>Reject</Text>
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
                    <Text style={styles.approveButtonText}>Approve</Text>
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
            <View style={styles.loadingAvatar}>
              <Video
                source={{ uri: BOSS_AVATAR_VIDEOS[currentVideoIndex] }}
                style={styles.loadingAvatarVideo}
                resizeMode={ResizeMode.COVER}
                shouldPlay={true}
                isLooping={true}
                isMuted={true}
              />
            </View>
            <Text style={styles.loadingText}>Boss is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity
          style={styles.micButton}
          onPress={() => setShowDIDAgent(true)}
        >
          <Ionicons name="mic" size={22} color="#6366F1" />
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Tell Boss what you need..."
          placeholderTextColor="#666"
          multiline
          maxLength={2000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
          ]}
          onPress={handleSend}
          disabled={!inputText.trim() || isLoading}
        >
          <Ionicons
            name="send"
            size={20}
            color={inputText.trim() && !isLoading ? '#FFF' : '#666'}
          />
        </TouchableOpacity>
      </View>

      {/* D-ID Agent Modal (Full Screen Interactive Avatar) */}
      <Modal
        visible={showDIDAgent}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowDIDAgent(false)}
      >
        <View style={[styles.didAgentContainer, { paddingTop: insets.top }]}>
          <View style={styles.didAgentHeader}>
            <TouchableOpacity
              style={styles.closeDidButton}
              onPress={() => setShowDIDAgent(false)}
            >
              <Ionicons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.didAgentTitle}>Talk to Boss AI</Text>
            <View style={{ width: 44 }} />
          </View>
          
          {Platform.OS === 'web' ? (
            <iframe
              srcDoc={DID_AGENT_HTML}
              style={{
                flex: 1,
                width: '100%',
                height: '100%',
                border: 'none',
                backgroundColor: '#0A0A0F',
              }}
              allow="camera; microphone; autoplay"
            />
          ) : WebView ? (
            <WebView
              source={{ html: DID_AGENT_HTML }}
              style={styles.didWebView}
              allowsInlineMediaPlayback={true}
              mediaPlaybackRequiresUserAction={false}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              startInLoadingState={true}
              renderLoading={() => (
                <View style={styles.webViewLoading}>
                  <ActivityIndicator size="large" color="#6366F1" />
                  <Text style={styles.webViewLoadingText}>Loading Boss AI...</Text>
                </View>
              )}
            />
          ) : (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color="#6366F1" />
              <Text style={styles.webViewLoadingText}>Loading Boss AI...</Text>
            </View>
          )}
        </View>
      </Modal>

      {/* Avatar Video Modal */}
      <Modal
        visible={showAvatarModal}
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
              source={{ uri: generatedVideoUrl || BOSS_AVATAR_VIDEOS[currentVideoIndex] }}
              style={styles.fullAvatarVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={true}
              isLooping={!generatedVideoUrl}
              useNativeControls={!!generatedVideoUrl}
            />
            
            <Text style={styles.avatarModalTitle}>Boss AI</Text>
            <Text style={styles.avatarModalSubtitle}>
              {generatedVideoUrl ? 'Generated Response' : 'Operating Layer'}
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
                setShowDIDAgent(true);
              }}
            >
              <Ionicons name="mic" size={20} color="#6366F1" />
              <Text style={styles.menuText}>Talk to Boss</Text>
            </TouchableOpacity>
            
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

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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
    borderColor: '#6366F1',
  },
  avatarVideo: {
    width: '100%',
    height: '100%',
  },
  avatarGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  projectBadge: {
    color: '#6366F1',
    fontSize: 12,
    marginTop: 2,
  },
  talkButton: {
    padding: 10,
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    marginRight: 8,
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
    position: 'relative',
  },
  emptyAvatarVideo: {
    width: '100%',
    height: '100%',
  },
  talkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(99, 102, 241, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  talkOverlayText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
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
  bossAvatarSmallVideo: {
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
  videoButton: {
    padding: 4,
    marginLeft: 8,
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
    backgroundColor: '#1A1510',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#F59E0B33',
  },
  checkpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkpointTitle: {
    color: '#F59E0B',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  checkpointType: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '500',
    marginTop: 8,
  },
  checkpointReason: {
    color: '#AAA',
    fontSize: 12,
    marginTop: 4,
  },
  checkpointActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: '#888',
    fontWeight: '600',
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#22C55E',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButtonText: {
    color: '#FFF',
    fontWeight: '600',
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
  loadingAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0A0A0F',
  },
  loadingAvatarVideo: {
    width: '100%',
    height: '100%',
  },
  loadingText: {
    color: '#888',
    fontSize: 14,
    marginLeft: 10,
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
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
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
  // D-ID Agent Styles
  didAgentContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  didAgentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  closeDidButton: {
    padding: 8,
  },
  didAgentTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  didWebView: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A0A0F',
  },
  webViewLoadingText: {
    color: '#888',
    fontSize: 14,
    marginTop: 16,
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
