-- FBI Smart Tracker Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Teams table
CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('leader', 'member')),
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'on-hold', 'completed', 'archived')),
    deadline DATE,
    color VARCHAR(7) DEFAULT '#6366f1',
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    google_sheet_sync_id VARCHAR(255), -- For Google Sheets Integration
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks table
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'todo' CHECK (status IN ('todo', 'in-progress', 'review', 'done', 'pending_completion_details')),
    priority VARCHAR(10) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    
    -- Ticketing System Fields
    requester_name VARCHAR(255),
    requester_email VARCHAR(255),
    requester_division VARCHAR(255),
    urgency VARCHAR(50) CHECK (urgency IN ('P1', 'P2', 'P3', 'P4', '5-minute')),
    attachments JSONB DEFAULT '[]'::JSONB,
    custom_fields JSONB DEFAULT '{}'::JSONB,

    -- Completion Workflow Fields
    difficulty_score INTEGER CHECK (difficulty_score >= 1 AND difficulty_score <= 10),
    feedback_notes TEXT,

    due_date DATE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE, -- Made optional for raw tickets
    assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    notes TEXT,
    is_recurring BOOLEAN DEFAULT FALSE,
    recurrence_type VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Notifications table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('task_assigned', 'task_updated', 'reminder', 'mention')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    read BOOLEAN DEFAULT FALSE,
    data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS) Policies
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own team's data
CREATE POLICY "Users can view their team" ON teams
    FOR SELECT USING (
        id IN (SELECT team_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY "Users can view team members" ON users
    FOR SELECT USING (
        team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (id = auth.uid());

CREATE POLICY "Users can view team projects" ON projects
    FOR SELECT USING (
        team_id IN (SELECT team_id FROM users WHERE id = auth.uid())
    );

CREATE POLICY "Leaders can manage projects" ON projects
    FOR ALL USING (
        team_id IN (SELECT team_id FROM users WHERE id = auth.uid() AND role = 'leader')
    );

CREATE POLICY "Users can view team tasks" ON tasks
    FOR SELECT USING (
        project_id IN (
            SELECT id FROM projects WHERE team_id IN (
                SELECT team_id FROM users WHERE id = auth.uid()
            )
        )
    );

CREATE POLICY "Members can update their assigned tasks" ON tasks
    FOR UPDATE USING (
        assignee_id = auth.uid()
        OR project_id IN (
            SELECT id FROM projects WHERE team_id IN (
                SELECT team_id FROM users WHERE id = auth.uid() AND role = 'leader'
            )
        )
    );

CREATE POLICY "Leaders can manage tasks" ON tasks
    FOR ALL USING (
        project_id IN (
            SELECT id FROM projects WHERE team_id IN (
                SELECT team_id FROM users WHERE id = auth.uid() AND role = 'leader'
            )
        )
    );

CREATE POLICY "Users can view own notifications" ON notifications
    FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications" ON notifications
    FOR UPDATE USING (user_id = auth.uid());

-- Indexes for better performance
CREATE INDEX idx_users_team ON users(team_id);
CREATE INDEX idx_projects_team ON projects(team_id);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO users (id, email, name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Insert default team for testing
INSERT INTO teams (id, name) VALUES 
    ('00000000-0000-0000-0000-000000000001', 'Factual Business Intelligence (FBI)');

-- Note: After running this, users will need to be assigned to the team via admin panel
-- or you can update users set team_id = '00000000-0000-0000-0000-000000000001' where...
