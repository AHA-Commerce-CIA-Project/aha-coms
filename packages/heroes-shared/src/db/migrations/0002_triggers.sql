-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Apply to all tables with updated_at column
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON achievement_points FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON challenges FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON appeals FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON rewards FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON redemptions FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_updated_at BEFORE UPDATE ON system_settings FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ============================================================
-- TRIGGER: Sync point_summaries on achievement_points changes
-- ============================================================
CREATE OR REPLACE FUNCTION fn_sync_point_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO point_summaries (branch_id, user_id, bintang_count, penalti_points_sum, direct_poin_aha)
    SELECT
        u.branch_id,
        u.id,
        COALESCE(COUNT(*) FILTER (WHERE pc.code = 'BINTANG' AND ap.status = 'active'), 0),
        COALESCE(SUM(ap.points) FILTER (WHERE pc.code = 'PENALTI' AND ap.status IN ('active', 'challenged')), 0),
        COALESCE(SUM(ap.points) FILTER (WHERE pc.code = 'POIN_AHA' AND ap.status = 'active'), 0)
    FROM users u
    LEFT JOIN achievement_points ap ON ap.user_id = u.id
    LEFT JOIN point_categories pc ON pc.id = ap.category_id
    WHERE u.id = COALESCE(NEW.user_id, OLD.user_id)
    GROUP BY u.branch_id, u.id
    ON CONFLICT (user_id)
    DO UPDATE SET
        bintang_count       = EXCLUDED.bintang_count,
        penalti_points_sum  = EXCLUDED.penalti_points_sum,
        direct_poin_aha     = EXCLUDED.direct_poin_aha,
        updated_at          = now();

    RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_sync_point_summary
    AFTER INSERT OR UPDATE OF status OR DELETE
    ON achievement_points
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_point_summary();

-- ============================================================
-- TRIGGER: Sync redeemed_total on redemption approval
-- ============================================================
CREATE OR REPLACE FUNCTION fn_sync_redeemed_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE point_summaries
    SET redeemed_total = (
        SELECT COALESCE(SUM(points_spent), 0)
        FROM redemptions
        WHERE user_id = NEW.user_id AND status = 'approved'
    ),
    updated_at = now()
    WHERE user_id = NEW.user_id;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_redeemed_total
    AFTER UPDATE OF status
    ON redemptions
    FOR EACH ROW
    WHEN (NEW.status = 'approved')
    EXECUTE FUNCTION fn_sync_redeemed_total();
