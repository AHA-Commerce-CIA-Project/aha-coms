import { create } from 'zustand';
import { Task, Project, User, ProjectTemplate, TaskStatus, TaskPriority } from './types';
import { mockUsers, mockProjects, mockTasks, mockTemplates } from './mock-data';

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
    viewMode: 'kanban' | 'table';

    // Actions
    setSelectedProject: (id: string | null) => void;
    setSelectedTask: (id: string | null) => void;
    toggleSidebar: () => void;
    setViewMode: (mode: 'kanban' | 'table') => void;

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
    sidebarOpen: true,
    viewMode: 'kanban',

    // UI Actions
    setSelectedProject: (id) => set({ selectedProjectId: id }),
    setSelectedTask: (id) => set({ selectedTaskId: id }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setViewMode: (mode) => set({ viewMode: mode }),

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
