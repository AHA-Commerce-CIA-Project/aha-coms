-- ============================================================
-- ROW-LEVEL SECURITY
-- ============================================================
-- Session variables set per request by middleware:
--   SET LOCAL app.current_user_id = '<uuid>';
--   SET LOCAL app.current_branch_id = '<uuid>';
--   SET LOCAL app.current_role = 'hr';
--   SET LOCAL app.current_team_id = '<uuid>';

-- Enable RLS on 11 tables
ALTER TABLE achievement_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE point_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;

-- ── rewards ──────────────────────────────────────────────────
CREATE POLICY rewards_select ON rewards
    FOR SELECT
    USING (
        branch_id IS NULL
        OR current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY rewards_manage ON rewards
    FOR ALL
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr')
    );

-- ── achievement_points ──────────────────────────────────────
CREATE POLICY ap_branch_isolation ON achievement_points
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY ap_select ON achievement_points
    FOR SELECT
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr', 'leader')
        OR user_id = current_setting('app.current_user_id', true)::UUID
    );

CREATE POLICY ap_insert ON achievement_points
    FOR INSERT
    WITH CHECK (
        (current_setting('app.current_role', true) = 'employee'
            AND user_id = current_setting('app.current_user_id', true)::UUID)
        OR current_setting('app.current_role', true) IN ('admin', 'hr', 'leader')
    );

CREATE POLICY ap_update ON achievement_points
    FOR UPDATE
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr')
        OR (current_setting('app.current_role', true) = 'leader'
            AND status = 'pending')
    );

-- ── users ────────────────────────────────────────────────────
CREATE POLICY users_branch_isolation ON users
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY users_select ON users
    FOR SELECT
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr', 'leader')
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY users_update ON users
    FOR UPDATE
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr')
    );

-- ── teams ────────────────────────────────────────────────────
CREATE POLICY teams_branch_isolation ON teams
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

-- ── challenges ───────────────────────────────────────────────
CREATE POLICY challenges_branch_isolation ON challenges
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY challenges_insert ON challenges
    FOR INSERT
    WITH CHECK (
        current_setting('app.current_role', true) IN ('admin', 'leader')
        AND EXISTS (
            SELECT 1 FROM achievement_points ap
            JOIN point_categories pc ON pc.id = ap.category_id
            WHERE ap.id = achievement_id
            AND pc.code = 'PENALTI'
        )
    );

CREATE POLICY challenges_update ON challenges
    FOR UPDATE
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr')
    );

-- ── appeals ──────────────────────────────────────────────────
CREATE POLICY appeals_branch_isolation ON appeals
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY appeals_insert ON appeals
    FOR INSERT
    WITH CHECK (
        appellant_id = current_setting('app.current_user_id', true)::UUID
    );

CREATE POLICY appeals_update ON appeals
    FOR UPDATE
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr')
    );

-- ── comments ─────────────────────────────────────────────────
CREATE POLICY comments_branch_isolation ON comments
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY comments_insert ON comments
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY comments_update ON comments
    FOR UPDATE
    USING (
        author_id = current_setting('app.current_user_id', true)::UUID
    );

-- ── redemptions ──────────────────────────────────────────────
CREATE POLICY redemptions_branch_isolation ON redemptions
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );

CREATE POLICY redemptions_select ON redemptions
    FOR SELECT
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr')
        OR user_id = current_setting('app.current_user_id', true)::UUID
    );

CREATE POLICY redemptions_insert ON redemptions
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY redemptions_update ON redemptions
    FOR UPDATE
    USING (
        current_setting('app.current_role', true) IN ('admin', 'hr')
    );

-- ── notifications ────────────────────────────────────────────
CREATE POLICY notifications_self_only ON notifications
    FOR SELECT
    USING (
        user_id = current_setting('app.current_user_id', true)::UUID
    );

CREATE POLICY notifications_update ON notifications
    FOR UPDATE
    USING (
        user_id = current_setting('app.current_user_id', true)::UUID
    );

-- ── audit_logs (append-only) ─────────────────────────────────
CREATE POLICY audit_insert ON audit_logs
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY audit_select ON audit_logs
    FOR SELECT
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR (current_setting('app.current_role', true) = 'hr'
            AND branch_id = current_setting('app.current_branch_id', true)::UUID)
    );

-- ── point_summaries ──────────────────────────────────────────
CREATE POLICY ps_branch_isolation ON point_summaries
    USING (
        current_setting('app.current_role', true) = 'admin'
        OR branch_id = current_setting('app.current_branch_id', true)::UUID
    );
