/**
 * Ren'Py Studio - Visual Novel Development Studio
 *
 * An antiquarian storybook aesthetic for crafting visual novels.
 * Inspired by rare book libraries, Victorian journals, and illustrated manuscripts.
 */

import React, { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { useApp, useHostStyles } from '@modelcontextprotocol/ext-apps/react';

// ============================================================================
// Toast Notification System
// ============================================================================

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => dismissToast(toast.id)}
          >
            <span className="toast-icon">
              {toast.type === 'success' && '✓'}
              {toast.type === 'error' && '✕'}
              {toast.type === 'info' && 'ℹ'}
            </span>
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Bundled fonts - avoid CSP issues with external Google Fonts
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/crimson-text/400.css';
import '@fontsource/crimson-text/600.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/500.css';
import '@fontsource/jetbrains-mono/400.css';

import './styles.css';

// Import story builder components
import { VisualSceneBuilder } from './components/storybuilder';

// Import Ren'Py player component (renders games directly, no iframe!)
import { RenpyPlayer } from './components/RenpyPlayer';

// Import generated assets
import logoImg from './assets/logo_transparent.png';
import dividerImg from './assets/divider_transparent.png';

// ============================================================================
// Types
// ============================================================================

interface Project {
  name: string;
  path: string;
  createdAt: string;
  hasAssets?: boolean;
  scriptCount?: number;
}

// Metadata types for asset descriptions
interface CharacterMetadata {
  displayName: string;
  normalizedName: string;
  description: string;
  role: string;
  clothing?: string;
  personality?: string;
  createdAt: string;
  updatedAt: string;
}

interface BackgroundMetadata {
  displayName: string;
  filename: string;
  description: string;
  location?: string;
  timeOfDay?: string;
  mood?: string;
  details?: string;
  createdAt: string;
  updatedAt: string;
}

interface Character {
  name: string;
  emotions: Array<{
    emotion: string;
    base64: string;
    base64Transparent: string;
    mimeType: string;
  }>;
  metadata?: CharacterMetadata | null;
}

interface Background {
  name: string;
  path: string;
  base64: string;
  mimeType: string;
  metadata?: BackgroundMetadata | null;
}

// Delete confirmation state
interface PendingDelete {
  type: 'character' | 'background';
  id: string;
  name: string;
}

interface CharacterFormData {
  name: string;
  role: 'protagonist' | 'love_interest' | 'friend' | 'rival' | 'mentor' | 'other';
  roleCustom: string;
  description: string; // Appearance, personality, and other details combined
}

interface ProjectFormData {
  title: string;
  genre: 'romance' | 'mystery' | 'fantasy' | 'scifi' | 'drama' | 'other';
  genreCustom: string;
  setting: 'modern' | 'historical' | 'fantasy_world' | 'scifi_world' | 'school' | 'other';
  settingCustom: string;
  mood: 'heartwarming' | 'dramatic' | 'comedic' | 'dark' | 'mysterious' | 'other';
  moodCustom: string;
  characters: CharacterFormData[];
  premise: string;
}

// Story Templates for quick start
interface StoryTemplate {
  name: string;
  icon: string;
  description: string;
  data: Partial<ProjectFormData>;
}

const STORY_TEMPLATES: StoryTemplate[] = [
  {
    name: 'Café Romance',
    icon: '☕',
    description: 'A heartwarming love story set in a cozy neighborhood café',
    data: {
      title: 'Coffee & Confessions',
      genre: 'romance',
      setting: 'modern',
      mood: 'heartwarming',
      characters: [
        { name: 'Alex', role: 'protagonist', roleCustom: '', description: 'Friendly college student with warm eyes and casual style. Shy but kind, loves reading.' },
        { name: 'Morgan', role: 'love_interest', roleCustom: '', description: 'Charming barista with a bright smile and coffee-stained apron. Outgoing, makes everyone feel welcome.' },
      ],
      premise: 'Every morning, you stop by The Daily Grind for your usual order. The cute barista always remembers your name and your drink. One rainy day, they invite you to stay after closing...',
    },
  },
  {
    name: 'Campus Mystery',
    icon: '🔍',
    description: 'Uncover dark secrets at an elite academy',
    data: {
      title: 'Shadows of Thornwood Academy',
      genre: 'mystery',
      setting: 'school',
      mood: 'mysterious',
      characters: [
        { name: 'Jamie', role: 'protagonist', roleCustom: '', description: 'Observant transfer student with sharp eyes and a curious nature. Analytical, keeps a journal of clues.' },
        { name: 'Professor Vale', role: 'mentor', roleCustom: '', description: 'Elegant teacher with silver-streaked hair and knowing eyes. Cryptic, seems to know more than they let on.' },
        { name: 'Riley', role: 'friend', roleCustom: '', description: 'Energetic student with colorful hair and conspiracy theory pins. Enthusiastic amateur detective, always has theories.' },
      ],
      premise: 'When you transfer to the prestigious Thornwood Academy, you discover a student went missing last year. No one talks about it. But you find their hidden diary in your dorm room...',
    },
  },
  {
    name: 'Fantasy Adventure',
    icon: '⚔️',
    description: 'An epic journey in a magical realm',
    data: {
      title: 'The Last Enchanter',
      genre: 'fantasy',
      setting: 'fantasy_world',
      mood: 'dramatic',
      characters: [
        { name: 'Lyra', role: 'protagonist', roleCustom: '', description: 'Young mage with glowing runes on their arms and determined eyes. Brave but uncertain about their powers.' },
        { name: 'Kael', role: 'love_interest', roleCustom: '', description: 'Mysterious knight with silver armor and a scar across their cheek. Stoic protector with a secret past.' },
        { name: 'Sage Miriam', role: 'mentor', roleCustom: '', description: 'Ancient sorceress with flowing white robes and kind wrinkles. Wise, patient, hides great power.' },
      ],
      premise: 'Magic is dying. The kingdoms are at war. And you just discovered you\'re the last person who can restore the ancient enchantments. But first, you must find the three lost artifacts...',
    },
  },
  {
    name: 'Slice of Life',
    icon: '🌸',
    description: 'Everyday moments and meaningful connections',
    data: {
      title: 'Seasons of Change',
      genre: 'drama',
      setting: 'modern',
      mood: 'heartwarming',
      characters: [
        { name: 'Hana', role: 'protagonist', roleCustom: '', description: 'Thoughtful artist with paint-stained hands and dreamy expression. Creative soul seeking purpose.' },
        { name: 'Yuki', role: 'friend', roleCustom: '', description: 'Cheerful florist with sun-kissed skin and flower clips in hair. Optimistic, believes in small joys.' },
      ],
      premise: 'After quitting your corporate job, you move to a small coastal town to pursue art. As the seasons change, so do you—finding friendship, purpose, and maybe love in unexpected places.',
    },
  },
];

type View = 'welcome' | 'projects' | 'assets' | 'story' | 'preview';

// ============================================================================
// Form Options
// ============================================================================

const GENRE_OPTIONS = [
  { value: 'romance', label: 'Romance', icon: '💕' },
  { value: 'mystery', label: 'Mystery', icon: '🔍' },
  { value: 'fantasy', label: 'Fantasy', icon: '✨' },
  { value: 'scifi', label: 'Science Fiction', icon: '🚀' },
  { value: 'drama', label: 'Drama / Slice of Life', icon: '🎭' },
  { value: 'other', label: 'Other (Custom)', icon: '📝' },
];

const SETTING_OPTIONS = [
  { value: 'modern', label: 'Modern Day' },
  { value: 'historical', label: 'Historical' },
  { value: 'fantasy_world', label: 'Fantasy World' },
  { value: 'scifi_world', label: 'Sci-Fi World' },
  { value: 'school', label: 'School / Campus' },
  { value: 'other', label: 'Other (Custom)' },
];

const MOOD_OPTIONS = [
  { value: 'heartwarming', label: 'Heartwarming' },
  { value: 'dramatic', label: 'Dramatic' },
  { value: 'comedic', label: 'Comedic' },
  { value: 'dark', label: 'Dark / Serious' },
  { value: 'mysterious', label: 'Mysterious' },
  { value: 'other', label: 'Other (Custom)' },
];

const ROLE_OPTIONS = [
  { value: 'protagonist', label: 'Protagonist' },
  { value: 'love_interest', label: 'Love Interest' },
  { value: 'friend', label: 'Best Friend' },
  { value: 'rival', label: 'Rival' },
  { value: 'mentor', label: 'Mentor / Guide' },
  { value: 'other', label: 'Other (Custom)' },
];

// ============================================================================
// Decorative Components
// ============================================================================

function QuillIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76z" />
      <line x1="16" y1="8" x2="2" y2="22" />
      <line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21,15 16,10 5,21" />
    </svg>
  );
}

function TheaterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  );
}

function FlowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="6" height="4" rx="1" />
      <rect x="15" y="3" width="6" height="4" rx="1" />
      <rect x="9" y="17" width="6" height="4" rx="1" />
      <path d="M6 7v3a3 3 0 003 3h6a3 3 0 003-3V7" />
      <path d="M12 13v4" />
    </svg>
  );
}

function LibraryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
      <path d="M19 13l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z" />
      <path d="M5 17l.5 1.5L7 19l-1.5.5L5 21l-.5-1.5L3 19l1.5-.5L5 17z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22,2 15,22 11,13 2,9 22,2" />
    </svg>
  );
}

// ============================================================================
// Main App Component
// ============================================================================

// Map tool names to user-friendly status messages
function getToolStatusMessage(toolName: string): string {
  switch (toolName) {
    case 'create_project':
      return 'Creating project...';
    case 'generate_character':
      return 'Generating character...';
    case 'generate_background':
      return 'Generating background...';
    case 'generate_script':
      return 'Writing script...';
    case 'build_project':
      return 'Building game...';
    case 'start_preview':
      return 'Starting preview...';
    case 'list_projects':
      return 'Loading projects...';
    case 'list_project_files':
      return 'Loading files...';
    default:
      if (toolName.includes('generate')) return 'Generating...';
      if (toolName.includes('build')) return 'Building...';
      return 'Processing...';
  }
}

function Studio() {
  const { showToast } = useToast();

  // State
  const [view, setView] = useState<View>('welcome');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [backgrounds, setBackgrounds] = useState<Background[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [operationStatus, setOperationStatus] = useState<string | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState(false);

  const appResult = useApp({
    appInfo: { name: "Ren'Py Studio", version: '1.0.0' },
    capabilities: {},
    onAppCreated: (createdApp) => {
      // Show loading as soon as streaming starts (partial input)
      // NOTE: ontoolinputpartial params only has 'arguments', not 'name'
      createdApp.ontoolinputpartial = (params) => {
        console.log('Tool input partial:', params.arguments);
        // We can't determine tool name from partial input, just log it
        // Status messages are now set from prompt text in sendToClaude
      };

      // Listen for tool inputs to get initialView
      // NOTE: ontoolinput params only has 'arguments', not 'name'
      // We detect view_studio by checking for its specific arguments
      createdApp.ontoolinput = (params) => {
        console.log('Tool input params:', params);

        // Extract arguments - params.arguments contains the tool arguments
        const args = params.arguments as { initialView?: string; projectName?: string } | undefined;

        // Check if this looks like view_studio (has initialView or projectName)
        if (args?.initialView || args?.projectName) {
          console.log('Detected view_studio input:', args);
          if (args.initialView) {
            console.log('Setting view to:', args.initialView);
            setView(args.initialView as View);
          }
          if (args.projectName) {
            console.log('Setting project to:', args.projectName);
            setSelectedProject(args.projectName);
            // Trigger asset load for the project
            setPendingRefresh(true);
          }
        }
      };

      // Listen for tool results to auto-refresh and clear status
      // NOTE: result is CallToolResult which doesn't include tool name
      createdApp.ontoolresult = (result) => {
        console.log('Tool result:', result);
        // Clear operation status
        setOperationStatus(null);

        // Always trigger refresh on tool completion since we can't identify which tool
        // This ensures asset gallery updates after generate_character, generate_background, etc.
        setPendingRefresh(true);
      };

      // Clear status if tool is cancelled
      createdApp.ontoolcancelled = (params) => {
        console.log('Tool cancelled:', params.reason);
        setOperationStatus(null);
      };
    },
  });
  const app = appResult?.app;
  useHostStyles(app);

  // Handle pending refresh
  useEffect(() => {
    if (pendingRefresh && app && selectedProject) {
      loadAssets(selectedProject);
      loadProjects();
      setPendingRefresh(false);
    }
  }, [pendingRefresh, app, selectedProject]);

  // Load projects on mount
  useEffect(() => {
    if (app) {
      loadProjects();
    }
  }, [app]);

  // Infer operation type from prompt for status display
  const getOperationLabel = (prompt: string): string => {
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('create a visual novel') || lowerPrompt.includes('create the project')) {
      return 'Creating your story...';
    }
    if (lowerPrompt.includes('build') && lowerPrompt.includes('preview')) {
      return 'Building game for preview...';
    }
    if (lowerPrompt.includes('generate a background') || lowerPrompt.includes('create') && lowerPrompt.includes('background')) {
      return 'Generating background...';
    }
    if (lowerPrompt.includes('generate') && lowerPrompt.includes('character') || lowerPrompt.includes('create a character')) {
      return 'Creating character sprites...';
    }
    if (lowerPrompt.includes('continue the story') || lowerPrompt.includes('write')) {
      return 'Writing scene...';
    }
    if (lowerPrompt.includes('fix')) {
      return 'Fixing issues...';
    }
    return 'Processing request...';
  };

  // Send message to the host's chat interface
  const sendToClaude = useCallback(async (prompt: string) => {
    if (app) {
      const statusLabel = getOperationLabel(prompt);
      setOperationStatus(statusLabel);

      try {
        const result = await app.sendMessage({
          role: 'user',
          content: [{ type: 'text', text: prompt }],
        });
        if (result.isError) {
          console.error('Host rejected the message');
          showToast('Failed to send request', 'error');
          setOperationStatus(null);
        } else {
          showToast('Request sent successfully', 'success');
          // Clear status after a delay (the actual work happens in the host)
          setTimeout(() => setOperationStatus(null), 3000);
        }
      } catch (e) {
        console.error('Failed to send message:', e);
        showToast('Failed to send request', 'error');
        setOperationStatus(null);
      }
    }
  }, [app, showToast]);

  // Load projects
  const loadProjects = useCallback(async () => {
    if (!app) return;
    setLoading(true);
    setError(null);
    try {
      const result = await app.callServerTool({
        name: 'list_projects',
        arguments: {},
      });
      if (result.structuredContent?.projects) {
        setProjects(result.structuredContent.projects);
      }
    } catch (e) {
      setError('Failed to load your stories. Please try again.');
      showToast('Failed to load projects', 'error');
    } finally {
      setLoading(false);
    }
  }, [app, showToast]);

  // Select a project
  const selectProject = useCallback(async (projectName: string) => {
    if (!app) return;
    setSelectedProject(projectName);
    setView('assets');
    setError(null);

    // Sync to server
    try {
      await app.callServerTool({
        name: 'ui_select_project',
        arguments: { projectName },
      });
    } catch (e) {
      // Non-critical, continue
    }

    // Load assets
    loadAssets(projectName);
  }, [app]);

  // Load project assets
  const loadAssets = useCallback(async (projectName: string) => {
    if (!app) return;
    setLoading(true);
    try {
      const result = await app.callServerTool({
        name: 'ui_get_assets',
        arguments: { projectName },
      });
      if (result.structuredContent) {
        setBackgrounds(result.structuredContent.backgrounds || []);
        setCharacters(result.structuredContent.characters || []);
      }
    } catch (e) {
      setError('Failed to load assets');
      showToast('Failed to load assets', 'error');
    } finally {
      setLoading(false);
    }
  }, [app, showToast]);

  // Delete a project
  const deleteProject = useCallback(async (projectName: string) => {
    if (!app) {
      console.error('deleteProject: app not available');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      console.log('Deleting project:', projectName);
      const result = await app.callServerTool({
        name: 'delete_project',
        arguments: { projectName },
      });
      console.log('Delete result:', result);
      // Clear selection if deleted project was selected
      if (selectedProject === projectName) {
        setSelectedProject(null);
        setBackgrounds([]);
        setCharacters([]);
      }
      // Refresh project list
      await loadProjects();
      showToast(`Deleted "${projectName.replace(/_/g, ' ')}"`, 'success');
    } catch (e) {
      console.error('Delete error:', e);
      setError('Failed to delete project');
      showToast('Failed to delete project', 'error');
    } finally {
      setLoading(false);
    }
  }, [app, selectedProject, loadProjects, showToast]);

  // Navigate with project context
  const navigateToView = useCallback((newView: View) => {
    setView(newView);
    setError(null);
  }, []);

  // Build and play project directly (no Claude involved)
  const buildAndPlay = useCallback(async (projectName: string) => {
    if (!app) return;

    setOperationStatus('Building your game...');

    try {
      // Step 1: Build the project
      const buildResult = await app.callServerTool({
        name: 'build_project',
        arguments: { projectName, target: 'web' },
      });

      if (buildResult.structuredContent?.error) {
        showToast(`Build failed: ${buildResult.structuredContent.error}`, 'error');
        setOperationStatus(null);
        return;
      }

      setOperationStatus('Starting preview server...');

      // Step 2: Start the preview server
      const previewResult = await app.callServerTool({
        name: 'start_web_preview',
        arguments: { projectName },
      });

      if (previewResult.structuredContent?.url) {
        showToast('Game is ready! Opening preview...', 'success');
        // Open the preview URL in a new tab
        window.open(previewResult.structuredContent.url, '_blank');
      } else if (previewResult.structuredContent?.error) {
        showToast(`Preview failed: ${previewResult.structuredContent.error}`, 'error');
      } else {
        showToast('Build complete!', 'success');
      }
    } catch (e) {
      console.error('Build error:', e);
      showToast('Failed to build project', 'error');
    } finally {
      setOperationStatus(null);
    }
  }, [app, showToast]);

  // Show welcome if no projects
  const showWelcome = projects.length === 0 && view !== 'projects';

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        {/* Brand Row - Centered */}
        <div className="header-brand">
          <img src={logoImg} alt="" className="logo-img" />
          <h1 className="title">Ren'Py Studio</h1>
          {selectedProject && (
            <span className="project-badge">{selectedProject.replace(/_/g, ' ')}</span>
          )}
        </div>

        {/* Navigation Row */}
        <nav className="header-nav">
          <button
            className={`nav-btn nav-btn-new ${view === 'welcome' ? 'active' : ''}`}
            onClick={() => navigateToView('welcome')}
          >
            <PlusIcon /> New
          </button>
          {projects.length > 0 && (
            <button
              className={`nav-btn ${view === 'projects' ? 'active' : ''}`}
              onClick={() => navigateToView('projects')}
            >
              <LibraryIcon /> Library
            </button>
          )}
          {selectedProject && (
            <>
              <button
                className={`nav-btn ${view === 'assets' ? 'active' : ''}`}
                onClick={() => navigateToView('assets')}
              >
                <GalleryIcon /> Gallery
              </button>
              <button
                className={`nav-btn ${view === 'story' ? 'active' : ''}`}
                onClick={() => navigateToView('story')}
              >
                <FlowIcon /> Story
              </button>
              <button
                className={`nav-btn ${view === 'preview' ? 'active' : ''}`}
                onClick={() => navigateToView('preview')}
              >
                <TheaterIcon /> Play
              </button>
            </>
          )}
        </nav>
      </header>

      {/* Operation Status Bar */}
      {operationStatus && <OperationStatus message={operationStatus} />}

      {/* Main Content */}
      <main className="main">
        {loading && <LoadingState />}
        {error && <div className="error">{error}</div>}

        {!loading && (view === 'welcome' || showWelcome) && (
          <WelcomeView
            onSendToClaude={sendToClaude}
            onBrowseLibrary={() => navigateToView('projects')}
            hasProjects={projects.length > 0}
          />
        )}

        {!loading && view === 'projects' && !showWelcome && (
          <ProjectsView
            projects={projects}
            onSelect={selectProject}
            onCreateNew={() => navigateToView('welcome')}
            onDelete={deleteProject}
          />
        )}

        {!loading && view === 'assets' && selectedProject && (
          <AssetsView
            projectName={selectedProject}
            backgrounds={backgrounds}
            characters={characters}
            onSendToClaude={sendToClaude}
          />
        )}

        {!loading && view === 'story' && selectedProject && app && (
          <VisualSceneBuilder
            projectName={selectedProject}
            onSendToClaude={sendToClaude}
            app={app}
            backgrounds={backgrounds}
            characters={characters}
          />
        )}

        {!loading && view === 'preview' && selectedProject && app && (
          <PreviewView
            projectName={selectedProject}
            app={app}
            showToast={showToast}
          />
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Operation Status Indicator
// ============================================================================

function OperationStatus({ message }: { message: string }) {
  return (
    <div className="operation-status">
      <div className="operation-spinner">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76z" />
          <line x1="16" y1="8" x2="2" y2="22" />
        </svg>
      </div>
      <span className="operation-text">{message}</span>
    </div>
  );
}

// ============================================================================
// Loading State - Quill & Ink Animation
// ============================================================================

function LoadingSpinner() {
  return (
    <div className="loading-spinner">
      <div className="spinner-quill">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5l6.74-6.76z" />
          <line x1="16" y1="8" x2="2" y2="22" />
        </svg>
      </div>
      <div className="spinner-dots">
        <span className="dot"></span>
        <span className="dot"></span>
        <span className="dot"></span>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="loading-overlay">
      <LoadingSpinner />
      <p className="loading-text">Preparing your story...</p>
    </div>
  );
}

// ============================================================================
// Welcome View - Story Creation Wizard
// ============================================================================

function WelcomeView({
  onSendToClaude,
  onBrowseLibrary,
  hasProjects,
}: {
  onSendToClaude: (prompt: string) => void;
  onBrowseLibrary: () => void;
  hasProjects: boolean;
}) {
  const [formData, setFormData] = useState<ProjectFormData>({
    title: '',
    genre: 'romance',
    genreCustom: '',
    setting: 'modern',
    settingCustom: '',
    mood: 'heartwarming',
    moodCustom: '',
    characters: [
      { name: '', role: 'protagonist', roleCustom: '', description: '' },
    ],
    premise: '',
  });

  const applyTemplate = (template: StoryTemplate) => {
    setFormData({
      title: template.data.title || '',
      genre: template.data.genre || 'romance',
      genreCustom: template.data.genreCustom || '',
      setting: template.data.setting || 'modern',
      settingCustom: template.data.settingCustom || '',
      mood: template.data.mood || 'heartwarming',
      moodCustom: template.data.moodCustom || '',
      characters: template.data.characters || [{ name: '', role: 'protagonist', roleCustom: '', description: '' }],
      premise: template.data.premise || '',
    });
  };

  const addCharacter = () => {
    if (formData.characters.length < 5) {
      setFormData({
        ...formData,
        characters: [...formData.characters, { name: '', role: 'friend', roleCustom: '', description: '' }],
      });
    }
  };

  const removeCharacter = (index: number) => {
    if (formData.characters.length > 1) {
      setFormData({
        ...formData,
        characters: formData.characters.filter((_, i) => i !== index),
      });
    }
  };

  const updateCharacter = (index: number, field: keyof CharacterFormData, value: string) => {
    const newCharacters = [...formData.characters];
    newCharacters[index] = { ...newCharacters[index], [field]: value };
    setFormData({ ...formData, characters: newCharacters });
  };

  const handleCreateStory = () => {
    const projectName = formData.title.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    if (!projectName) {
      alert('Please enter a story title');
      return;
    }

    const charactersDescription = formData.characters
      .filter(c => c.name.trim())
      .map(c => {
        const role = c.role === 'other' ? c.roleCustom : (ROLE_OPTIONS.find(r => r.value === c.role)?.label || c.role);
        const description = c.description || 'No description provided';
        return `- ${c.name} (${role}): ${description}`;
      })
      .join('\n');

    // Get display values, using custom text for 'other' selections
    const genreDisplay = formData.genre === 'other' ? formData.genreCustom : (GENRE_OPTIONS.find(g => g.value === formData.genre)?.label || formData.genre);
    const settingDisplay = formData.setting === 'other' ? formData.settingCustom : (SETTING_OPTIONS.find(s => s.value === formData.setting)?.label || formData.setting);
    const moodDisplay = formData.mood === 'other' ? formData.moodCustom : (MOOD_OPTIONS.find(m => m.value === formData.mood)?.label || formData.mood);

    const prompt = `Create a visual novel called "${formData.title}" with the following details:

**Genre:** ${genreDisplay}
**Setting:** ${settingDisplay}
**Mood:** ${moodDisplay}

**Characters:**
${charactersDescription || '- Please suggest appropriate characters for this story'}

**Premise:**
${formData.premise || 'A compelling story in the ' + formData.genre + ' genre.'}

Please:
1. Create the project using create_project with the name "${projectName}"
2. Generate character sprites for each main character using generate_character (with emotions)
3. Generate the opening background scene using generate_background
4. Write an engaging opening scene using generate_script

Make the story engaging with player choices!`;

    onSendToClaude(prompt);
  };

  const isFormValid = formData.title.trim().length > 0;

  return (
    <div className="welcome-view">
      <div className="wizard">
        <div className="wizard-header">
          <h2>Begin Your Story</h2>
          <img src={dividerImg} alt="" className="wizard-divider" />
          <p className="wizard-subtitle">
            Fill in the details below to bring your visual novel to life
          </p>
        </div>

        {/* Quick Start Templates */}
        <div className="templates-section">
          <h3>Quick Start Templates</h3>
          <div className="templates-grid">
            {STORY_TEMPLATES.map((template) => (
              <button
                key={template.name}
                type="button"
                className="template-card"
                onClick={() => applyTemplate(template)}
              >
                <span className="template-icon">{template.icon}</span>
                <span className="template-name">{template.name}</span>
                <span className="template-desc">{template.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="wizard-form">
          {/* Title */}
          <div className="form-group">
            <label htmlFor="title">Story Title</label>
            <input
              id="title"
              type="text"
              placeholder="My Visual Novel..."
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            />
          </div>

          {/* Premise - moved right after title */}
          <div className="form-group">
            <label htmlFor="premise">Story Premise</label>
            <textarea
              id="premise"
              placeholder="Describe your story in a few sentences... (e.g., 'A heartwarming tale about finding unexpected love at a cozy neighborhood café, where every cup of coffee brings new connections.')"
              value={formData.premise}
              onChange={(e) => setFormData({ ...formData, premise: e.target.value })}
              rows={4}
            />
          </div>

          {/* Genre, Setting, Mood Row */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="genre">Genre</label>
              <select
                id="genre"
                value={formData.genre}
                onChange={(e) => setFormData({ ...formData, genre: e.target.value as ProjectFormData['genre'] })}
              >
                {GENRE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.icon} {opt.label}
                  </option>
                ))}
              </select>
              {formData.genre === 'other' && (
                <input
                  type="text"
                  placeholder="Enter custom genre..."
                  value={formData.genreCustom}
                  onChange={(e) => setFormData({ ...formData, genreCustom: e.target.value })}
                  className="custom-option-input"
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="setting">Setting</label>
              <select
                id="setting"
                value={formData.setting}
                onChange={(e) => setFormData({ ...formData, setting: e.target.value as ProjectFormData['setting'] })}
              >
                {SETTING_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {formData.setting === 'other' && (
                <input
                  type="text"
                  placeholder="Enter custom setting..."
                  value={formData.settingCustom}
                  onChange={(e) => setFormData({ ...formData, settingCustom: e.target.value })}
                  className="custom-option-input"
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="mood">Mood</label>
              <select
                id="mood"
                value={formData.mood}
                onChange={(e) => setFormData({ ...formData, mood: e.target.value as ProjectFormData['mood'] })}
              >
                {MOOD_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {formData.mood === 'other' && (
                <input
                  type="text"
                  placeholder="Enter custom mood..."
                  value={formData.moodCustom}
                  onChange={(e) => setFormData({ ...formData, moodCustom: e.target.value })}
                  className="custom-option-input"
                />
              )}
            </div>
          </div>

          {/* Characters Section */}
          <div className="form-section">
            <div className="section-header">
              <h3>Main Characters</h3>
              {formData.characters.length < 5 && (
                <button type="button" className="btn-add" onClick={addCharacter}>
                  <PlusIcon /> Add Character
                </button>
              )}
            </div>

            <div className="character-list">
              {formData.characters.map((char, index) => (
                <div key={index} className="character-form-card">
                  <div className="character-form-header">
                    <input
                      type="text"
                      placeholder="Character name..."
                      value={char.name}
                      onChange={(e) => updateCharacter(index, 'name', e.target.value)}
                      className="char-name-input"
                    />
                    <select
                      value={char.role}
                      onChange={(e) => updateCharacter(index, 'role', e.target.value)}
                      className="char-role-select"
                    >
                      {ROLE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    {formData.characters.length > 1 && (
                      <button
                        type="button"
                        className="btn-remove"
                        onClick={() => removeCharacter(index)}
                        title="Remove character"
                      >
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                  {char.role === 'other' && (
                    <input
                      type="text"
                      placeholder="Enter custom role..."
                      value={char.roleCustom}
                      onChange={(e) => updateCharacter(index, 'roleCustom', e.target.value)}
                      className="custom-option-input"
                    />
                  )}
                  <textarea
                    placeholder="Describe their appearance and personality (e.g., 'Cheerful barista with short brown hair, warm brown eyes, wearing a green apron. Shy but kind, loves reading.')"
                    value={char.description}
                    onChange={(e) => updateCharacter(index, 'description', e.target.value)}
                    rows={4}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="button"
            className="btn-create-story"
            onClick={handleCreateStory}
            disabled={!isFormValid}
          >
            <SparklesIcon />
            Create My Story
          </button>
        </div>

        {hasProjects && (
          <div className="wizard-footer">
            <span>Or</span>
            <button type="button" className="btn-secondary" onClick={onBrowseLibrary}>
              Browse existing stories
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Projects View - The Grand Library
// ============================================================================

function ProjectsView({
  projects,
  onSelect,
  onCreateNew,
  onDelete,
}: {
  projects: Project[];
  onSelect: (name: string) => void;
  onCreateNew: () => void;
  onDelete: (name: string) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent, projectName: string) => {
    e.stopPropagation(); // Prevent selecting the project
    setPendingDelete(projectName);
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      console.log('Confirming delete for:', pendingDelete);
      onDelete(pendingDelete);
      setPendingDelete(null);
    }
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  return (
    <div className="projects-view">
      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div className="delete-modal-overlay" onClick={cancelDelete}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Project?</h3>
            <p>Are you sure you want to delete "{pendingDelete.replace(/_/g, ' ')}"?</p>
            <p className="warning">This will remove all files and cannot be undone.</p>
            <div className="delete-modal-actions">
              <button className="btn-cancel" onClick={cancelDelete}>Cancel</button>
              <button className="btn-confirm-delete" onClick={confirmDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}

      <div className="shelf">
        <h2 className="shelf-title">Your Stories</h2>
        <p className="shelf-subtitle">
          Each volume holds a world waiting to unfold
        </p>

        <div className="book-grid">
          {/* New Story Card */}
          <div
            className="book-card new-book"
            onClick={onCreateNew}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && onCreateNew()}
          >
            <div className="book-spine">
              <span className="book-icon">✦</span>
              <span className="book-title">Begin New Story</span>
            </div>
          </div>

          {/* Existing Projects */}
          {projects.map((project, index) => (
            <div
              key={project.name}
              className="book-card"
              onClick={() => onSelect(project.name)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(project.name)}
              style={{ animationDelay: `${(index + 1) * 50}ms` }}
            >
              <div className="book-spine">
                <BookIcon />
                <span className="book-title">{project.name.replace(/_/g, ' ')}</span>
                <span className="book-meta">
                  {project.scriptCount || 0} {project.scriptCount === 1 ? 'chapter' : 'chapters'}
                </span>
              </div>
              <button
                className="btn-delete-project"
                onClick={(e) => handleDeleteClick(e, project.name)}
                title="Delete project"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>

        {projects.length === 0 && (
          <div className="empty-shelf">
            <p>Your library awaits its first volume.</p>
            <p className="hint">
              Click "Begin New Story" above to create your first visual novel.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Assets View - The Illustrated Journal
// ============================================================================

// Background form data
interface BackgroundFormData {
  name: string;
  location: string;
  timeOfDay: string;
  mood: string;
  details: string;
}

// Character form data for asset creation
interface CharacterAssetFormData {
  name: string;
  role: string;
  appearance: string;
  clothing: string;
  personality: string;
}

const TIME_OF_DAY_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening / Sunset' },
  { value: 'night', label: 'Night' },
  { value: 'other', label: 'Other (Custom)' },
];

const LOCATION_OPTIONS = [
  { value: 'cafe', label: 'Café / Coffee Shop' },
  { value: 'school', label: 'School / Classroom' },
  { value: 'park', label: 'Park / Garden' },
  { value: 'street', label: 'City Street' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'living_room', label: 'Living Room' },
  { value: 'office', label: 'Office' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'beach', label: 'Beach' },
  { value: 'forest', label: 'Forest' },
  { value: 'other', label: 'Other (Custom)' },
];

const BG_MOOD_OPTIONS = [
  { value: 'cozy', label: 'Cozy / Warm' },
  { value: 'romantic', label: 'Romantic' },
  { value: 'mysterious', label: 'Mysterious' },
  { value: 'cheerful', label: 'Cheerful / Bright' },
  { value: 'melancholy', label: 'Melancholy / Sad' },
  { value: 'tense', label: 'Tense / Dramatic' },
  { value: 'peaceful', label: 'Peaceful / Serene' },
  { value: 'other', label: 'Other (Custom)' },
];

function AssetsView({
  projectName,
  backgrounds,
  characters,
  onSendToClaude,
}: {
  projectName: string;
  backgrounds: Background[];
  characters: Character[];
  onSendToClaude: (prompt: string) => void;
}) {
  const [tab, setTab] = useState<'backgrounds' | 'characters'>('characters');
  const [showAddBackground, setShowAddBackground] = useState(false);
  const [showAddCharacter, setShowAddCharacter] = useState(false);

  // Background form state
  const [bgForm, setBgForm] = useState<BackgroundFormData>({
    name: '',
    location: 'cafe',
    timeOfDay: 'afternoon',
    mood: 'cozy',
    details: '',
  });
  const [bgLocationCustom, setBgLocationCustom] = useState('');
  const [bgTimeCustom, setBgTimeCustom] = useState('');
  const [bgMoodCustom, setBgMoodCustom] = useState('');

  // Character form state
  const [charForm, setCharForm] = useState<CharacterAssetFormData>({
    name: '',
    role: 'protagonist',
    appearance: '',
    clothing: '',
    personality: '',
  });

  // Character detail view state
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [currentEmotionIndex, setCurrentEmotionIndex] = useState(0);
  const [showTransparent, setShowTransparent] = useState(true);

  // Background detail view state
  const [selectedBackground, setSelectedBackground] = useState<string | null>(null);

  // Delete confirmation state
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  // Get selected character/background data
  const selectedCharacterData = selectedCharacter
    ? characters.find(c => c.name === selectedCharacter)
    : null;
  const selectedBackgroundData = selectedBackground
    ? backgrounds.find(b => b.name === selectedBackground)
    : null;

  const handleAddBackground = () => {
    const location = bgForm.location === 'other' ? bgLocationCustom :
      LOCATION_OPTIONS.find(o => o.value === bgForm.location)?.label || bgForm.location;
    const time = bgForm.timeOfDay === 'other' ? bgTimeCustom :
      TIME_OF_DAY_OPTIONS.find(o => o.value === bgForm.timeOfDay)?.label || bgForm.timeOfDay;
    const mood = bgForm.mood === 'other' ? bgMoodCustom :
      BG_MOOD_OPTIONS.find(o => o.value === bgForm.mood)?.label || bgForm.mood;

    const prompt = `Generate a background for ${projectName}:
- Name: ${bgForm.name || 'bg_' + bgForm.location}
- Location: ${location}
- Time of Day: ${time}
- Mood/Atmosphere: ${mood}
${bgForm.details ? `- Additional Details: ${bgForm.details}` : ''}

Create this as a 16:9 visual novel background in anime style.`;

    onSendToClaude(prompt);
    setShowAddBackground(false);
    // Reset form
    setBgForm({ name: '', location: 'cafe', timeOfDay: 'afternoon', mood: 'cozy', details: '' });
    setBgLocationCustom('');
    setBgTimeCustom('');
    setBgMoodCustom('');
  };

  const handleAddCharacter = () => {
    const roleLabel = ROLE_OPTIONS.find(o => o.value === charForm.role)?.label || charForm.role;

    const prompt = `Create a character for ${projectName}:
- Name: ${charForm.name}
- Role: ${roleLabel}
- Appearance: ${charForm.appearance}
${charForm.clothing ? `- Clothing: ${charForm.clothing}` : ''}
${charForm.personality ? `- Personality: ${charForm.personality}` : ''}

Generate their sprite with multiple emotions (happy, sad, surprised, angry, neutral) in anime visual novel style.`;

    onSendToClaude(prompt);
    setShowAddCharacter(false);
    // Reset form
    setCharForm({ name: '', role: 'protagonist', appearance: '', clothing: '', personality: '' });
  };

  return (
    <div className="assets-view">
      {/* Add Background Modal */}
      {showAddBackground && (
        <div className="asset-modal-overlay" onClick={() => setShowAddBackground(false)}>
          <div className="asset-modal" onClick={(e) => e.stopPropagation()}>
            <h3><GalleryIcon /> Add Background</h3>
            <p className="modal-hint">Describe the scene you want to create</p>

            <div className="asset-form">
              <div className="form-group">
                <label>Scene Name (optional)</label>
                <input
                  type="text"
                  placeholder="e.g., cafe_interior, park_sunset"
                  value={bgForm.name}
                  onChange={(e) => setBgForm({ ...bgForm, name: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Location</label>
                  <select
                    value={bgForm.location}
                    onChange={(e) => setBgForm({ ...bgForm, location: e.target.value })}
                  >
                    {LOCATION_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {bgForm.location === 'other' && (
                    <input
                      type="text"
                      placeholder="Describe the location..."
                      value={bgLocationCustom}
                      onChange={(e) => setBgLocationCustom(e.target.value)}
                      className="custom-option-input"
                    />
                  )}
                </div>

                <div className="form-group">
                  <label>Time of Day</label>
                  <select
                    value={bgForm.timeOfDay}
                    onChange={(e) => setBgForm({ ...bgForm, timeOfDay: e.target.value })}
                  >
                    {TIME_OF_DAY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {bgForm.timeOfDay === 'other' && (
                    <input
                      type="text"
                      placeholder="Describe the time..."
                      value={bgTimeCustom}
                      onChange={(e) => setBgTimeCustom(e.target.value)}
                      className="custom-option-input"
                    />
                  )}
                </div>
              </div>

              <div className="form-group">
                <label>Mood / Atmosphere</label>
                <select
                  value={bgForm.mood}
                  onChange={(e) => setBgForm({ ...bgForm, mood: e.target.value })}
                >
                  {BG_MOOD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {bgForm.mood === 'other' && (
                  <input
                    type="text"
                    placeholder="Describe the mood..."
                    value={bgMoodCustom}
                    onChange={(e) => setBgMoodCustom(e.target.value)}
                    className="custom-option-input"
                  />
                )}
              </div>

              <div className="form-group">
                <label>Additional Details (optional)</label>
                <textarea
                  placeholder="Any specific elements you want in the scene... (e.g., 'rainy weather', 'crowded with people', 'vintage furniture')"
                  value={bgForm.details}
                  onChange={(e) => setBgForm({ ...bgForm, details: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowAddBackground(false)}>
                Cancel
              </button>
              <button className="btn-create" onClick={handleAddBackground}>
                <SendIcon /> Create Background
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Character Modal */}
      {showAddCharacter && (
        <div className="asset-modal-overlay" onClick={() => setShowAddCharacter(false)}>
          <div className="asset-modal" onClick={(e) => e.stopPropagation()}>
            <h3><PlusIcon /> Add Character</h3>
            <p className="modal-hint">Describe your character's appearance</p>

            <div className="asset-form">
              <div className="form-row">
                <div className="form-group">
                  <label>Character Name *</label>
                  <input
                    type="text"
                    placeholder="e.g., Alice, Marcus"
                    value={charForm.name}
                    onChange={(e) => setCharForm({ ...charForm, name: e.target.value })}
                  />
                </div>

                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={charForm.role}
                    onChange={(e) => setCharForm({ ...charForm, role: e.target.value })}
                  >
                    {ROLE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Appearance *</label>
                <textarea
                  placeholder="Describe their physical appearance... (e.g., 'Young woman with long brown hair, green eyes, warm smile')"
                  value={charForm.appearance}
                  onChange={(e) => setCharForm({ ...charForm, appearance: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="form-group">
                <label>Clothing (optional)</label>
                <input
                  type="text"
                  placeholder="e.g., 'Casual sweater and jeans', 'School uniform', 'Business suit'"
                  value={charForm.clothing}
                  onChange={(e) => setCharForm({ ...charForm, clothing: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Personality Traits (optional)</label>
                <input
                  type="text"
                  placeholder="e.g., 'Cheerful and energetic', 'Shy but kind', 'Mysterious'"
                  value={charForm.personality}
                  onChange={(e) => setCharForm({ ...charForm, personality: e.target.value })}
                />
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowAddCharacter(false)}>
                Cancel
              </button>
              <button
                className="btn-create"
                onClick={handleAddCharacter}
                disabled={!charForm.name.trim() || !charForm.appearance.trim()}
              >
                <SendIcon /> Create Character
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Character Detail Modal */}
      {selectedCharacterData && (
        <div className="asset-modal-overlay" onClick={() => setSelectedCharacter(null)}>
          <div className="asset-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-close-modal"
              onClick={() => setSelectedCharacter(null)}
            >
              ×
            </button>

            <div className="detail-modal-layout">
              {/* Left: Large character preview */}
              <div className="character-preview-panel">
                <div className={`character-preview-large ${showTransparent ? 'transparent-bg' : ''}`}>
                  {selectedCharacterData.emotions[currentEmotionIndex] && (
                    <img
                      src={`data:${selectedCharacterData.emotions[currentEmotionIndex].mimeType};base64,${
                        showTransparent
                          ? selectedCharacterData.emotions[currentEmotionIndex].base64Transparent
                          : selectedCharacterData.emotions[currentEmotionIndex].base64
                      }`}
                      alt={`${selectedCharacterData.name} - ${selectedCharacterData.emotions[currentEmotionIndex].emotion}`}
                    />
                  )}
                </div>

                {/* Emotion cycler controls */}
                <div className="emotion-cycler">
                  <button
                    className="btn-emotion-nav"
                    onClick={() => setCurrentEmotionIndex(i => Math.max(0, i - 1))}
                    disabled={currentEmotionIndex === 0}
                  >
                    ←
                  </button>
                  <span className="emotion-label">
                    {selectedCharacterData.emotions[currentEmotionIndex]?.emotion || 'neutral'}
                  </span>
                  <button
                    className="btn-emotion-nav"
                    onClick={() => setCurrentEmotionIndex(i => Math.min(selectedCharacterData.emotions.length - 1, i + 1))}
                    disabled={currentEmotionIndex === selectedCharacterData.emotions.length - 1}
                  >
                    →
                  </button>
                </div>

                {/* Emotion dots */}
                <div className="emotion-dots">
                  {selectedCharacterData.emotions.map((emo, idx) => (
                    <button
                      key={emo.emotion}
                      className={`emotion-dot ${idx === currentEmotionIndex ? 'active' : ''}`}
                      onClick={() => setCurrentEmotionIndex(idx)}
                      title={emo.emotion}
                    />
                  ))}
                </div>

                {/* Transparency toggle */}
                <label className="transparency-toggle">
                  <input
                    type="checkbox"
                    checked={showTransparent}
                    onChange={(e) => setShowTransparent(e.target.checked)}
                  />
                  Show transparent background
                </label>
              </div>

              {/* Right: Info panel */}
              <div className="character-info-panel">
                <h2 className="detail-name">
                  {selectedCharacterData.metadata?.displayName || selectedCharacterData.name}
                </h2>

                {selectedCharacterData.metadata?.description && (
                  <div className="info-section">
                    <h4>Description</h4>
                    <p className="description-text">{selectedCharacterData.metadata.description}</p>
                  </div>
                )}

                {selectedCharacterData.metadata?.role && (
                  <div className="info-section">
                    <h4>Role</h4>
                    <p>{selectedCharacterData.metadata.role}</p>
                  </div>
                )}

                <div className="info-section">
                  <h4>Available Emotions</h4>
                  <div className="emotion-tags">
                    {selectedCharacterData.emotions.map(e => (
                      <span key={e.emotion} className="emotion-tag">{e.emotion}</span>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="detail-actions">
                  <button
                    className="btn-regenerate"
                    onClick={() => {
                      if (selectedCharacterData.metadata?.description) {
                        onSendToClaude(`Regenerate the character "${selectedCharacterData.name}" with description: ${selectedCharacterData.metadata.description}`);
                      } else {
                        onSendToClaude(`Regenerate the character "${selectedCharacterData.name}"`);
                      }
                      setSelectedCharacter(null);
                    }}
                  >
                    ↻ Regenerate
                  </button>
                  <button
                    className="btn-delete-asset"
                    onClick={() => {
                      setPendingDelete({
                        type: 'character',
                        id: selectedCharacterData.name,
                        name: selectedCharacterData.metadata?.displayName || selectedCharacterData.name,
                      });
                    }}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Background Detail Modal */}
      {selectedBackgroundData && (
        <div className="asset-modal-overlay" onClick={() => setSelectedBackground(null)}>
          <div className="asset-detail-modal background-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-close-modal"
              onClick={() => setSelectedBackground(null)}
            >
              ×
            </button>

            <div className="background-preview-large">
              <img
                src={`data:${selectedBackgroundData.mimeType};base64,${selectedBackgroundData.base64}`}
                alt={selectedBackgroundData.name}
              />
            </div>

            <div className="background-info-panel">
              <h2 className="detail-name">
                {selectedBackgroundData.metadata?.displayName || selectedBackgroundData.name.replace(/_/g, ' ')}
              </h2>

              {selectedBackgroundData.metadata?.description && (
                <div className="info-section">
                  <h4>Description / Prompt</h4>
                  <p className="description-text">{selectedBackgroundData.metadata.description}</p>
                </div>
              )}

              {(selectedBackgroundData.metadata?.location || selectedBackgroundData.metadata?.timeOfDay || selectedBackgroundData.metadata?.mood) && (
                <div className="info-tags">
                  {selectedBackgroundData.metadata?.location && (
                    <span className="info-tag">📍 {selectedBackgroundData.metadata.location}</span>
                  )}
                  {selectedBackgroundData.metadata?.timeOfDay && (
                    <span className="info-tag">🕐 {selectedBackgroundData.metadata.timeOfDay}</span>
                  )}
                  {selectedBackgroundData.metadata?.mood && (
                    <span className="info-tag">✨ {selectedBackgroundData.metadata.mood}</span>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="detail-actions">
                <button
                  className="btn-regenerate"
                  onClick={() => {
                    if (selectedBackgroundData.metadata?.description) {
                      onSendToClaude(`Edit/regenerate the background "${selectedBackgroundData.name}" with description: ${selectedBackgroundData.metadata.description}`);
                    } else {
                      onSendToClaude(`Regenerate the background "${selectedBackgroundData.name}"`);
                    }
                    setSelectedBackground(null);
                  }}
                >
                  ↻ Regenerate
                </button>
                <button
                  className="btn-delete-asset"
                  onClick={() => {
                    setPendingDelete({
                      type: 'background',
                      id: selectedBackgroundData.name,
                      name: selectedBackgroundData.metadata?.displayName || selectedBackgroundData.name,
                    });
                  }}
                >
                  🗑 Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {pendingDelete && (
        <div className="asset-modal-overlay delete-overlay" onClick={() => setPendingDelete(null)}>
          <div className="delete-confirmation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-icon">⚠️</div>

            <h3>Delete {pendingDelete.type === 'character' ? 'Character' : 'Background'}?</h3>

            <p>
              Are you sure you want to delete <strong>"{pendingDelete.name}"</strong>?
            </p>

            {pendingDelete.type === 'character' && (
              <p className="delete-detail">
                This will remove all emotion variants (neutral, happy, sad, surprised, angry).
              </p>
            )}

            <div className="warning-box">
              <span className="warning-icon">⚠️</span>
              <p>
                <strong>Warning:</strong> This could make the game unplayable if this asset is referenced in scripts. You'll need to regenerate the script or create a new asset.
              </p>
            </div>

            <div className="delete-modal-actions">
              <button className="btn-cancel" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                className="btn-confirm-delete"
                onClick={async () => {
                  // Call the delete tool via onSendToClaude
                  onSendToClaude(`Delete the ${pendingDelete.type} asset "${pendingDelete.id}" from project ${projectName}. Use the ui_delete_asset tool.`);
                  setPendingDelete(null);
                  setSelectedCharacter(null);
                  setSelectedBackground(null);
                }}
              >
                Delete {pendingDelete.type === 'character' ? 'Character' : 'Background'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="journal">
        {/* Quick Actions Bar */}
        <div className="gallery-actions">
          <button
            className="btn-quick"
            onClick={() => setShowAddBackground(true)}
          >
            <GalleryIcon /> Add Background
          </button>
          <button
            className="btn-quick"
            onClick={() => setShowAddCharacter(true)}
          >
            <PlusIcon /> Add Character
          </button>
        </div>

        <div className="journal-tabs">
          <button
            className={`tab ${tab === 'characters' ? 'active' : ''}`}
            onClick={() => setTab('characters')}
          >
            Characters ({characters.length})
          </button>
          <button
            className={`tab ${tab === 'backgrounds' ? 'active' : ''}`}
            onClick={() => setTab('backgrounds')}
          >
            Scenes ({backgrounds.length})
          </button>
        </div>

        <div className="journal-content">
          {tab === 'backgrounds' && (
            <div className="illustration-grid">
              {backgrounds.length === 0 ? (
                <div className="empty-page">
                  <p>No scenes illustrated yet.</p>
                  <p className="hint">
                    Try: "Create a cozy café interior at sunset"
                  </p>
                </div>
              ) : (
                backgrounds.map((bg) => (
                  <div
                    key={bg.name}
                    className="illustration-card illustration-card-clickable"
                    onClick={() => setSelectedBackground(bg.name)}
                  >
                    <img
                      src={`data:${bg.mimeType};base64,${bg.base64}`}
                      alt={bg.name}
                      loading="lazy"
                    />
                    <span className="illustration-label">
                      {bg.metadata?.displayName || bg.name.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'characters' && (
            <div className="character-grid">
              {characters.length === 0 ? (
                <div className="empty-page">
                  <p>No characters created yet.</p>
                  <p className="hint">
                    Try: "Create a cheerful barista named Alice"
                  </p>
                </div>
              ) : (
                characters.map((char) => {
                  const neutralEmotion = char.emotions.find(e => e.emotion === 'neutral') || char.emotions[0];
                  return (
                    <div
                      key={char.name}
                      className="character-card character-card-clickable"
                      onClick={() => {
                        setSelectedCharacter(char.name);
                        setCurrentEmotionIndex(0);
                      }}
                    >
                      <div className="character-preview-thumb">
                        {neutralEmotion && (
                          <img
                            src={`data:${neutralEmotion.mimeType};base64,${neutralEmotion.base64Transparent}`}
                            alt={char.name}
                            loading="lazy"
                          />
                        )}
                      </div>
                      <h4 className="character-name">{char.metadata?.displayName || char.name}</h4>
                      <div className="character-emotions-count">
                        {char.emotions.length} emotions
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Preview View - The Theater Stage
// ============================================================================

function TheaterMaskIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8c0-3.5 2.5-6 6-6s6 2.5 6 6c0 4-3 8-6 8s-6-4-6-8z" />
      <circle cx="5.5" cy="7" r="1" />
      <circle cx="8.5" cy="7" r="1" />
      <path d="M5 10c.5 1 1.5 2 4 2" />
      <path d="M21 8c0-3.5-2.5-6-6-6" />
      <path d="M21 8c0 4-3 8-6 8" />
      <circle cx="18.5" cy="7" r="1" />
      <circle cx="15.5" cy="7" r="1" />
      <path d="M19 10c-.5 1-1.5 2-4 2" />
    </svg>
  );
}

function PreviewView({
  projectName,
  app,
  showToast,
}: {
  projectName: string;
  app: any;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [gameKey, setGameKey] = useState(0); // Used to force remount RenpyPlayer

  // Start playing the game
  const startPlaying = useCallback(() => {
    setIsPlaying(true);
    setGameKey(prev => prev + 1); // Force remount
  }, []);

  // Stop playing (return to stage)
  const stopPlaying = useCallback(() => {
    setIsPlaying(false);
  }, []);

  // Rebuild project
  const rebuildProject = useCallback(async () => {
    if (!app) return;
    setIsBuilding(true);
    setIsPlaying(false);

    try {
      showToast('Building game... this may take a moment', 'info');

      const buildResult = await app.callServerTool({
        name: 'build_project',
        arguments: { projectName, target: 'web' },
      });

      if (buildResult.structuredContent?.error) {
        showToast(`Build failed: ${buildResult.structuredContent.error}`, 'error');
        return;
      }

      showToast('Build complete! Click Play to start.', 'success');
    } catch (e) {
      console.error('Build error:', e);
      showToast('Build timed out or failed. Check server logs.', 'error');
    } finally {
      setIsBuilding(false);
    }
  }, [app, projectName, showToast]);

  // Handle game ready
  const handleGameReady = useCallback(() => {
    showToast('Game is running!', 'success');
  }, [showToast]);

  // Handle game error
  const handleGameError = useCallback((error: string) => {
    showToast(`Game error: ${error}`, 'error');
    if (error.includes('not found') || error.includes('Missing')) {
      // Likely needs a build
      setIsPlaying(false);
    }
  }, [showToast]);

  return (
    <div className="preview-view">
      {isPlaying ? (
        // Game is running - show RenpyPlayer directly (no iframe!)
        <div className="game-container">
          <div className="game-toolbar">
            <span className="game-title">{projectName.replace(/_/g, ' ')}</span>
            <div className="game-actions">
              <button
                className="btn-toolbar"
                onClick={startPlaying}
              >
                ↻ Restart
              </button>
              <button
                className="btn-toolbar"
                onClick={stopPlaying}
              >
                ◼ Stop
              </button>
              <button
                className="btn-toolbar btn-rebuild"
                onClick={rebuildProject}
                disabled={isBuilding}
              >
                {isBuilding ? '⟳ Building...' : '🔨 Rebuild'}
              </button>
            </div>
          </div>
          <div className="game-player-container">
            <RenpyPlayer
              key={gameKey}
              projectName={projectName}
              app={app}
              onReady={handleGameReady}
              onError={handleGameError}
            />
          </div>
        </div>
      ) : (
        // No game running - show stage
        <div className="stage">
          <div className="stage-valance">
            <div className="valance-drape"></div>
            <div className="valance-center">
              <TheaterMaskIcon />
            </div>
            <div className="valance-drape"></div>
          </div>

          <div className="curtains">
            <div className="spotlight"></div>

            <div className="stage-content">
              <h2>{isBuilding ? 'Preparing...' : 'The Stage Awaits'}</h2>
              <p className="stage-tagline">
                {isBuilding
                  ? 'Building your visual novel...'
                  : 'Your story is ready to come alive'}
              </p>

              {!isBuilding && (
                <div className="stage-actions">
                  <button
                    className="btn-build"
                    onClick={startPlaying}
                  >
                    ▶ Play
                  </button>
                  <button
                    className="btn-rebuild-stage"
                    onClick={rebuildProject}
                  >
                    🔨 Rebuild
                  </button>
                </div>
              )}

              {isBuilding && (
                <div className="stage-loading">
                  <LoadingSpinner />
                </div>
              )}

              <p className="stage-hint">
                {isBuilding
                  ? 'Compiling scripts and packaging assets...'
                  : 'Play renders game directly (no iframe) • Rebuild recompiles everything'}
              </p>
            </div>

            <div className="stage-floor"></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Mount Application
// ============================================================================

function App() {
  return (
    <ToastProvider>
      <Studio />
    </ToastProvider>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
