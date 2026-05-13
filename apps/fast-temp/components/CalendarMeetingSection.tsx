'use client';

// Full calendar + meetings widget. Originally lived inline at the bottom of
// app/tasks/page.tsx; lifted to a shared component so the dashboard
// (app/fast/page.tsx) can mount it as the primary block while /tasks gives
// the freed-up space back to the Notes grid.

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { sanitizeMeetingDescription } from '@/lib/sanitize';
import { RichEditor } from '@/components/RichEditor';
import {
    Calendar as CalendarIcon, CheckCircle2, X, Plus, ChevronLeft, ChevronRight,
    Pencil, Trash2, Users, Bell, UserPlus, UserMinus, ExternalLink, FileText,
} from 'lucide-react';

interface MeetingGuest {
    id: string;
    name: string;
}

interface Meeting {
    id: string;
    title: string;
    description: string | null;
    meeting_date: string;
    start_time: string;
    end_time: string;
    created_by: string;
    assigned_to: string;
    source: string;
    status: string;
    created_at: string;
    notify_before: number;
    creator?: { name: string } | null;
    assignee?: { name: string } | null;
    guests: MeetingGuest[];
    meeting_link?: string | null;
    organizer_name?: string | null;
    organizer_email?: string | null;
}

export function CalendarMeetingSection() {
    const { user, profile, isLeader } = useAuth();
    const [meetings, setMeetings] = useState<Meeting[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentMonth, setCurrentMonth] = useState(() => {
        const now = new Date();
        return { year: now.getFullYear(), month: now.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
    const [weekStart, setWeekStart] = useState<Date>(() => {
        const now = new Date();
        const day = now.getDay();
        const diff = day === 0 ? -6 : 1 - day; // Monday
        const monday = new Date(now);
        monday.setDate(now.getDate() + diff);
        monday.setHours(0, 0, 0, 0);
        return monday;
    });
    const [dayViewDate, setDayViewDate] = useState<Date>(() => new Date());
    const [showAddModal, setShowAddModal] = useState(false);
    const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
    const [detailMeeting, setDetailMeeting] = useState<Meeting | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [addGuestId, setAddGuestId] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);
    const [pendingNotifyBefore, setPendingNotifyBefore] = useState<number | null>(null);
    const [notifyConfirmed, setNotifyConfirmed] = useState(false);

    // Google Calendar integration
    const [gcalConnected, setGcalConnected] = useState(false);
    const [gcalDisconnecting, setGcalDisconnecting] = useState(false);
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    const [gcalEvents, setGcalEvents] = useState<any[]>([]);
    const [gcalLoading, setGcalLoading] = useState(false);
    const [gcalConnecting, setGcalConnecting] = useState(false);

    // Teammate Subscriptions
    const [subscribedUsers, setSubscribedUsers] = useState<string[]>([]);
    const [showSubscribeDropdown, setShowSubscribeDropdown] = useState(false);

    const [form, setForm] = useState({
        title: '',
        description: '',
        meetingDate: '',
        startTime: '09:00',
        endTime: '10:00',
        assignedTo: '',
        source: 'member',
    });

    const [editForm, setEditForm] = useState({
        title: '',
        description: '',
        meetingDate: '',
        startTime: '',
        endTime: '',
        notifyBefore: 0,
    });

    useEffect(() => {
        fetchMeetings();
        fetchMembers();
        checkGcalStatus();
    }, [currentMonth, user, subscribedUsers]);

    const checkGcalStatus = async () => {
        try {
            const res = await fetch('/api/google-calendar');
            if (res.ok) {
                const json = await res.json();
                const connected = json.data?.connected ?? json.connected;
                setGcalConnected(connected);
                if (connected) fetchGcalEvents();
            }
        } catch { }
    };

    const fetchGcalEvents = async () => {
        setGcalLoading(true);
        try {
            let url = `/api/google-calendar?action=events&year=${currentMonth.year}&month=${currentMonth.month}`;
            if (subscribedUsers.length > 0 && user) {
                url += `&userIds=${[user.id, ...subscribedUsers].join(',')}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                const events = json.data?.events ?? json.events ?? [];
                setGcalEvents(events);
            }
        } catch { }
        setGcalLoading(false);
    };

    // Handle URL search params for deep-linking from notifications
    const searchParams = useSearchParams();
    useEffect(() => {
        const dateParam = searchParams.get('date');
        const meetingIdParam = searchParams.get('meetingId');

        if (dateParam && meetings.length > 0) {
            // Parse the date to set the right month
            const [y, m] = dateParam.split('-').map(Number);
            setCurrentMonth({ year: y, month: m - 1 });
            setSelectedDate(dateParam);

            // If meetingId param, auto-open the meeting detail
            if (meetingIdParam) {
                const meeting = meetings.find(mt => mt.id === meetingIdParam);
                if (meeting) openDetail(meeting);
            }

            // Clear the params so they don't re-trigger
            window.history.replaceState({}, '', '/tasks');
        }
    }, [searchParams, meetings]);

    const getAuthHeaders = async () => {
        return {} as Record<string, string>;
    };

    const fetchMeetings = async () => {
        setLoading(true);
        try {
            const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}`;
            let url = `/api/meetings?month=${monthStr}`;
            if (subscribedUsers.length > 0 && user) {
                url += `&userIds=${[user.id, ...subscribedUsers].join(',')}`;
            }
            const res = await fetch(url);
            if (res.ok) {
                const json = await res.json();
                setMeetings(json.data ?? json);
            }
        } catch (err) {
            console.error('Error fetching meetings:', err);
        }
        setLoading(false);
    };

    const fetchMembers = async () => {
        try {
            const res = await fetch('/api/teammates');
            if (res.ok) {
                const data = await res.json();
                setTeamMembers(data.map((u: any) => ({ id: u.id, name: u.name })));
            }
        } catch { }
    };

    const handleAddMeeting = async () => {
        if (!form.title || !form.meetingDate || !form.startTime || !form.endTime) return;
        try {
            const res = await fetch('/api/meetings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: form.title,
                    description: form.description || null,
                    meetingDate: form.meetingDate,
                    startTime: form.startTime,
                    endTime: form.endTime,
                    assignedTo: form.assignedTo || user?.id,
                    source: isLeader ? 'leader' : form.source,
                }),
            });
            if (res.ok) {
                await fetchMeetings();
                setShowAddModal(false);
                resetForm();
            }
        } catch (err) {
            console.error('Error creating meeting:', err);
        }
    };

    const handleConnectGoogleCalendar = async () => {
        setGcalConnecting(true);
        try {
            const res = await fetch('/api/auth/google');
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    window.location.href = data.url;
                }
            } else {
                console.error('Failed to get Google Auth URL', await res.text());
                setGcalConnecting(false);
            }
        } catch (err) {
            console.error('Error connecting Google Calendar:', err);
            setGcalConnecting(false);
        }
    };

    const handleDisconnectGoogleCalendar = async () => {
        setShowDisconnectModal(false);
        setGcalDisconnecting(true);
        try {
            const res = await fetch('/api/auth/google/disconnect', { method: 'POST' });
            if (res.ok) {
                setGcalConnected(false);
                setGcalEvents([]);
            }
        } catch (err) {
            console.error('Error disconnecting Google Calendar:', err);
        } finally {
            setGcalDisconnecting(false);
        }
    };

    const handleDeleteMeeting = async (id: string) => {
        try {
            await fetch(`/api/meetings/${id}`, { method: 'DELETE' });
            await fetchMeetings();
        } catch (err) {
            console.error('Error deleting meeting:', err);
        }
    };

    const handleApproveMeeting = async (id: string) => {
        try {
            await fetch(`/api/meetings/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'confirmed' }),
            });
            await fetchMeetings();
        } catch (err) {
            console.error('Error approving meeting:', err);
        }
    };

    const resetForm = () => {
        setForm({ title: '', description: '', meetingDate: '', startTime: '09:00', endTime: '10:00', assignedTo: '', source: 'member' });
    };

    const openAddForDate = (dateStr: string) => {
        resetForm();
        setForm(f => ({ ...f, meetingDate: dateStr }));
        setShowAddModal(true);
    };

    const openDetail = (m: Meeting) => {
        setDetailMeeting(m);
        setIsEditing(false);
        setPendingNotifyBefore(null);
        setNotifyConfirmed(false);
        setEditForm({
            title: m.title,
            description: m.description || '',
            meetingDate: m.meeting_date,
            startTime: m.start_time.slice(0, 5),
            endTime: m.end_time.slice(0, 5),
            notifyBefore: m.notify_before || 0,
        });
    };

    const handleSaveEdit = async () => {
        if (!detailMeeting) return;
        setSavingEdit(true);
        try {
            const res = await fetch(`/api/meetings/${detailMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                await fetchMeetings();
                setDetailMeeting(null);
                setIsEditing(false);
            }
        } catch (err) {
            console.error('Error updating meeting:', err);
        }
        setSavingEdit(false);
    };

    const handleAddGuest = async () => {
        if (!detailMeeting || !addGuestId) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}/guests`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: addGuestId }),
            });
            await fetchMeetings();
            // Update detail meeting guests locally
            const member = teamMembers.find(m => m.id === addGuestId);
            if (member) {
                setDetailMeeting(prev => prev ? { ...prev, guests: [...prev.guests, member] } : prev);
            }
            setAddGuestId('');
        } catch (err) {
            console.error('Error adding guest:', err);
        }
    };

    const handleRemoveGuest = async (guestUserId: string) => {
        if (!detailMeeting) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}/guests?userId=${guestUserId}`, {
                method: 'DELETE',
            });
            await fetchMeetings();
            setDetailMeeting(prev => prev ? { ...prev, guests: prev.guests.filter(g => g.id !== guestUserId) } : prev);
        } catch (err) {
            console.error('Error removing guest:', err);
        }
    };

    const handleSetNotification = async (minutes: number) => {
        if (!detailMeeting) return;
        try {
            await fetch(`/api/meetings/${detailMeeting.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notifyBefore: minutes }),
            });
            setDetailMeeting(prev => prev ? { ...prev, notify_before: minutes } : prev);
            await fetchMeetings();
        } catch (err) {
            console.error('Error setting notification:', err);
        }
    };

    // Calendar grid helpers
    const daysInMonth = new Date(currentMonth.year, currentMonth.month + 1, 0).getDate();
    const firstDayOfWeek = new Date(currentMonth.year, currentMonth.month, 1).getDay();
    const monthName = new Date(currentMonth.year, currentMonth.month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const prevMonth = () => setCurrentMonth(m => m.month === 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: m.month - 1 });
    const nextMonth = () => setCurrentMonth(m => m.month === 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: m.month + 1 });

    const getMeetingsForDate = (dateStr: string) => {
        const localMeetings = meetings.filter(m => m.meeting_date === dateStr);
        const googleMeetings = gcalEvents.filter(e => e.meeting_date === dateStr);
        return [...localMeetings, ...googleMeetings];
    };

    const selectedMeetings = selectedDate ? getMeetingsForDate(selectedDate) : [];

    const formatTime = (t: string) => {
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${hour % 12 || 12}:${m} ${ampm}`;
    };

    // High-contrast palette so "you" stands out from teammates and teammates
    // are visually distinct from each other. The current user gets the dark
    // brand color; teammates rotate through saturated accent colors.
    //
    // Pending uses yellow (not amber) so it never collides with a teammate
    // whose rotation slot lands on amber.
    const SELF_COLOR = { bg: 'bg-slate-900/15', text: 'text-slate-900', dot: 'bg-slate-900', name: 'self' };
    const PENDING_COLOR = { bg: 'bg-yellow-400/15', text: 'text-yellow-700', dot: 'bg-yellow-400', name: 'pending' };

    const teammateColorPalette = [
        { bg: 'bg-emerald-500/20', text: 'text-emerald-700', dot: 'bg-emerald-500', name: 'emerald' },
        { bg: 'bg-amber-500/20', text: 'text-amber-700', dot: 'bg-amber-500', name: 'amber' },
        { bg: 'bg-rose-500/20', text: 'text-rose-700', dot: 'bg-rose-500', name: 'rose' },
        { bg: 'bg-cyan-500/20', text: 'text-cyan-700', dot: 'bg-cyan-500', name: 'cyan' },
        { bg: 'bg-violet-500/20', text: 'text-violet-700', dot: 'bg-violet-500', name: 'violet' },
        { bg: 'bg-fuchsia-500/20', text: 'text-fuchsia-700', dot: 'bg-fuchsia-500', name: 'fuchsia' },
        { bg: 'bg-orange-500/20', text: 'text-orange-700', dot: 'bg-orange-500', name: 'orange' },
        { bg: 'bg-teal-500/20', text: 'text-teal-700', dot: 'bg-teal-500', name: 'teal' },
    ];

    // All users displayed in calendar = current user + followed teammates.
    // Self always maps to SELF_COLOR; teammates rotate through the palette
    // independently of the user's slot.
    const calendarUserIds = user ? [user.id, ...subscribedUsers] : subscribedUsers;
    const userColorMap: Record<string, { bg: string; text: string; dot: string; name: string }> = {};
    let teammateIdx = 0;
    calendarUserIds.forEach(uid => {
        if (user && uid === user.id) {
            userColorMap[uid] = SELF_COLOR;
        } else {
            userColorMap[uid] = teammateColorPalette[teammateIdx % teammateColorPalette.length];
            teammateIdx += 1;
        }
    });

    const getMeetingTheme = (m: any) => {
        if (m.status === 'pending') return PENDING_COLOR;

        // Color by the meeting owner (creator or assignee), prefer one in followed list
        const ownerId = (calendarUserIds.includes(m.assigned_to) ? m.assigned_to : null)
            || (calendarUserIds.includes(m.created_by) ? m.created_by : null)
            || (calendarUserIds.includes(m.owner_id) ? m.owner_id : null)
            || m.assigned_to || m.created_by || m.owner_id;

        if (ownerId && userColorMap[ownerId]) return userColorMap[ownerId];
        return { bg: 'bg-slate-200/60', text: 'text-slate-600', dot: 'bg-slate-400', name: 'slate' };
    };

    // Build the legend (followed users + current user + pending)
    const legendUsers = [
        ...(user ? [{ id: user.id, name: user.name || 'You', isCurrent: true }] : []),
        ...subscribedUsers.map(uid => {
            const member = teamMembers.find(m => m.id === uid);
            return { id: uid, name: member?.name || 'Unknown', isCurrent: false };
        }),
    ];

    // Helper: get pastel/filled version of theme color for week/day blocks.
    // The "self" entry is intentionally a solid dark block with white text so
    // your own events read as primary against the lighter teammate blocks.
    const getPastelStyle = (m: any): { bg: string; border: string; text: string } => {
        const theme = getMeetingTheme(m);
        const pastelMap: Record<string, { bg: string; border: string; text: string }> = {
            self: { bg: 'bg-slate-900', border: 'border-slate-900', text: 'text-white' },
            emerald: { bg: 'bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-900' },
            amber: { bg: 'bg-amber-100', border: 'border-amber-400', text: 'text-amber-900' },
            rose: { bg: 'bg-rose-100', border: 'border-rose-400', text: 'text-rose-900' },
            cyan: { bg: 'bg-cyan-100', border: 'border-cyan-400', text: 'text-cyan-900' },
            violet: { bg: 'bg-violet-100', border: 'border-violet-400', text: 'text-violet-900' },
            fuchsia: { bg: 'bg-fuchsia-100', border: 'border-fuchsia-400', text: 'text-fuchsia-900' },
            orange: { bg: 'bg-orange-100', border: 'border-orange-400', text: 'text-orange-900' },
            teal: { bg: 'bg-teal-100', border: 'border-teal-400', text: 'text-teal-900' },
            pending: { bg: 'bg-yellow-100', border: 'border-yellow-400 border-dashed', text: 'text-yellow-900' },
            slate: { bg: 'bg-slate-100', border: 'border-slate-300', text: 'text-slate-700' },
        };
        return pastelMap[theme.name] || pastelMap.slate;
    };

    // Week view helpers
    const getWeekDates = (start: Date): Date[] => {
        return Array.from({ length: 7 }, (_, i) => {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            return d;
        });
    };

    const formatDateStr = (d: Date): string => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const weekDates = getWeekDates(weekStart);
    const weekDayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const weekHours = Array.from({ length: 11 }, (_, i) => i + 8); // 8:00 to 18:00

    const dayHours = Array.from({ length: 14 }, (_, i) => i + 7); // 7:00 to 20:00

    const prevWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() - 7);
        setWeekStart(d);
    };
    const nextWeek = () => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + 7);
        setWeekStart(d);
    };

    const prevDay = () => {
        const d = new Date(dayViewDate);
        d.setDate(d.getDate() - 1);
        setDayViewDate(d);
        setSelectedDate(formatDateStr(d));
    };
    const nextDay = () => {
        const d = new Date(dayViewDate);
        d.setDate(d.getDate() + 1);
        setDayViewDate(d);
        setSelectedDate(formatDateStr(d));
    };

    const getTimePosition = (timeStr: string, startHour: number): number => {
        const [h, m] = timeStr.split(':').map(Number);
        return ((h - startHour) + m / 60) * 60; // 60px per hour
    };

    const getBlockHeight = (startTime: string, endTime: string): number => {
        const [sh, sm] = startTime.split(':').map(Number);
        const [eh, em] = endTime.split(':').map(Number);
        const duration = (eh * 60 + em) - (sh * 60 + sm);
        return Math.max((duration / 60) * 60, 20); // min 20px
    };

    // Navigation label
    const getNavigationLabel = () => {
        if (viewMode === 'month') return monthName;
        if (viewMode === 'week') {
            const start = weekDates[0];
            const end = weekDates[6];
            const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `${startStr} - ${endStr}`;
        }
        return dayViewDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    };

    const handlePrev = () => {
        if (viewMode === 'month') prevMonth();
        else if (viewMode === 'week') prevWeek();
        else prevDay();
    };

    const handleNext = () => {
        if (viewMode === 'month') nextMonth();
        else if (viewMode === 'week') nextWeek();
        else nextDay();
    };

    return (
        <>
            <hr className="border-slate-200" />
            <div>
                <div className="flex justify-center mb-6">
                    <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                        <CalendarIcon className="w-5 h-5 text-indigo-400" />
                        Calendar Meeting
                    </h2>
                </div>
                {/* Buttons — hidden here, shown below calendar */}
                <div className="hidden">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button
                                onClick={() => setShowSubscribeDropdown(!showSubscribeDropdown)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                Follow Teammates
                                {subscribedUsers.length > 0 && (
                                    <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs font-bold">
                                        {subscribedUsers.length}
                                    </span>
                                )}
                            </button>

                            {showSubscribeDropdown && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowSubscribeDropdown(false)}></div>
                                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                                        <div className="p-3 border-b border-slate-100 bg-slate-50">
                                            <h3 className="text-sm font-semibold text-slate-800">Overlay Calendars</h3>
                                            <p className="text-xs text-slate-500 mt-0.5">See events and meetings from others</p>
                                        </div>
                                        <div className="max-h-60 overflow-y-auto p-2">
                                            {teamMembers.filter(m => m.id !== user?.id).map(member => (
                                                <label key={member.id} className="flex items-center gap-3 p-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-600"
                                                        checked={subscribedUsers.includes(member.id)}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSubscribedUsers([...subscribedUsers, member.id]);
                                                            } else {
                                                                setSubscribedUsers(subscribedUsers.filter(id => id !== member.id));
                                                            }
                                                        }}
                                                    />
                                                    <span className="text-sm text-slate-700 font-medium">{member.name}</span>
                                                </label>
                                            ))}
                                            {teamMembers.length <= 1 && (
                                                <div className="p-3 text-center text-sm text-slate-500">No other team members found</div>
                                            )}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {gcalConnected ? (
                            <button
                                onClick={() => setShowDisconnectModal(true)}
                                disabled={gcalDisconnecting}
                                className="group flex items-center gap-2 px-6 py-2.5 bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-600 text-sm font-semibold rounded-full border border-emerald-200 hover:border-rose-200 transition-all disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-4 h-4 group-hover:hidden" />
                                <X className="w-4 h-4 hidden group-hover:block" />
                                <span className="group-hover:hidden">{gcalDisconnecting ? 'Disconnecting...' : 'Google Calendar Connected'}</span>
                                <span className="hidden group-hover:inline">{gcalDisconnecting ? 'Disconnecting...' : 'Disconnect Calendar'}</span>
                            </button>
                        ) : (
                            <button
                                onClick={handleConnectGoogleCalendar}
                                disabled={gcalConnecting}
                                className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all disabled:opacity-50"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                                {gcalConnecting ? 'Connecting...' : 'Connect Google Calendar'}
                            </button>
                        )}
                        <button
                            onClick={() => { resetForm(); setShowAddModal(true); }}
                            className="px-7 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-md transition-all flex items-center gap-2 text-sm"
                        >
                            <Plus className="w-5 h-5" /> Add Meeting
                        </button>
                    </div>
                </div>

                {/* Navigation + View Toggle */}
                <div className="flex items-center justify-between mb-4">
                    <button onClick={handlePrev} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-4">
                        <h3 className="text-slate-900 font-semibold text-lg">{getNavigationLabel()}</h3>
                        <div className="flex bg-slate-100 rounded-lg p-0.5">
                            {(['month', 'week', 'day'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => {
                                        setViewMode(mode);
                                        if (mode === 'day') {
                                            const d = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
                                            setDayViewDate(d);
                                            setSelectedDate(formatDateStr(d));
                                        }
                                        if (mode === 'week') {
                                            const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
                                            const day = base.getDay();
                                            const diff = day === 0 ? -6 : 1 - day;
                                            const monday = new Date(base);
                                            monday.setDate(base.getDate() + diff);
                                            monday.setHours(0, 0, 0, 0);
                                            setWeekStart(monday);
                                        }
                                    }}
                                    className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all capitalize ${
                                        viewMode === mode
                                            ? 'bg-white text-indigo-700 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>
                    <button onClick={handleNext} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex gap-4 min-w-0">
                    {/* Calendar Grid - conditionally render based on viewMode.
                        min-w-0 + overflow-hidden contain the grid below md so
                        long meeting titles can't push 7 columns wider than the
                        viewport. p-2 on mobile gives more room for cells. */}
                    <div className="flex-1 min-w-0 bg-white shadow-sm border border-slate-200 rounded-2xl p-2 sm:p-4 overflow-hidden">

                        {/* ===== MONTH VIEW ===== */}
                        {viewMode === 'month' && (
                            <>
                                {/* Day headers */}
                                <div className="grid grid-cols-7 border-b border-slate-300">
                                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                        <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2 uppercase tracking-wider">{d}</div>
                                    ))}
                                </div>

                                {/* Calendar cells */}
                                <div className="grid grid-cols-7">
                                    {/* Empty cells for days before the first */}
                                    {Array.from({ length: firstDayOfWeek }, (_, i) => (
                                        <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-slate-100 rounded-sm" />
                                    ))}

                                    {/* Day cells */}
                                    {Array.from({ length: daysInMonth }, (_, i) => {
                                        const day = i + 1;
                                        const dateStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                        const dayMeetings = getMeetingsForDate(dateStr);
                                        const isToday = dateStr === todayStr;
                                        const isSelected = dateStr === selectedDate;

                                        return (
                                            <button
                                                key={day}
                                                onClick={() => setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                                                className={`min-w-0 min-h-[64px] sm:min-h-[100px] p-1 sm:p-1.5 border-b border-r border-slate-100 text-left transition-all flex flex-col rounded-sm overflow-hidden ${
                                                    isSelected
                                                        ? 'bg-indigo-50/80'
                                                        : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-sm mb-1 ${
                                                    isToday
                                                        ? 'bg-indigo-600 text-white font-bold'
                                                        : isSelected
                                                            ? 'text-indigo-700 font-semibold'
                                                            : 'text-slate-600'
                                                }`}>
                                                    {day}
                                                </span>
                                                <div className="flex flex-col gap-1 w-full overflow-hidden mt-1">
                                                    {dayMeetings.slice(0, 3).map((m, idx) => {
                                                        const theme = getMeetingTheme(m);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className="flex items-start gap-1.5 text-[11px] leading-tight truncate"
                                                            >
                                                                <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-[3px] ${theme.dot}`} />
                                                                <span className="truncate text-slate-700">
                                                                    <span className="text-slate-500">{formatTime(m.start_time).replace(' ', '').replace(':00', '').toLowerCase()}</span>
                                                                    {' '}<span className="font-semibold text-slate-800">{m.title}</span>
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                    {dayMeetings.length > 3 && (
                                                        <span className="text-[11px] text-slate-500 font-medium pl-3.5">{dayMeetings.length - 3} more</span>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        {/* ===== WEEK VIEW ===== */}
                        {viewMode === 'week' && (
                            <div className="overflow-auto">
                                {/* Column headers */}
                                <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-slate-200">
                                    <div className="py-2" />
                                    {weekDates.map((d, i) => {
                                        const dateStr = formatDateStr(d);
                                        const isToday = dateStr === todayStr;
                                        return (
                                            <button
                                                key={i}
                                                onClick={() => setSelectedDate(dateStr)}
                                                className={`py-2 text-center transition-colors rounded-t-lg ${
                                                    isToday ? 'bg-indigo-50' : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className={`text-xs font-medium ${isToday ? 'text-indigo-600' : 'text-slate-500'}`}>
                                                    {weekDayNames[i]}
                                                </div>
                                                <div className={`text-lg font-bold mt-0.5 ${
                                                    isToday
                                                        ? 'w-8 h-8 mx-auto rounded-full bg-indigo-600 text-white flex items-center justify-center'
                                                        : 'text-slate-900'
                                                }`}>
                                                    {d.getDate()}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Time grid */}
                                <div className="grid grid-cols-[60px_repeat(7,1fr)] relative" style={{ height: `${weekHours.length * 60}px` }}>
                                    {/* Hour labels */}
                                    {weekHours.map((hour) => (
                                        <div
                                            key={`label-${hour}`}
                                            className="absolute left-0 w-[60px] text-right pr-3 text-xs text-slate-400 font-medium"
                                            style={{ top: `${(hour - 8) * 60}px`, transform: 'translateY(-6px)' }}
                                        >
                                            {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                                        </div>
                                    ))}

                                    {/* Grid lines */}
                                    {weekHours.map((hour) => (
                                        <div
                                            key={`line-${hour}`}
                                            className="absolute left-[60px] right-0 border-t border-slate-100"
                                            style={{ top: `${(hour - 8) * 60}px` }}
                                        />
                                    ))}

                                    {/* Day columns with events */}
                                    {weekDates.map((d, colIndex) => {
                                        const dateStr = formatDateStr(d);
                                        const dayMeetings = getMeetingsForDate(dateStr);
                                        const isToday = dateStr === todayStr;

                                        return (
                                            <div
                                                key={colIndex}
                                                className={`relative border-r border-slate-100 ${isToday ? 'bg-indigo-50/30' : ''}`}
                                                style={{ gridColumn: colIndex + 2, gridRow: 1 }}
                                            >
                                                {dayMeetings.map((m, mIdx) => {
                                                    const top = getTimePosition(m.start_time, 8);
                                                    const height = getBlockHeight(m.start_time, m.end_time);
                                                    const pastel = getPastelStyle(m);

                                                    // Skip if outside visible range
                                                    if (top < 0 || top > weekHours.length * 60) return null;

                                                    return (
                                                        <button
                                                            key={m.id || `wk-${mIdx}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedDate(dateStr);
                                                                openDetail(m);
                                                            }}
                                                            className={`absolute left-0.5 right-0.5 ${pastel.bg} ${pastel.text} ${pastel.border} border rounded-lg px-2 py-1 overflow-hidden text-left transition-shadow hover:shadow-md cursor-pointer`}
                                                            style={{ top: `${Math.max(top, 0)}px`, height: `${height}px`, zIndex: 10 }}
                                                        >
                                                            <p className="text-[11px] font-semibold truncate leading-tight">{m.title}</p>
                                                            {height > 30 && (
                                                                <p className="text-[10px] opacity-70 truncate">{formatTime(m.start_time)} - {formatTime(m.end_time)}</p>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {/* ===== DAY VIEW ===== */}
                        {viewMode === 'day' && (
                            <div className="overflow-auto">
                                <div className="relative" style={{ height: `${dayHours.length * 60}px` }}>
                                    {/* Hour rows */}
                                    {dayHours.map((hour) => (
                                        <div
                                            key={`day-hour-${hour}`}
                                            className="absolute left-0 right-0 flex border-t border-slate-100"
                                            style={{ top: `${(hour - 7) * 60}px`, height: '60px' }}
                                        >
                                            <div className="w-[60px] text-right pr-3 text-xs text-slate-400 font-medium flex-shrink-0" style={{ transform: 'translateY(-6px)' }}>
                                                {hour === 12 ? '12 PM' : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                                            </div>
                                            <div className="flex-1" />
                                        </div>
                                    ))}

                                    {/* Events */}
                                    {(() => {
                                        const dateStr = formatDateStr(dayViewDate);
                                        const dayMeetings = getMeetingsForDate(dateStr);
                                        return dayMeetings.map((m, mIdx) => {
                                            const top = getTimePosition(m.start_time, 7);
                                            const height = getBlockHeight(m.start_time, m.end_time);
                                            const pastel = getPastelStyle(m);

                                            if (top < 0 || top > dayHours.length * 60) return null;

                                            return (
                                                <button
                                                    key={m.id || `day-${mIdx}`}
                                                    onClick={() => openDetail(m)}
                                                    className={`absolute ${pastel.bg} ${pastel.text} ${pastel.border} border rounded-xl px-3 py-2 overflow-hidden text-left transition-shadow hover:shadow-md cursor-pointer`}
                                                    style={{
                                                        top: `${Math.max(top, 0)}px`,
                                                        height: `${height}px`,
                                                        left: '70px',
                                                        right: '8px',
                                                        zIndex: 10,
                                                    }}
                                                >
                                                    <p className="text-sm font-semibold truncate">{m.title}</p>
                                                    <p className="text-xs opacity-70 mt-0.5">
                                                        {formatTime(m.start_time)} - {formatTime(m.end_time)}
                                                    </p>
                                                    {height > 60 && m.description && (
                                                        <p className="text-xs opacity-60 mt-1 truncate">{m.description}</p>
                                                    )}
                                                </button>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        )}

                        {/* Legend - Followed users (shown in all views).
                            Self gets a slightly larger filled dot so "you"
                            reads as the primary entry vs. teammates. */}
                        <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-slate-200">
                            {legendUsers.map(lu => {
                                const color = userColorMap[lu.id];
                                return (
                                    <div key={lu.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                                        <span className={`${lu.isCurrent ? 'w-2.5 h-2.5 ring-2 ring-slate-200' : 'w-2 h-2'} rounded-full ${color?.dot || 'bg-slate-400'}`} />
                                        <span className={lu.isCurrent ? 'font-semibold text-slate-700' : ''}>{lu.name}</span>
                                        {lu.isCurrent && <span className="text-slate-400">(you)</span>}
                                    </div>
                                );
                            })}
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                <span className="w-2 h-2 rounded-full bg-yellow-400" /> Pending
                            </div>
                        </div>

                        {/* Action Buttons — below calendar */}
                        <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-slate-200">
                            <div className="relative">
                                <button
                                    onClick={() => setShowSubscribeDropdown(!showSubscribeDropdown)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>
                                    Follow Teammates
                                    {subscribedUsers.length > 0 && (
                                        <span className="bg-indigo-100 text-indigo-700 py-0.5 px-2 rounded-full text-xs font-bold">{subscribedUsers.length}</span>
                                    )}
                                </button>
                                {showSubscribeDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setShowSubscribeDropdown(false)}></div>
                                        <div className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
                                            <div className="p-3 border-b border-slate-100 bg-slate-50">
                                                <h3 className="text-sm font-semibold text-slate-800">Overlay Calendars</h3>
                                                <p className="text-xs text-slate-500 mt-0.5">See events and meetings from others</p>
                                            </div>
                                            <div className="max-h-60 overflow-y-auto p-2">
                                                {teamMembers.filter(m => m.id !== user?.id).length > 0 ? teamMembers.filter(m => m.id !== user?.id).map(member => (
                                                    <label key={member.id} className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                            checked={subscribedUsers.includes(member.id)}
                                                            onChange={() => {
                                                                if (subscribedUsers.includes(member.id)) {
                                                                    setSubscribedUsers(subscribedUsers.filter((id: string) => id !== member.id));
                                                                } else {
                                                                    setSubscribedUsers([...subscribedUsers, member.id]);
                                                                }
                                                            }}
                                                        />
                                                        <span className="text-sm text-slate-700">{member.name}</span>
                                                    </label>
                                                )) : (
                                                    <p className="text-sm text-slate-400 p-2">No team members found</p>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                            {gcalConnected ? (
                                <button
                                    onClick={() => setShowDisconnectModal(true)}
                                    disabled={gcalDisconnecting}
                                    className="group flex items-center gap-2 px-6 py-2.5 bg-emerald-50 hover:bg-rose-50 text-emerald-700 hover:text-rose-600 text-sm font-semibold rounded-full border border-emerald-200 hover:border-rose-200 transition-all disabled:opacity-50"
                                >
                                    <CheckCircle2 className="w-4 h-4 group-hover:hidden" />
                                    <X className="w-4 h-4 hidden group-hover:block" />
                                    <span className="group-hover:hidden">{gcalDisconnecting ? 'Disconnecting...' : 'Google Calendar Connected'}</span>
                                    <span className="hidden group-hover:inline">{gcalDisconnecting ? 'Disconnecting...' : 'Disconnect Calendar'}</span>
                                </button>
                            ) : (
                                <button
                                    onClick={handleConnectGoogleCalendar}
                                    disabled={gcalConnecting}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-full border border-slate-300 shadow-sm transition-all disabled:opacity-50"
                                >
                                    Connect Google Calendar
                                </button>
                            )}
                            <button
                                onClick={() => { resetForm(); setShowAddModal(true); }}
                                className="px-7 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-md transition-all flex items-center gap-2 text-sm"
                            >
                                <Plus className="w-5 h-5" /> Add Meeting
                            </button>
                        </div>
                    </div>

                    {/* Day Detail Panel */}
                    <div className="w-80 bg-white shadow-sm border border-slate-200 rounded-2xl p-4 flex flex-col">
                        {selectedDate ? (
                            <>
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-slate-900">
                                        {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                    </h4>
                                    <button
                                        onClick={() => openAddForDate(selectedDate)}
                                        className="p-1.5 text-indigo-400 hover:bg-indigo-500/10 rounded-lg transition-colors"
                                        title="Add meeting on this date"
                                    >
                                        <Plus className="w-4 h-4" />
                                    </button>
                                </div>
                                {selectedMeetings.length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center">
                                        <p className="text-sm text-slate-500">No meetings scheduled</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2 flex-1 overflow-y-auto">
                                        {selectedMeetings.map((m, idx) => {
                                            const theme = getMeetingTheme(m);
                                            return (
                                                <button
                                                    key={m.id || `meeting-${idx}`}
                                                    onClick={() => openDetail(m)}
                                                    className={`w-full text-left p-3 rounded-xl border transition-colors hover:bg-slate-200/30 ${m.status === 'pending' ? 'bg-yellow-50 border-yellow-300' : 'bg-slate-50 border-slate-300'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${theme.dot}`} />
                                                        <p className="text-sm font-medium text-slate-900 truncate">{m.title}</p>
                                                    </div>
                                                <p className="text-xs text-slate-500 mt-1 ml-4">
                                                    {formatTime(m.start_time)} – {formatTime(m.end_time)}
                                                </p>
                                                {m.assignee?.name && (
                                                    <p className="text-xs text-slate-500 mt-0.5 ml-4">👤 {m.assignee.name}</p>
                                                )}
                                                {m.guests?.length > 0 && (
                                                    <p className="text-xs text-slate-500 mt-0.5 ml-4">👥 {m.guests.length} guest{m.guests.length > 1 ? 's' : ''}</p>
                                                )}
                                                {m.status === 'pending' && (
                                                    <span className="inline-flex ml-4 mt-1 px-2 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800 border border-yellow-300 rounded-full">
                                                        Pending
                                                    </span>
                                                )}
                                            </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <CalendarIcon className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                                    <p className="text-sm text-slate-500">Select a day to view meetings</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Disconnect Google Calendar Modal */}
            {showDisconnectModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowDisconnectModal(false)}>
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0">
                                    <svg className="w-5 h-5 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M18 6 6 18M6 6l12 12" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">Disconnect Google Calendar</h3>
                                    <p className="text-sm text-slate-500 mt-1">Your calendar events will no longer sync with AHA COMSS. You can reconnect anytime.</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200">
                            <button
                                onClick={() => setShowDisconnectModal(false)}
                                className="px-5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDisconnectGoogleCalendar}
                                className="px-5 py-2 text-sm font-semibold text-white bg-rose-500 rounded-xl hover:bg-rose-600 transition-colors"
                            >
                                Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Meeting Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">Add Meeting</h2>
                            <button onClick={() => setShowAddModal(false)} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            {/* Title */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Meeting Title *</label>
                                <input
                                    type="text"
                                    value={form.title}
                                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                    placeholder="e.g. Sprint Planning"
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                />
                            </div>

                            {/* Date */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Date *</label>
                                <input
                                    type="date"
                                    value={form.meetingDate}
                                    onChange={e => setForm(f => ({ ...f, meetingDate: e.target.value }))}
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                />
                            </div>

                            {/* Time */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Start Time *</label>
                                    <input
                                        type="time"
                                        value={form.startTime}
                                        onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">End Time *</label>
                                    <input
                                        type="time"
                                        value={form.endTime}
                                        onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 "
                                    />
                                </div>
                            </div>

                            {/* Assign To (Leaders only) */}
                            {isLeader && (
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Assign To</label>
                                    <select
                                        value={form.assignedTo}
                                        onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))}
                                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500"
                                    >
                                        <option value="">Myself</option>
                                        {teamMembers.map(m => (
                                            <option key={m.id} value={m.id}>{m.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Description */}
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Notes (Optional)</label>
                                <textarea
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    rows={2}
                                    placeholder="Meeting agenda or notes..."
                                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                />
                            </div>

                            {/* Submit */}
                            <button
                                onClick={handleAddMeeting}
                                disabled={!form.title || !form.meetingDate}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                            >
                                <CalendarIcon className="w-5 h-5" /> Create Meeting
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Meeting Detail Modal */}
            {detailMeeting && !isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white">
                            <div className="flex items-center gap-3 min-w-0">
                                <span className={`w-3 h-3 rounded-full flex-shrink-0 ${getMeetingTheme(detailMeeting).dot}`} />
                                <h2 className="text-lg font-semibold text-slate-900 truncate">{detailMeeting.title}</h2>
                            </div>
                            <div className="flex items-center gap-1">
                                {(isLeader || detailMeeting.created_by === user?.id) && (
                                    <button onClick={() => setIsEditing(true)} className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors" title="Edit">
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                )}
                                {(isLeader || detailMeeting.created_by === user?.id) && (
                                    <button onClick={() => { handleDeleteMeeting(detailMeeting.id); setDetailMeeting(null); }} className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors" title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                )}
                                <button onClick={() => setDetailMeeting(null)} className="p-1.5 text-slate-500 hover:text-slate-900">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="p-6 space-y-5">
                            {/* Date & Time */}
                            <div className="flex items-center gap-3">
                                <CalendarIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                <div>
                                    <p className="text-sm text-slate-900">
                                        {new Date(detailMeeting.meeting_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                    </p>
                                    <p className="text-xs text-slate-500">
                                        {formatTime(detailMeeting.start_time)} – {formatTime(detailMeeting.end_time)}
                                    </p>
                                </div>
                            </div>

                            {/* Meeting Link — from Google Calendar hangoutLink or detected in description */}
                            {(() => {
                                const link = detailMeeting.meeting_link
                                    || detailMeeting.description?.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/i)?.[0]
                                    || detailMeeting.description?.match(/https:\/\/calendly\.com\/events\/[^\s]+\/google_meet/i)?.[0]
                                    || null;
                                if (!link) return null;
                                const displayUrl = link.replace(/^https?:\/\//, '').replace(/^www\./, '');
                                return (
                                    <div className="flex items-center gap-3">
                                        <ExternalLink className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <a
                                                href={link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors"
                                            >
                                                Join with Google Meet
                                            </a>
                                            <p className="text-xs text-slate-500 mt-1 truncate">{displayUrl}</p>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Description */}
                            {detailMeeting.description && (
                                <div className="flex items-start gap-3">
                                    <FileText className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                    <div
                                        className="text-sm text-slate-600 whitespace-pre-wrap break-words meeting-description"
                                        dangerouslySetInnerHTML={{ __html: sanitizeMeetingDescription(detailMeeting.description) }}
                                    />
                                </div>
                            )}

                            {/* Organizer */}
                            <div className="flex items-center gap-3">
                                <UserPlus className="w-5 h-5 text-slate-500 flex-shrink-0" />
                                <div>
                                    <p className="text-xs text-slate-500">Organizer</p>
                                    <p className="text-sm text-slate-900">
                                        {detailMeeting.organizer_name
                                            || (detailMeeting.source === 'partner_relations'
                                                ? (detailMeeting.description?.match(/Requester:\s*([^\n]+)/)?.[1] || 'Unknown Partner')
                                                : (detailMeeting.creator?.name || 'Unknown'))}
                                    </p>
                                    {detailMeeting.organizer_email && detailMeeting.organizer_email !== detailMeeting.organizer_name && (
                                        <p className="text-xs text-slate-400">{detailMeeting.organizer_email}</p>
                                    )}
                                </div>
                            </div>

                            {/* Guests */}
                            <div className="flex items-start gap-3">
                                <Users className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 mb-2">
                                        {detailMeeting.guests.length} guest{detailMeeting.guests.length !== 1 ? 's' : ''}
                                    </p>

                                    {/* Guest list */}
                                    {detailMeeting.guests.length > 0 && (
                                        <div className="space-y-1.5 mb-3">
                                            {detailMeeting.guests.map(g => (
                                                <div key={g.id} className="flex items-center justify-between px-3 py-1.5 bg-slate-50 rounded-lg">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-indigo-500/30 flex items-center justify-center text-[10px] font-bold text-indigo-700">
                                                            {g.name?.charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="text-sm text-slate-600">{g.name}</span>
                                                    </div>
                                                    {(isLeader || detailMeeting.created_by === user?.id) && (
                                                        <button
                                                            onClick={() => handleRemoveGuest(g.id)}
                                                            className="p-1 text-slate-500 hover:text-rose-400 rounded transition-colors"
                                                            title="Remove guest"
                                                        >
                                                            <UserMinus className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Add guest */}
                                    {(isLeader || detailMeeting.created_by === user?.id) && (
                                        <div className="flex gap-2">
                                            <select
                                                value={addGuestId}
                                                onChange={e => setAddGuestId(e.target.value)}
                                                className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:border-indigo-500"
                                            >
                                                <option value="">Add guest...</option>
                                                {teamMembers
                                                    .filter(m => !detailMeeting.guests.some(g => g.id === m.id) && m.id !== detailMeeting.created_by)
                                                    .map(m => (
                                                        <option key={m.id} value={m.id}>{m.name}</option>
                                                    ))}
                                            </select>
                                            <button
                                                onClick={handleAddGuest}
                                                disabled={!addGuestId}
                                                className="px-3 py-1.5 bg-indigo-500 text-white text-sm rounded-lg hover:bg-indigo-600 disabled:opacity-50 transition-colors"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Notification */}
                            <div className="flex items-start gap-3">
                                <Bell className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-xs text-slate-500 mb-2">Notification</p>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {[{ val: 5, label: '5 min' }, { val: 10, label: '10 min' }, { val: 15, label: '15 min' }, { val: 30, label: '30 min' }, { val: 60, label: '1 hour' }].map(opt => (
                                            <button
                                                key={opt.val}
                                                onClick={() => setPendingNotifyBefore(opt.val)}
                                                className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                                                    (pendingNotifyBefore ?? detailMeeting.notify_before ?? 0) === opt.val
                                                        ? 'bg-indigo-500 text-white border-indigo-500'
                                                        : 'bg-slate-100 text-slate-500 border-slate-300 hover:text-slate-900'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                        {pendingNotifyBefore !== null && pendingNotifyBefore !== (detailMeeting.notify_before ?? 0) && !notifyConfirmed && (
                                            <button
                                                onClick={() => setNotifyConfirmed(true)}
                                                className="ml-1 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
                                            >
                                                Set
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Status badges */}
                            {detailMeeting.status === 'pending' && isLeader && (
                                <button
                                    onClick={() => { handleApproveMeeting(detailMeeting.id); setDetailMeeting(null); }}
                                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-full transition-colors flex items-center justify-center gap-2 text-sm shadow-sm"
                                >
                                    <CheckCircle2 className="w-5 h-5" /> Approve Meeting
                                </button>
                            )}

                            {/* Save & Cancel — shown for organizer/leader OR after notification Set is clicked */}
                            {(notifyConfirmed || ((isLeader || detailMeeting.created_by === user?.id) && false)) ? (
                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                                    <button
                                        onClick={() => {
                                            setPendingNotifyBefore(null);
                                            setNotifyConfirmed(false);
                                        }}
                                        className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (pendingNotifyBefore !== null) {
                                                await handleSetNotification(pendingNotifyBefore);
                                            }
                                            setPendingNotifyBefore(null);
                                            setNotifyConfirmed(false);
                                            setDetailMeeting(null);
                                        }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 text-sm font-bold transition-all shadow-sm"
                                    >
                                        Save
                                    </button>
                                </div>
                            ) : (isLeader || detailMeeting.created_by === user?.id) ? (
                                <div className="flex gap-3 pt-4 border-t border-slate-200 mt-4">
                                    <button
                                        onClick={() => setDetailMeeting(null)}
                                        className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold transition-colors shadow-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => { handleSaveEdit(); }}
                                        className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 text-sm font-bold transition-all shadow-sm"
                                    >
                                        Save
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Meeting Modal */}
            {detailMeeting && isEditing && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
                            <h2 className="text-lg font-semibold text-slate-900">Edit Meeting</h2>
                            <button onClick={() => setIsEditing(false)} className="p-1 text-slate-500 hover:text-slate-900">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Title *</label>
                                <input type="text" value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Date *</label>
                                <input type="date" value={editForm.meetingDate} onChange={e => setEditForm(f => ({ ...f, meetingDate: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">Start *</label>
                                    <input type="time" value={editForm.startTime} onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-500 font-medium">End *</label>
                                    <input type="time" value={editForm.endTime} onChange={e => setEditForm(f => ({ ...f, endTime: e.target.value }))} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 " />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 font-medium">Notes</label>
                                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-500 resize-none" />
                            </div>
                            <div className="flex gap-3 mt-6">
                                <button onClick={() => setIsEditing(false)} className="flex-1 py-3 bg-white border border-slate-200 text-[#0F0E7F] rounded-full hover:bg-slate-50 text-sm font-bold shadow-sm transition-colors">Cancel</button>
                                <button onClick={handleSaveEdit} disabled={savingEdit || !editForm.title} className="flex-1 py-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 text-sm font-bold shadow-sm transition-all">
                                    {savingEdit ? 'Saving...' : 'Save Changes'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
