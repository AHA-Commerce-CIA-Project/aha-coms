// Types for AHA Smart-Tracker

export type TaskStatus = 'todo' | 'in-progress' | 'review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly';
export type ProjectStatus = 'active' | 'on-hold' | 'completed' | 'archived';
export type UserRole = 'admin' | 'manager' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigneeId: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  isRecurring: boolean;
  recurrence: RecurrenceType;
  projectId: string;
  createdAt: string;
  completedAt: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  deadline: string | null;
  createdAt: string;
  color: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  tasks: Omit<Task, 'id' | 'projectId' | 'createdAt' | 'completedAt'>[];
}

export interface KanbanColumn {
  id: TaskStatus;
  title: string;
}

export const KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'To Do' },
  { id: 'in-progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
];

export const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'bg-slate-500',
  medium: 'bg-amber-500',
  high: 'bg-rose-500',
};

export const STATUS_COLORS: Record<TaskStatus, string> = {
  'todo': 'bg-slate-500',
  'in-progress': 'bg-blue-500',
  'review': 'bg-purple-500',
  'done': 'bg-emerald-500',
};
