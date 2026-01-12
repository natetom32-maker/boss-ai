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

export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    projects,
    currentProject,
    fetchProjects,
    createProject,
    setCurrentProject,
    fetchMemory,
    isLoading,
  } = useBossStore();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    if (!newName.trim()) {
      Alert.alert('Error', 'Project name is required');
      return;
    }

    try {
      const project = await createProject(newName.trim(), newDescription.trim() || undefined);
      setShowCreateModal(false);
      setNewName('');
      setNewDescription('');
      setCurrentProject(project);
      fetchMemory('L2_PROJECT', project.project_id);
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to create project');
    }
  };

  const handleSelectProject = (project: any) => {
    setCurrentProject(project);
    fetchMemory('L2_PROJECT', project.project_id);
    router.push('/boss');
  };

  const handleClearProject = () => {
    setCurrentProject(null);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Projects</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Current Project Banner */}
      {currentProject && (
        <View style={styles.currentBanner}>
          <View style={styles.currentInfo}>
            <Ionicons name="folder" size={20} color="#22C55E" />
            <View style={styles.currentText}>
              <Text style={styles.currentLabel}>Active Project</Text>
              <Text style={styles.currentName}>{currentProject.name}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleClearProject} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Info Card */}
      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={20} color="#6366F1" />
        <Text style={styles.infoText}>
          Projects provide L2 scoped memory. Boss uses project context for
          relevant decisions and actions.
        </Text>
      </View>

      {/* Projects List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentPadding}
      >
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366F1" />
          </View>
        ) : projects.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color="#333" />
            <Text style={styles.emptyTitle}>No projects yet</Text>
            <Text style={styles.emptySubtitle}>
              Create a project to scope Boss's memory and decisions
            </Text>
          </View>
        ) : (
          projects.map(project => (
            <TouchableOpacity
              key={project.project_id}
              style={[
                styles.projectCard,
                currentProject?.project_id === project.project_id &&
                  styles.projectCardActive,
              ]}
              onPress={() => handleSelectProject(project)}
            >
              <View style={styles.projectIcon}>
                <Ionicons
                  name="folder"
                  size={24}
                  color={
                    currentProject?.project_id === project.project_id
                      ? '#22C55E'
                      : '#666'
                  }
                />
              </View>
              <View style={styles.projectInfo}>
                <Text style={styles.projectName}>{project.name}</Text>
                {project.description && (
                  <Text style={styles.projectDescription} numberOfLines={2}>
                    {project.description}
                  </Text>
                )}
                <Text style={styles.projectDate}>
                  Created: {new Date(project.created_at).toLocaleDateString()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#666" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Create Button */}
      <TouchableOpacity
        style={[styles.createButton, { bottom: insets.bottom + 20 }]}
        onPress={() => setShowCreateModal(true)}
      >
        <Ionicons name="add" size={28} color="#FFF" />
      </TouchableOpacity>

      {/* Create Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Project</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Project Name</Text>
              <TextInput
                style={styles.modalInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="e.g., Q4 Marketing Campaign"
                placeholderTextColor="#666"
              />

              <Text style={styles.inputLabel}>Description (optional)</Text>
              <TextInput
                style={[styles.modalInput, styles.descriptionInput]}
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="What is this project about?"
                placeholderTextColor="#666"
                multiline
              />

              <View style={styles.memoryHint}>
                <Ionicons name="server" size={14} color="#22C55E" />
                <Text style={styles.memoryHintText}>
                  Boss will use L2 memory scoped to this project
                </Text>
              </View>

              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleCreateProject}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Create Project</Text>
                )}
              </TouchableOpacity>
            </View>
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
    textAlign: 'center',
  },
  currentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#22C55E15',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#22C55E33',
  },
  currentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currentText: {
    marginLeft: 12,
  },
  currentLabel: {
    color: '#22C55E',
    fontSize: 11,
    fontWeight: '600',
  },
  currentName: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1A1A2E',
  },
  clearButtonText: {
    color: '#888',
    fontSize: 13,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#12121A',
    padding: 14,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1A1A2E',
  },
  infoText: {
    flex: 1,
    color: '#888',
    fontSize: 13,
    marginLeft: 12,
    lineHeight: 18,
  },
  content: {
    flex: 1,
  },
  contentPadding: {
    padding: 16,
    paddingTop: 0,
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
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121A',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1A1A2E',
  },
  projectCardActive: {
    borderColor: '#22C55E',
    backgroundColor: '#22C55E08',
  },
  projectIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  projectInfo: {
    flex: 1,
    marginLeft: 14,
  },
  projectName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  projectDescription: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  projectDate: {
    color: '#555',
    fontSize: 11,
    marginTop: 6,
  },
  createButton: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#22C55E',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#22C55E',
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
  descriptionInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  memoryHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  memoryHintText: {
    color: '#22C55E',
    fontSize: 13,
    marginLeft: 8,
  },
  saveButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
