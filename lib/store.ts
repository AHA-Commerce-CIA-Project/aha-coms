import { create } from 'zustand';
import { Task, Project, User, ProjectTemplate, TaskStatus, TaskPriority } from './types';
import { mockUsers, mockProjects, mockTasks, mockTemplates } from './mock-data';
import type { UserProfile } from './user-profile-types';

// Shape consumed by &lt;ChannelHeader&gt; when rendered inline in the workspace's
// top tab row. Callbacks should be useCallback-stabilised by the publisher
// (ChannelPane) so MessagesWorkspace doesn't re-render on every keystroke.
export interface ChatHeaderState {
    name: string;
    description: string | null;
    isPrivate?: boolean;
    memberCount?: number;
    channelId: string;
    purpose?: string;
    isCreator: boolean;
    isPinnedForUser?: boolean;
    searchQuery: string;
    searching: boolean;
    onSearchChange: (q: string) => void;
    onDelete?: () => void;
    onEdit?: () => void;
    onDirectAssign?: () => void;
    onPinChannel?: () => void;
    onBack?: () => void;
}

interface AppState {
    // Data
    users: User[];
    projects: Project[];
    tasks: Task[];
    templates: ProjectTemplate[];

    // UI State
    selectedProjectId: string | null;
    selectedTaskId: string | null;
    sidebarOpen: boolean;
    sidebarHovered: boolean;
    viewMode: 'kanban' | 'table';
    directAssignOpen: boolean;
    // Optional channel to pre-select when opening the Direct Assign modal — set
    // from the channel header so the user doesn't have to pick it again.
    directAssignChannelId: string | null;
    // "Convert message → task" mode: when set, the modal pre-fills its
    // description/attachments from a channel message and submits to the
    // /direct-assign-from-message endpoint, which transforms the original
    // message in place into a card.
    directAssignSourceMessageId: string | null;
    directAssignDefaultDescription: string;
    directAssignDefaultImages: { url: string; preview: string }[];
    directAssignDefaultFileUrls: string[];
    // /req slash-command flow: start the modal at the Review step (skipping
    // request-details + priority wizard pages) and hand the description back
    // to the composer when the user dismisses without submitting.
    directAssignStartAtReview: boolean;
    directAssignOnCancel: ((description: string) => void) | null;
    // Counter that bumps every time a Direct Assign submit succeeds. Channels
    // page subscribes so it can refetch the feed and show the in-place card.
    directAssignSubmittedTick: number;
    // Counter that bumps every time the user pins/unpins a channel. The
    // /messages workspace subscribes so it can refetch its channels list and
    // refresh the sidebar's Pinned section right away.
    channelPinTick: number;
    // The single source of truth for the right-side profile panel. When non-null
    // the panel is mounted in AppShell and the page reflows to leave room for it.
    profileUser: UserProfile | null;
    // When true, the profile panel shows the "Add people to this conversation"
    // CTA. Set this from the DM page where promoting a 1:1 to a group makes sense.
    profileShowAddToConversation: boolean;
    // When true, hide the "Send Direct Message" CTA — set when the panel is
    // opened for the same person the viewer is currently chatting with, since
    // the button would just navigate them to the conversation they're already in.
    profileHideSendDm: boolean;

    // Channel header data + actions published by ChannelPane so the unified
    // /messages workspace can render the channel info (name, members, search,
    // kebab) inline next to its Messages | Later tabs — replaces the old
    // standalone header row that wasted a full vertical band of screen space.
    // ChannelPane sets this whenever a channel is selected and clears it on
    // unmount/deselect; MessagesWorkspace reads it and renders &lt;ChannelHeader&gt;.
    chatHeader: ChatHeaderState | null;

    // Actions
    setSelectedProject: (id: string | null) => void;
    setSelectedTask: (id: string | null) => void;
    toggleSidebar: () => void;
    setSidebarHovered: (hovered: boolean) => void;
    setViewMode: (mode: 'kanban' | 'table') => void;
    setDirectAssignOpen: (open: boolean, opts?: {
        channelId?: string | null;
        sourceMessageId?: string | null;
        defaultDescription?: string;
        defaultImages?: { url: string; preview: string }[];
        defaultFileUrls?: string[];
        startAtReview?: boolean;
        onCancel?: (description: string) => void;
    }) => void;
    notifyDirectAssignSubmitted: () => void;
    notifyChannelPinned: () => void;
    setProfileUser: (user: UserProfile | null, opts?: { showAddToConversation?: boolean; hideSendDm?: boolean }) => void;
    setChatHeader: (state: ChatHeaderState | null) => void;

    // Task Actions
    addTask: (task: Omit<Task, 'id' | 'createdAt'>) => void;
    updateTask: (id: string, updates: Partial<Task>) => void;
    deleteTask: (id: string) => void;
    moveTask: (taskId: string, newStatus: TaskStatus) => void;
    bulkUpdateTasks: (taskIds: string[], updates: Partial<Task>) => void;

    // Project Actions
    addProject: (project: Omit<Project, 'id' | 'createdAt'>) => void;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    createProjectFromTemplate: (templateId: string, projectName: string, deadline: string | null) => void;

    // Computed
    getTasksByProject: (projectId: string) => Task[];
    getTasksByStatus: (projectId: string, status: TaskStatus) => Task[];
    getProjectProgress: (projectId: string) => number;
    getCompletedTasksThisWeek: () => Task[];
    generateWeeklySummary: () => string;
}

const generateId = () => Math.random().toString(36).substring(2, 11);

export const useAppStore = create<AppState>((set, get) => ({
    // Initial Data
    users: mockUsers,
    projects: mockProjects,
    tasks: mockTasks,
    templates: mockTemplates,

    // Initial UI State
    selectedProjectId: null,
    selectedTaskId: null,
    // Collapsed by default — sidebar auto-expands on hover; the toggle pins it open.
    sidebarOpen: false,
    sidebarHovered: false,
    viewMode: 'kanban',
    directAssignOpen: false,
    directAssignChannelId: null,
    directAssignSourceMessageId: null,
    directAssignDefaultDescription: '',
    directAssignDefaultImages: [],
    directAssignDefaultFileUrls: [],
    directAssignStartAtReview: false,
    directAssignOnCancel: null,
    directAssignSubmittedTick: 0,
    channelPinTick: 0,
    profileUser: null,
    profileShowAddToConversation: false,
    profileHideSendDm: false,
    chatHeader: null,

    // UI Actions
    setSelectedProject: (id) => set({ selectedProjectId: id }),
    setSelectedTask: (id) => set({ selectedTaskId: id }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarHovered: (hovered) => set({ sidebarHovered: hovered }),
    setViewMode: (mode) => set({ viewMode: mode }),
    setDirectAssignOpen: (open, opts) => set({
        directAssignOpen: open,
        directAssignChannelId: open ? (opts?.channelId ?? null) : null,
        directAssignSourceMessageId: open ? (opts?.sourceMessageId ?? null) : null,
        directAssignDefaultDescription: open ? (opts?.defaultDescription ?? '') : '',
        directAssignDefaultImages: open ? (opts?.defaultImages ?? []) : [],
        directAssignDefaultFileUrls: open ? (opts?.defaultFileUrls ?? []) : [],
        directAssignStartAtReview: open ? !!opts?.startAtReview : false,
        directAssignOnCancel: open ? (opts?.onCancel ?? null) : null,
    }),
    notifyDirectAssignSubmitted: () => set((s) => ({ directAssignSubmittedTick: s.directAssignSubmittedTick + 1 })),
    notifyChannelPinned: () => set((s) => ({ channelPinTick: s.channelPinTick + 1 })),
    setProfileUser: (user, opts) => set({
        profileUser: user,
        profileShowAddToConversation: user ? !!opts?.showAddToConversation : false,
        profileHideSendDm: user ? !!opts?.hideSendDm : false,
    }),
    setChatHeader: (state) => set({ chatHeader: state }),

    // Task Actions
    addTask: (taskData) => set((state) => ({
        tasks: [...state.tasks, {
            ...taskData,
            id: `task-${generateId()}`,
            createdAt: new Date().toISOString().split('T')[0],
        }],
    })),

    updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
        ),
    })),

    deleteTask: (id) => set((state) => ({
        tasks: state.tasks.filter((task) => task.id !== id),
    })),

    moveTask: (taskId, newStatus) => set((state) => ({
        tasks: state.tasks.map((task) =>
            task.id === taskId
                ? {
                    ...task,
                    status: newStatus,
                    completedAt: newStatus === 'done' ? new Date().toISOString().split('T')[0] : null,
                }
                : task
        ),
    })),

    bulkUpdateTasks: (taskIds, updates) => set((state) => ({
        tasks: state.tasks.map((task) =>
            taskIds.includes(task.id)
                ? {
                    ...task,
                    ...updates,
                    completedAt: updates.status === 'done' ? new Date().toISOString().split('T')[0] : task.completedAt,
                }
                : task
        ),
    })),

    // Project Actions
    addProject: (projectData) => set((state) => ({
        projects: [...state.projects, {
            ...projectData,
            id: `proj-${generateId()}`,
            createdAt: new Date().toISOString().split('T')[0],
        }],
    })),

    updateProject: (id, updates) => set((state) => ({
        projects: state.projects.map((project) =>
            project.id === id ? { ...project, ...updates } : project
        ),
    })),

    deleteProject: (id) => set((state) => ({
        projects: state.projects.filter((project) => project.id !== id),
        tasks: state.tasks.filter((task) => task.projectId !== id),
    })),

    createProjectFromTemplate: (templateId, projectName, deadline) => {
        const template = get().templates.find((t) => t.id === templateId);
        if (!template) return;

        const projectId = `proj-${generateId()}`;
        const newProject: Project = {
            id: projectId,
            name: projectName,
            description: template.description,
            status: 'active',
            deadline,
            createdAt: new Date().toISOString().split('T')[0],
            color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`,
        };

        const newTasks: Task[] = template.tasks.map((taskTemplate) => ({
            ...taskTemplate,
            id: `task-${generateId()}`,
            projectId,
            createdAt: new Date().toISOString().split('T')[0],
            completedAt: null,
        }));

        set((state) => ({
            projects: [...state.projects, newProject],
            tasks: [...state.tasks, ...newTasks],
            selectedProjectId: projectId,
        }));
    },

    // Computed Values
    getTasksByProject: (projectId) => {
        return get().tasks.filter((task) => task.projectId === projectId);
    },

    getTasksByStatus: (projectId, status) => {
        return get().tasks.filter(
            (task) => task.projectId === projectId && task.status === status
        );
    },

    getProjectProgress: (projectId) => {
        const projectTasks = get().tasks.filter((task) => task.projectId === projectId);
        if (projectTasks.length === 0) return 0;
        const completedTasks = projectTasks.filter((task) => task.status === 'done');
        return Math.round((completedTasks.length / projectTasks.length) * 100);
    },

    getCompletedTasksThisWeek: () => {
        const today = new Date();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        weekStart.setHours(0, 0, 0, 0);

        return get().tasks.filter((task) => {
            if (!task.completedAt) return false;
            const completedDate = new Date(task.completedAt);
            return completedDate >= weekStart && task.status === 'done';
        });
    },

    generateWeeklySummary: () => {
        const completedTasks = get().getCompletedTasksThisWeek();
        const projects = get().projects;
        const users = get().users;

        if (completedTasks.length === 0) {
            return 'No tasks were completed this week.';
        }

        // Group tasks by project
        const tasksByProject: Record<string, Task[]> = {};
        completedTasks.forEach((task) => {
            if (!tasksByProject[task.projectId]) {
                tasksByProject[task.projectId] = [];
            }
            tasksByProject[task.projectId].push(task);
        });

        let summary = `## Weekly Progress Report\n\n`;
        summary += `**Period:** ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}\n`;
        summary += `**Total Completed Tasks:** ${completedTasks.length}\n\n`;
        summary += `---\n\n`;

        Object.entries(tasksByProject).forEach(([projectId, tasks]) => {
            const project = projects.find((p) => p.id === projectId);
            if (!project) return;

            summary += `### ${project.name}\n\n`;
            tasks.forEach((task) => {
                const assignee = users.find((u) => u.id === task.assigneeId);
                summary += `- ✅ **${task.title}**`;
                if (assignee) {
                    summary += ` (${assignee.name})`;
                }
                summary += `\n`;
            });
            summary += `\n`;
        });

        return summary;
    },
}));
