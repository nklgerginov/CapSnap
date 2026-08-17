import { Project, SubtitleStyle, VideoFilter, VideoTransformSettings, WatermarkSettings, AudioSettings, SubtitleBlock } from '../types';
import { PRESET_THEMES } from './presetThemes';

const DB_NAME = 'AutoCapStudio_DB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_VIDEOS = 'video_blobs';
const LOCAL_STORAGE_KEY = 'autocap_projects_meta';

// Helper to open IndexedDB
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = event => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_VIDEOS)) {
        db.createObjectStore(STORE_VIDEOS);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Creates a brand new default Project instance
 */
export function createDefaultProject(customName?: string): Project {
  const timestamp = Date.now();
  const defaultTheme = PRESET_THEMES[0];

  const defaultStyle: SubtitleStyle = {
    fontFamily: defaultTheme.style.fontFamily || 'Impact, sans-serif',
    fontSize: defaultTheme.style.fontSize || 54,
    activeWordColor: defaultTheme.style.activeWordColor || '#FFE600',
    inactiveWordColor: defaultTheme.style.inactiveWordColor || '#FFFFFF',
    useBackgroundPill: defaultTheme.style.useBackgroundPill ?? false,
    backgroundColor: defaultTheme.style.backgroundColor || 'rgba(0,0,0,0.85)',
    backgroundOpacity: defaultTheme.style.backgroundOpacity ?? 0.85,
    activeWordBgColor: defaultTheme.style.activeWordBgColor,
    strokeColor: defaultTheme.style.strokeColor || '#000000',
    strokeWidth: defaultTheme.style.strokeWidth ?? 6,
    shadowColor: defaultTheme.style.shadowColor || 'rgba(0, 0, 0, 0.9)',
    shadowBlur: defaultTheme.style.shadowBlur ?? 10,
    shadowOffsetY: defaultTheme.style.shadowOffsetY ?? 4,
    animationType: defaultTheme.style.animationType || 'pop',
    maxWordsPerLine: defaultTheme.style.maxWordsPerLine || 3,
    maxLinesPerBlock: 2,
    textTransform: defaultTheme.style.textTransform || 'uppercase',
    positionYPercent: defaultTheme.style.positionYPercent ?? 70,
    positionXPercent: defaultTheme.style.positionXPercent ?? 50,
    emojiEnabled: defaultTheme.style.emojiEnabled ?? true,
    autoEmojiKeywords: defaultTheme.style.autoEmojiKeywords ?? true,
    activeScaleFactor: defaultTheme.style.activeScaleFactor ?? 1.2,
  };

  const defaultFilter: VideoFilter = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    blur: 0,
    sepia: 0,
    hueRotate: 0,
  };

  const defaultTransform: VideoTransformSettings = {
    scale: 1.0,
    panX: 0,
    panY: 0,
    playbackRate: 1.0,
    trimStart: 0,
    trimEnd: 0,
    framingMode: 'cover',
  };

  const defaultWatermark: WatermarkSettings = {
    enabled: false,
    text: '@mybrand',
    position: 'top-right',
    opacity: 0.8,
    fontSize: 24,
    positionXPercent: 88,
    positionYPercent: 8,
  };

  const defaultAudioSettings: AudioSettings = {
    videoVolume: 100,
    bgmVolume: 50,
    autoNormalize: true,
    targetLufs: -14,
  };

  const initialBlocks: SubtitleBlock[] = [
    {
      id: `b-1-${Math.random().toString(36).substring(2, 6)}`,
      start: 0.2,
      end: 1.4,
      words: [
        { id: `w-1-${Math.random().toString(36).substring(2, 6)}`, text: 'Welcome', start: 0.2, end: 0.5, emoji: '👋' },
        { id: `w-2-${Math.random().toString(36).substring(2, 6)}`, text: 'to', start: 0.5, end: 0.7 },
        { id: `w-3-${Math.random().toString(36).substring(2, 6)}`, text: 'NovaCap', start: 0.7, end: 1.4, colorOverride: '#FFE600', isEmphasized: true, emoji: '⚡' },
      ],
    },
    {
      id: `b-2-${Math.random().toString(36).substring(2, 6)}`,
      start: 1.5,
      end: 2.8,
      words: [
        { id: `w-4-${Math.random().toString(36).substring(2, 6)}`, text: 'Create', start: 1.5, end: 1.9, emoji: '⚡' },
        { id: `w-5-${Math.random().toString(36).substring(2, 6)}`, text: 'viral', start: 1.9, end: 2.3, colorOverride: '#00F0FF', isEmphasized: true, emoji: '🚀' },
        { id: `w-6-${Math.random().toString(36).substring(2, 6)}`, text: 'captions', start: 2.3, end: 2.8 },
      ],
    },
  ];

  return {
    id: `proj_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
    name: customName || `Project ${new Date(timestamp).toLocaleDateString()} ${new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    aspectRatio: '9:16',
    platformPreset: 'tiktok',
    selectedPresetId: defaultTheme.id,
    style: defaultStyle,
    filter: defaultFilter,
    transform: defaultTransform,
    watermark: defaultWatermark,
    audioSettings: defaultAudioSettings,
    blocks: initialBlocks,
  };
}

/**
 * Get all stored projects from IndexedDB / LocalStorage fallback
 */
export async function getAllProjects(): Promise<Project[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_PROJECTS], 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.getAll();

      request.onsuccess = () => {
        const projects = (request.result as Project[]) || [];
        projects.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        resolve(projects);
      };

      request.onerror = () => {
        resolve(getProjectsFromLocalStorageFallback());
      };
    });
  } catch {
    return getProjectsFromLocalStorageFallback();
  }
}

/**
 * Get single project by ID
 */
export async function getProject(id: string): Promise<Project | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_PROJECTS], 'readonly');
      const store = transaction.objectStore(STORE_PROJECTS);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        const fallback = getProjectsFromLocalStorageFallback();
        resolve(fallback.find(p => p.id === id) || null);
      };
    });
  } catch {
    const fallback = getProjectsFromLocalStorageFallback();
    return fallback.find(p => p.id === id) || null;
  }
}

/**
 * Save / Update a Project (and optionally its associated video blob)
 */
export async function saveProject(project: Project, videoBlob?: Blob | File | null): Promise<void> {
  const updatedProject: Project = {
    ...project,
    updatedAt: Date.now(),
  };

  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_PROJECTS, STORE_VIDEOS], 'readwrite');
    const projectStore = transaction.objectStore(STORE_PROJECTS);
    projectStore.put(updatedProject);

    if (videoBlob) {
      const videoStore = transaction.objectStore(STORE_VIDEOS);
      videoStore.put(videoBlob, project.id);
    }

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('Failed to save to IndexedDB, fallback to localStorage:', err);
  }

  // Always keep metadata updated in localStorage for swift listings
  updateLocalStorageProject(updatedProject);
}

/**
 * Get video blob associated with project ID
 */
export async function getProjectVideoBlob(projectId: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_VIDEOS], 'readonly');
      const store = transaction.objectStore(STORE_VIDEOS);
      const request = store.get(projectId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Delete a project and its video blob
 */
export async function deleteProject(id: string): Promise<void> {
  try {
    const db = await openDB();
    const transaction = db.transaction([STORE_PROJECTS, STORE_VIDEOS], 'readwrite');
    transaction.objectStore(STORE_PROJECTS).delete(id);
    transaction.objectStore(STORE_VIDEOS).delete(id);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.warn('IndexedDB delete error:', err);
  }

  // Remove from localStorage fallback
  const list = getProjectsFromLocalStorageFallback();
  const filtered = list.filter(p => p.id !== id);
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

/**
 * Duplicate a project
 */
export async function duplicateProject(id: string): Promise<Project> {
  const original = await getProject(id);
  if (!original) {
    throw new Error('Project not found to duplicate');
  }

  const newId = `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const copy: Project = {
    ...original,
    id: newId,
    name: `${original.name} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    blocks: original.blocks.map(b => ({
      ...b,
      id: `copy-${b.id}-${Math.random().toString(36).substring(2, 5)}`,
      words: b.words.map(w => ({
        ...w,
        id: `copy-${w.id}-${Math.random().toString(36).substring(2, 5)}`,
      })),
    })),
  };

  // Duplicate video blob if present
  const videoBlob = await getProjectVideoBlob(id);
  await saveProject(copy, videoBlob);

  return copy;
}

/**
 * Export project as JSON file
 */
export function exportProjectAsJSON(project: Project) {
  const data = JSON.stringify(project, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeTitle = project.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 30);
  a.download = `${safeTitle || 'project'}_autocap.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse and import project from JSON file
 */
export async function importProjectFromJSON(jsonString: string): Promise<Project> {
  const parsed = JSON.parse(jsonString) as Partial<Project>;
  if (!parsed.blocks || !Array.isArray(parsed.blocks)) {
    throw new Error('Invalid project file: Missing subtitle blocks');
  }

  const newProject: Project = {
    ...createDefaultProject(parsed.name ? `${parsed.name} (Imported)` : 'Imported Project'),
    ...parsed,
    id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await saveProject(newProject);
  return newProject;
}

// Fallback LocalStorage helpers
function getProjectsFromLocalStorageFallback(): Project[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function updateLocalStorageProject(project: Project) {
  try {
    const list = getProjectsFromLocalStorageFallback();
    const index = list.findIndex(p => p.id === project.id);
    if (index >= 0) {
      list[index] = project;
    } else {
      list.unshift(project);
    }
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore quota exceeded
  }
}
