import React, { useState, useEffect } from 'react';
import {
  FolderKanban,
  Plus,
  Trash2,
  Copy,
  Download,
  Upload,
  Check,
  Edit2,
  X,
  Clock,
  Video,
  FileText,
  Search,
  Sparkles,
  ExternalLink,
  Save,
  AlertTriangle,
} from 'lucide-react';
import { Project } from '../types';
import {
  getAllProjects,
  saveProject,
  deleteProject,
  duplicateProject,
  exportProjectAsJSON,
  importProjectFromJSON,
  createDefaultProject,
} from '../utils/projectStorage';

interface ProjectManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: Project | null;
  onSelectProject: (project: Project) => void;
  onSaveCurrentProject: (customName?: string) => Promise<void>;
}

export const ProjectManagerModal: React.FC<ProjectManagerModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  onSelectProject,
  onSaveCurrentProject,
}) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const loadProjects = async () => {
    setIsLoading(true);
    try {
      const all = await getAllProjects();
      setProjects(all);
    } catch (err) {
      console.error('Error loading projects:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProjects();
      setConfirmDeleteId(null);
      setEditingProjectId(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleCreateNewProject = async () => {
    const newProj = createDefaultProject();
    await saveProject(newProj);
    await loadProjects();
    onSelectProject(newProj);
    onClose();
  };

  const handleSaveCurrent = async () => {
    await onSaveCurrentProject();
    await loadProjects();
    setSaveSuccessMsg('Current project saved successfully!');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  const handleRenameProject = async (project: Project) => {
    if (!editingName.trim()) {
      setEditingProjectId(null);
      return;
    }
    const updated: Project = { ...project, name: editingName.trim(), updatedAt: Date.now() };
    await saveProject(updated);
    setEditingProjectId(null);
    await loadProjects();
    if (currentProject?.id === project.id) {
      onSelectProject(updated);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await duplicateProject(id);
      await loadProjects();
      setSaveSuccessMsg(`Created copy "${copy.name}"`);
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Duplicate error:', err);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProject(id);
    setConfirmDeleteId(null);
    await loadProjects();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async evt => {
      try {
        const text = evt.target?.result as string;
        if (text) {
          const imported = await importProjectFromJSON(text);
          await loadProjects();
          onSelectProject(imported);
          setSaveSuccessMsg(`Imported project "${imported.name}"!`);
          setTimeout(() => setSaveSuccessMsg(null), 3000);
        }
      } catch (err) {
        alert('Invalid AutoCap project JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (p.videoName && p.videoName.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <FolderKanban className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white">Project Manager</h2>
                <span className="text-[10px] text-amber-400 font-mono font-bold bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  {projects.length} Saved {projects.length === 1 ? 'Project' : 'Projects'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleSaveCurrent}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all shadow-sm active:scale-95"
              title="Save current work"
            >
              <Save className="w-3.5 h-3.5 text-amber-400" />
              <span>Save Active</span>
            </button>

            <button
              onClick={handleCreateNewProject}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 transition-all shadow-md active:scale-95"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span>New Project</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Action Notice */}
        {saveSuccessMsg && (
          <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-5 py-2 text-xs font-semibold text-emerald-400 flex items-center space-x-2">
            <Check className="w-3.5 h-3.5" />
            <span>{saveSuccessMsg}</span>
          </div>
        )}

        {/* Search & Utility Bar */}
        <div className="px-5 py-3 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <label className="cursor-pointer flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-all">
            <Upload className="w-3.5 h-3.5 text-amber-400" />
            <span>Import Project (.json)</span>
            <input type="file" accept=".json" onChange={handleImportFile} className="hidden" />
          </label>
        </div>

        {/* Project Grid */}
        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
          {isLoading ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              <Sparkles className="w-5 h-5 animate-spin text-amber-400 mx-auto mb-2" />
              Loading projects...
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs bg-slate-950/40 rounded-2xl border border-dashed border-slate-800 space-y-3">
              <FolderKanban className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-300">
                  {searchQuery ? 'No matching projects found' : 'No saved projects yet'}
                </p>
                <p className="text-[11px] text-slate-500">
                  Create a new project or start editing to auto-save your work locally.
                </p>
              </div>
              <button
                onClick={handleCreateNewProject}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow"
              >
                + Create First Project
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredProjects.map(project => {
                const isActive = currentProject?.id === project.id;
                const isEditing = editingProjectId === project.id;
                const isConfirmingDelete = confirmDeleteId === project.id;
                const wordCount = project.blocks?.reduce((acc, b) => acc + (b.words?.length || 0), 0) || 0;

                return (
                  <div
                    key={project.id}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                      isActive
                        ? 'bg-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/5 ring-1 ring-amber-500/30'
                        : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    {/* Top Row: Title + Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <div className="flex items-center space-x-1.5">
                            <input
                              type="text"
                              autoFocus
                              value={editingName}
                              onChange={e => setEditingName(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleRenameProject(project);
                                if (e.key === 'Escape') setEditingProjectId(null);
                              }}
                              className="bg-slate-900 border border-amber-500 text-white text-xs px-2 py-1 rounded-lg focus:outline-none w-full font-bold"
                            />
                            <button
                              onClick={() => handleRenameProject(project)}
                              className="p-1.5 bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 shrink-0"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-1.5 group/title">
                            <h3
                              onClick={() => {
                                onSelectProject(project);
                                onClose();
                              }}
                              className="text-xs font-bold text-white truncate cursor-pointer hover:text-amber-400 transition-colors"
                            >
                              {project.name}
                            </h3>
                            <button
                              onClick={() => {
                                setEditingProjectId(project.id);
                                setEditingName(project.name);
                              }}
                              className="opacity-0 group-hover/title:opacity-100 text-slate-500 hover:text-amber-400 p-0.5 transition-opacity"
                              title="Rename"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}

                        <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1">
                          <span className="flex items-center">
                            <Clock className="w-2.5 h-2.5 mr-1 text-slate-500" />
                            {formatTimeAgo(project.updatedAt || project.createdAt)}
                          </span>
                          <span>•</span>
                          <span className="uppercase font-mono text-amber-400/90 font-bold">
                            {project.platformPreset || 'tiktok'}
                          </span>
                        </div>
                      </div>

                      {isActive && (
                        <span className="bg-amber-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded-md uppercase shrink-0 shadow">
                          Active
                        </span>
                      )}
                    </div>

                    {/* Middle: Details & Badges */}
                    <div className="bg-slate-900/90 p-2 rounded-xl border border-slate-800/80 flex items-center justify-between text-[11px] text-slate-300">
                      <div className="flex items-center space-x-2">
                        <span className="flex items-center text-slate-400">
                          <FileText className="w-3 h-3 mr-1 text-amber-400" />
                          {project.blocks?.length || 0} blocks ({wordCount} words)
                        </span>
                      </div>

                      {project.videoName && (
                        <div className="flex items-center space-x-1 text-slate-400 truncate max-w-[140px]" title={project.videoName}>
                          <Video className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span className="truncate text-[10px]">{project.videoName}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Buttons */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleDuplicate(project.id)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                          title="Duplicate Project"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => exportProjectAsJSON(project)}
                          className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                          title="Export JSON Backup"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {isConfirmingDelete ? (
                          <div className="flex items-center space-x-1 bg-rose-500/20 px-2 py-0.5 rounded-lg border border-rose-500/30">
                            <span className="text-[10px] text-rose-400 font-bold">Delete?</span>
                            <button
                              onClick={() => handleDelete(project.id)}
                              className="text-[10px] bg-rose-500 text-white font-bold px-1.5 py-0.5 rounded hover:bg-rose-600"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-[10px] text-slate-400 hover:text-white px-1"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(project.id)}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                            title="Delete Project"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          onSelectProject(project);
                          onClose();
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                          isActive
                            ? 'bg-slate-800 text-amber-400 border border-amber-500/30 hover:bg-slate-700'
                            : 'bg-amber-500 hover:bg-amber-400 text-slate-950 active:scale-95'
                        }`}
                      >
                        {isActive ? 'Continue Editing' : 'Open Project'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
