import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBossStore } from '../src/store/bossStore';

type Scope = 'L0_PRIME' | 'L1_WORKSPACE' | 'L2_PROJECT' | 'L3_SESSION';

const SCOPE_INFO: Record<Scope, { label: string; color: string; icon: string; description: string }> = {
  L0_PRIME: {
    label: 'Prime Memory',
    color: '#6366F1',
    icon: 'star',
    description: 'Global preferences & behavior rules',
  },
  L1_WORKSPACE: {
    label: 'Workspace',
    color: '#A855F7',
    icon: 'business',
    description: 'Organization policies',
  },
  L2_PROJECT: {
    label: 'Project',
    color: '#22C55E',
    icon: 'folder',
    description: 'Project-scoped truth (dominant)',
  },
  L3_SESSION: {
    label: 'Session',
    color: '#F59E0B',
    icon: 'time',
    description: 'Ephemeral, never trusted',
  },
};

export default function MemoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    memory,
    events,
    fetchMemory,
    fetchEvents,
    setMemory,
    deleteMemory,
    isLoading,
    currentProject,
  } = useBossStore();

  const [selectedScope, setSelectedScope] = useState<Scope>('L0_PRIME');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEventsModal, setShowEventsModal] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    fetchMemory(selectedScope, currentProject?.project_id);
    fetchEvents(50);
  }, [selectedScope, currentProject]);

  const handleAddMemory = async () => {
    if (!newKey.trim() || !newValue.trim()) {
      Alert.alert('Error', 'Both key and value are required');
      return;
    }

    try {
      // Try to parse as JSON, otherwise use as string
      let parsedValue: any = newValue;
      try {
        parsedValue = JSON.parse(newValue);
      } catch {
        // Keep as string if not valid JSON
      }

      await setMemory(
        newKey.trim(),
        parsedValue,
        selectedScope,
        currentProject?.project_id
      );
      setShowAddModal(false);
      setNewKey('');
      setNewValue('');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to add memory');
    }
  };

  const handleDeleteMemory = (key: string) => {
    Alert.alert(
      'Delete Memory',
      `Are you sure you want to delete "${key}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteMemory(key, selectedScope, currentProject?.project_id),
        },
      ]
    );
  };

  const filteredMemory = memory.filter(m => m.scope === selectedScope);
  const scopeInfo = SCOPE_INFO[selectedScope];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Memory Engine</Text>
        <TouchableOpacity
          onPress={() => setShowEventsModal(true)}
          style={styles.eventsButton}
        >
          <Ionicons name="list" size={20} color="#888" />
        </TouchableOpacity>
      </View>

      {/* Scope Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scopeTabs}
        contentContainerStyle={styles.scopeTabsContent}
      >
        {(Object.keys(SCOPE_INFO) as Scope[]).map(scope => {
          const info = SCOPE_INFO[scope];
          const isSelected = scope === selectedScope;
          return (
            <TouchableOpacity
              key={scope}
              style={[
                styles.scopeTab,
                isSelected && { backgroundColor: info.color + '22', borderColor: info.color },
              ]}
              onPress={() => setSelectedScope(scope)}
            >
              <Ionicons
                name={info.icon as any}
                size={16}
                color={isSelected ? info.color : '#666'}
              />
              <Text
                style={[
                  styles.scopeTabText,
                  isSelected && { color: info.color },
                ]}
              >
                {info.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Scope Info */}
      <View style={[styles.scopeInfo, { borderLeftColor: scopeInfo.color }]}>
        <Text style={styles.scopeDescription}>{scopeInfo.description}</Text>
        {currentProject && selectedScope === 'L2_PROJECT' && (
          <Text style={styles.projectContext}>
            Context: {currentProject.name}
          </Text>
        )}
      </View>

      {/* Memory Items */}
      <ScrollView style={styles.content} contentContainerStyle={styles.contentPadding}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : filteredMemory.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="server-outline" size={48} color="#333" />
            <Text style={styles.emptyTitle}>No memory items</Text>
            <Text style={styles.emptySubtitle}>
              Add memory to help Boss remember your preferences and decisions
            </Text>
          </View>
        ) : (
          filteredMemory.map(item => (
            <View key={item.memory_id} style={styles.memoryCard}>
              <View style={styles.memoryHeader}>
                <Text style={styles.memoryKey}>{item.key}</Text>
                <TouchableOpacity
                  onPress={() => handleDeleteMemory(item.key)}
                  style={styles.deleteButton}
                >
                  <Ionicons name="trash-outline" size={18} color="#EF4444" />
                </TouchableOpacity>
              </View>
              <Text style={styles.memoryValue}>
                {typeof item.value === 'object'
                  ? JSON.stringify(item.value, null, 2)
                  : String(item.value)}
              </Text>
              <View style={styles.memoryMeta}>
                <Text style={styles.memoryVersion}>v{item.version}</Text>
                <Text style={styles.memoryUpdated}>
                  Updated: {new Date(item.updated_at).toLocaleString()}
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Button */}
      <TouchableOpacity
        style={[styles.addButton, { bottom: insets.bottom + 20 }]}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Add Memory Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Memory</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Key</Text>
              <TextInput
                style={styles.modalInput}
                value={newKey}
                onChangeText={setNewKey}
                placeholder="e.g., preferred_language"
                placeholderTextColor="#666"
              />

              <Text style={styles.inputLabel}>Value</Text>
              <TextInput
                style={[styles.modalInput, styles.valueInput]}
                value={newValue}
                onChangeText={setNewValue}
                placeholder='e.g., "English" or {"key": "value"}'
                placeholderTextColor="#666"
                multiline
              />

              <View style={styles.scopeBadge}>
                <Ionicons
                  name={scopeInfo.icon as any}
                  size={14}
                  color={scopeInfo.color}
                />
                <Text style={[styles.scopeBadgeText, { color: scopeInfo.color }]}>
                  Will be saved to {scopeInfo.label}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleAddMemory}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Save Memory</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Events Log Modal */}
      <Modal
        visible={showEventsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEventsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, styles.eventsModal, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Event Log</Text>
              <TouchableOpacity onPress={() => setShowEventsModal(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <Text style={styles.eventsSubtitle}>
              Append-only log - State can be rebuilt from events
            </Text>

            <ScrollView style={styles.eventsScroll}>
              {events.map(event => (
                <View key={event.event_id} style={styles.eventCard}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventType}>{event.event_type}</Text>
                    <Text style={styles.eventScope}>{event.scope}</Text>
                  </View>
                  <Text style={styles.eventKey}>{event.key}</Text>
                  <Text style={styles.eventTime}>
                    {new Date(event.timestamp).toLocaleString()}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  eventsButton: {
    padding: 8,
  },
  scopeTabs: {
    maxHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#1A1A2E',
  },
  scopeTabsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  scopeTab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 8,
  },
  scopeTabText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '500',
    marginLeft: 6,
  },
  scopeInfo: {
    backgroundColor: '#12121A',
    padding: 14,
    borderLeftWidth: 3,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 8,
  },
  scopeDescription: {
    color: '#888',
    fontSize: 13,
  },
  projectContext: {
    color: '#22C55E',
    fontSize: 12,
    marginTop: 6,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
    paddingBottom: 100,
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  memoryCard: {
    backgroundColor: '#12121A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1A1A2E',
  },
  memoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memoryKey: {
    color: '#A855F7',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 4,
  },
  memoryValue: {
    color: '#E5E5E5',
    fontSize: 14,
    marginTop: 8,
    fontFamily: 'monospace',
  },
  memoryMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1A1A2E',
  },
  memoryVersion: {
    color: '#6366F1',
    fontSize: 11,
  },
  memoryUpdated: {
    color: '#555',
    fontSize: 11,
  },
  addButton: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#6366F1',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
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
  },
  eventsModal: {
    maxHeight: '80%',
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
  modalBody: {
    padding: 20,
  },
  inputLabel: {
    color: '#888',
    fontSize: 13,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: '#1A1A2E',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 15,
    marginBottom: 16,
  },
  valueInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  scopeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  scopeBadgeText: {
    fontSize: 13,
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: '#6366F1',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  eventsSubtitle: {
    color: '#666',
    fontSize: 12,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  eventsScroll: {
    maxHeight: 400,
    paddingHorizontal: 20,
  },
  eventCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  eventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eventType: {
    color: '#6366F1',
    fontSize: 12,
    fontWeight: '600',
  },
  eventScope: {
    color: '#666',
    fontSize: 11,
  },
  eventKey: {
    color: '#FFF',
    fontSize: 13,
    marginTop: 6,
  },
  eventTime: {
    color: '#555',
    fontSize: 10,
    marginTop: 6,
  },
});
