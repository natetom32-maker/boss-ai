import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useBossStore } from '../src/store/bossStore';

export default function DecisionsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    decisions,
    checkpoints,
    fetchDecisions,
    fetchCheckpoints,
    resolveCheckpoint,
    currentProject,
    isLoading,
  } = useBossStore();

  useEffect(() => {
    fetchDecisions(currentProject?.project_id);
    fetchCheckpoints();
  }, [currentProject]);

  const pendingCheckpoints = checkpoints.filter(c => c.status === 'PENDING');

  const getCheckpointIcon = (type: string) => {
    switch (type) {
      case 'SEND_SHARE':
        return 'share';
      case 'SPEND_MONEY':
        return 'card';
      case 'DELETE_OVERWRITE':
        return 'trash';
      case 'LEGAL_MEDICAL':
        return 'document-text';
      default:
        return 'warning';
    }
  };

  const getCheckpointColor = (type: string) => {
    switch (type) {
      case 'SEND_SHARE':
        return '#6366F1';
      case 'SPEND_MONEY':
        return '#22C55E';
      case 'DELETE_OVERWRITE':
        return '#EF4444';
      case 'LEGAL_MEDICAL':
        return '#F59E0B';
      default:
        return '#888';
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Decisions</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Info Banner */}
      <View style={styles.infoBanner}>
        <Ionicons name="bulb" size={18} color="#F59E0B" />
        <Text style={styles.infoText}>
          Boss remembers decisions, not conversations
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentPadding}
      >
        {/* Pending Checkpoints */}
        {pendingCheckpoints.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="warning" size={16} color="#F59E0B" /> Pending
              Checkpoints
            </Text>
            {pendingCheckpoints.map(checkpoint => (
              <View key={checkpoint.checkpoint_id} style={styles.checkpointCard}>
                <View style={styles.checkpointHeader}>
                  <View
                    style={[
                      styles.checkpointIcon,
                      { backgroundColor: getCheckpointColor(checkpoint.checkpoint_type) + '22' },
                    ]}
                  >
                    <Ionicons
                      name={getCheckpointIcon(checkpoint.checkpoint_type) as any}
                      size={20}
                      color={getCheckpointColor(checkpoint.checkpoint_type)}
                    />
                  </View>
                  <View style={styles.checkpointInfo}>
                    <Text style={styles.checkpointType}>
                      {checkpoint.checkpoint_type.replace('_', ' ')}
                    </Text>
                    <Text style={styles.checkpointTime}>
                      {new Date(checkpoint.created_at).toLocaleString()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.checkpointAction}>
                  {checkpoint.action_description}
                </Text>
                <View style={styles.checkpointActions}>
                  <TouchableOpacity
                    style={styles.rejectButton}
                    onPress={() =>
                      resolveCheckpoint(checkpoint.checkpoint_id, 'REJECTED')
                    }
                  >
                    <Ionicons name="close" size={18} color="#EF4444" />
                    <Text style={styles.rejectText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.approveButton}
                    onPress={() =>
                      resolveCheckpoint(checkpoint.checkpoint_id, 'APPROVED')
                    }
                  >
                    <Ionicons name="checkmark" size={18} color="#FFF" />
                    <Text style={styles.approveText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Decisions History */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            <Ionicons name="checkmark-done" size={16} color="#22C55E" /> Decision
            History
          </Text>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6366F1" />
            </View>
          ) : decisions.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="document-outline" size={48} color="#333" />
              <Text style={styles.emptyTitle}>No decisions recorded</Text>
              <Text style={styles.emptySubtitle}>
                Boss will record important decisions made during interactions
              </Text>
            </View>
          ) : (
            decisions.map(decision => (
              <View key={decision.decision_id} style={styles.decisionCard}>
                <Text style={styles.decisionTitle}>{decision.title}</Text>
                <Text style={styles.decisionDescription}>
                  {decision.description}
                </Text>
                {decision.outcome && (
                  <View style={styles.outcomeTag}>
                    <Ionicons name="checkmark-circle" size={14} color="#22C55E" />
                    <Text style={styles.outcomeText}>{decision.outcome}</Text>
                  </View>
                )}
                {decision.memory_keys_used.length > 0 && (
                  <View style={styles.memoryTags}>
                    {decision.memory_keys_used.map((key, idx) => (
                      <View key={idx} style={styles.memoryTag}>
                        <Text style={styles.memoryTagText}>{key}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Text style={styles.decisionTime}>
                  {new Date(decision.created_at).toLocaleString()}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Resolved Checkpoints */}
        {checkpoints.filter(c => c.status !== 'PENDING').length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              <Ionicons name="shield-checkmark" size={16} color="#6366F1" />{' '}
              Resolved Checkpoints
            </Text>
            {checkpoints
              .filter(c => c.status !== 'PENDING')
              .map(checkpoint => (
                <View
                  key={checkpoint.checkpoint_id}
                  style={styles.resolvedCard}
                >
                  <View style={styles.resolvedHeader}>
                    <Ionicons
                      name={getCheckpointIcon(checkpoint.checkpoint_type) as any}
                      size={16}
                      color="#666"
                    />
                    <Text style={styles.resolvedType}>
                      {checkpoint.checkpoint_type.replace('_', ' ')}
                    </Text>
                    <View
                      style={[
                        styles.statusBadge,
                        checkpoint.status === 'APPROVED'
                          ? styles.approvedBadge
                          : styles.rejectedBadge,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          checkpoint.status === 'APPROVED'
                            ? styles.approvedText
                            : styles.rejectedTextStatus,
                        ]}
                      >
                        {checkpoint.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.resolvedAction}>
                    {checkpoint.action_description}
                  </Text>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
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
    textAlign: 'center',
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F59E0B15',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F59E0B33',
  },
  infoText: {
    color: '#F59E0B',
    fontSize: 13,
    marginLeft: 10,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  loadingContainer: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtitle: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  checkpointCard: {
    backgroundColor: '#1A1510',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F59E0B33',
  },
  checkpointHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkpointIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkpointInfo: {
    marginLeft: 12,
  },
  checkpointType: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  checkpointTime: {
    color: '#666',
    fontSize: 11,
    marginTop: 2,
  },
  checkpointAction: {
    color: '#AAA',
    fontSize: 13,
    marginTop: 12,
    lineHeight: 18,
  },
  checkpointActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF444422',
    paddingVertical: 10,
    borderRadius: 8,
  },
  rejectText: {
    color: '#EF4444',
    fontWeight: '600',
    marginLeft: 6,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    paddingVertical: 10,
    borderRadius: 8,
  },
  approveText: {
    color: '#FFF',
    fontWeight: '600',
    marginLeft: 6,
  },
  decisionCard: {
    backgroundColor: '#12121A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1A1A2E',
  },
  decisionTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  decisionDescription: {
    color: '#AAA',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  outcomeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#22C55E15',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  outcomeText: {
    color: '#22C55E',
    fontSize: 12,
    marginLeft: 6,
  },
  memoryTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 6,
  },
  memoryTag: {
    backgroundColor: '#6366F122',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  memoryTagText: {
    color: '#6366F1',
    fontSize: 11,
  },
  decisionTime: {
    color: '#555',
    fontSize: 11,
    marginTop: 12,
  },
  resolvedCard: {
    backgroundColor: '#12121A',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  resolvedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resolvedType: {
    color: '#888',
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  approvedBadge: {
    backgroundColor: '#22C55E22',
  },
  rejectedBadge: {
    backgroundColor: '#EF444422',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  approvedText: {
    color: '#22C55E',
  },
  rejectedTextStatus: {
    color: '#EF4444',
  },
  resolvedAction: {
    color: '#666',
    fontSize: 12,
    marginTop: 8,
  },
});
