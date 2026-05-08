'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Send, Zap, Copy, Check, ExternalLink, ImagePlus, X, Loader2, Calendar, Users, FileText, ChevronDown, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { RichTextEditor } from '@/components/RichTextEditor';

const DIVISIONS = [
    'Partner Relationship (PR)',
    'Marketplace (MP)',
    'Branding',
    'Finance',
    'Business Development (BD)',
    'Warehouse',
    'Human Resource (HR)',
    'Customer Service (CS)',
    'Logistics',
];

const REQUEST_TYPES = [
    { value: 'fix_request', label: 'Partner Request' },
    { value: 'google_sheets', label: 'Google Sheets Maintenance' },
    { value: 'other', label: 'Other' },
];

const PRIORITY_LEVELS = [
    { value: 'P1', label: 'P1', sublabel: 'Critical / Blocker', description: 'Very Important - Very Urgent', color: 'bg-rose-500', border: 'border-rose-500', text: 'text-rose-400', ring: 'ring-rose-500/30' },
    { value: 'P2', label: 'P2', sublabel: 'High Priority', description: 'Very Important - Not Urgent', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-400', ring: 'ring-orange-500/30' },
    { value: 'P3', label: 'P3', sublabel: 'Normal', description: 'Not Important - Very Urgent', color: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-400', ring: 'ring-amber-500/30' },
    { value: 'P4', label: 'P4', sublabel: 'Low Priority', description: 'Not Important - Not Urgent', color: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-400', ring: 'ring-emerald-500/30' },
    { value: '5-minute', label: '5 Min', sublabel: '5-Minute Quick Fix', description: '', color: '', border: '', text: 'text-sky-500', ring: 'ring-sky-400/30', customStyle: { backgroundColor: '#56CDFC', color: '#ffffff' } },
];



export default function RequestPage() {
    const [loading, setLoading] = useState(false);
    const [taskToken, setTaskToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    // Image upload state
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const pasteZoneRef = useRef<HTMLDivElement>(null);

    const [formData, setFormData] = useState({
        requesterName: '',
        requesterEmail: '',
        requesterDivision: '',
        requestType: 'fix_request',
        title: '',
        urgency: 'P3',
        description: '',
        dueDate: '',
        dueDateTime: '' as string, // captured at pick time: "HH:MM:SS"
        isDirectRequest: false,
        directAssigneeId: '' as string | null,
        brandCode: '',
        fileUrls: [] as string[],
        referenceUrls: [] as string[],
    });
    const [newUrlInput, setNewUrlInput] = useState('');
    const fileUploadRef = useRef<HTMLInputElement>(null);

    // Brand codes for Partner Request
    const [brandCodes, setBrandCodes] = useState<string[]>([]);
    const [brandSearchOpen, setBrandSearchOpen] = useState(false);
    const [showPriorityInfo, setShowPriorityInfo] = useState(false);
    useEffect(() => {
        fetch('/api/brand-codes').then(r => r.ok ? r.json() : []).then(setBrandCodes).catch(() => {});
    }, []);


    // FBI members state for direct request
    const [fbiMembers, setFbiMembers] = useState<{ id: string; name: string; role: string; team: string }[]>([]);
    const [loadingFbi, setLoadingFbi] = useState(false);

    // Employee autocomplete state
    const [allEmployees, setAllEmployees] = useState<{ name: string; division: string }[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [nameInputValue, setNameInputValue] = useState('');
    const nameInputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Fetch employees when division changes
    useEffect(() => {
        if (formData.requesterDivision) {
            fetch(`/api/employees?division=${encodeURIComponent(formData.requesterDivision)}`)
                .then(r => r.ok ? r.json() : [])
                .then(data => setAllEmployees(data))
                .catch(() => setAllEmployees([]));
        } else {
            setAllEmployees([]);
        }
        // Reset name when division changes
        setNameInputValue('');
        setFormData(prev => ({ ...prev, requesterName: '' }));
    }, [formData.requesterDivision]);

    // Fetch FBI members when direct request is toggled on
    useEffect(() => {
        if (formData.isDirectRequest && fbiMembers.length === 0) {
            setLoadingFbi(true);
            fetch('/api/users/public')
                .then(r => r.ok ? r.json() : [])
                .then((data: { id: string; name: string; role: string; teams?: { name: string } }[]) => {
                    const members = data
                        .filter(u => {
                            const teamName = u.teams?.name?.toLowerCase() || '';
                            return teamName.includes('fbi') || teamName.includes('factual business intelligence');
                        })
                        .map(u => ({ id: u.id, name: u.name, role: u.role, team: u.teams?.name || '' }));
                    setFbiMembers(members);
                })
                .catch(() => setFbiMembers([]))
                .finally(() => setLoadingFbi(false));
        }
    }, [formData.isDirectRequest]);

    // Filter suggestions based on typed input
    const filteredSuggestions = useMemo(() => {
        if (!nameInputValue.trim()) return allEmployees;
        const q = nameInputValue.toLowerCase();
        return allEmployees.filter(e => e.name.toLowerCase().includes(q));
    }, [nameInputValue, allEmployees]);

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node) &&
                nameInputRef.current && !nameInputRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Tab state
    const [activeTab, setActiveTab] = useState<'request' | 'meeting'>('request');

    // Multi-step wizard state
    const [currentStep, setCurrentStep] = useState(1);
    const [stepErrors, setStepErrors] = useState<string[]>([]);
    const [editingFromReview, setEditingFromReview] = useState(false);
    const [highestStepReached, setHighestStepReached] = useState(1);

    const STEP_LABELS = ['Your Info', 'Request Details', 'Priority & Description', 'Review & Submit'];
    const STEP_SUBTITLES = [
        'Tell us who you are',
        'What do you need help with?',
        'How urgent is this and describe the details',
        'Review your request before submitting',
    ];

    const validateStep = (step: number): boolean => {
        const errors: string[] = [];
        if (step === 1) {
            if (!formData.requesterDivision) errors.push('Please select your division.');
            if (!formData.requesterName.trim()) errors.push('Please enter your full name.');
            if (!formData.requesterEmail?.trim()) errors.push('Please enter your email address.');
            else if (!formData.requesterEmail.trim().endsWith('@ahacommerce.net')) errors.push('Only @ahacommerce.net email addresses are allowed.');
        } else if (step === 2) {
            if (!formData.title.trim()) errors.push('Please enter a request title.');
            if (formData.requestType === 'fix_request' && !formData.brandCode) errors.push('Please select a brand code.');
            if (formData.isDirectRequest && !formData.directAssigneeId) errors.push('Please select an FBI member.');
        } else if (step === 3) {
            // Strip HTML tags to check for real content
            const textContent = formData.description.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
            if (!textContent) errors.push('Please enter a request description.');
        }
        setStepErrors(errors);
        return errors.length === 0;
    };

    const handleNext = () => {
        if (validateStep(currentStep)) {
            const nextStep = Math.min(currentStep + 1, 4);
            setCurrentStep(nextStep);
            setHighestStepReached(prev => Math.max(prev, nextStep));
        }
    };

    const handleBack = () => {
        setStepErrors([]);
        setCurrentStep(prev => Math.max(prev - 1, 1));
    };

    const goToStep = (step: number, fromReview = false) => {
        setStepErrors([]);
        setEditingFromReview(fromReview);
        setCurrentStep(step);
    };

    // Partner Meeting form state
    const [meetingForm, setMeetingForm] = useState({
        title: '',
        description: '',
        meetingDate: '',
        startTime: '09:00',
        endTime: '10:00',
        meetingType: 'monthly_meeting',
        requesterName: '',
        requesterDivision: '',
    });
    const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
    const [allUsers, setAllUsers] = useState<{ id: string; name: string; teams?: { name: string } }[]>([]);
    const [isPickingGuest, setIsPickingGuest] = useState(true);
    const [meetingLoading, setMeetingLoading] = useState(false);
    const [meetingSuccess, setMeetingSuccess] = useState(false);
    const [meetingError, setMeetingError] = useState<string | null>(null);

    // Meeting employee autocomplete state
    const [meetingEmployees, setMeetingEmployees] = useState<{ name: string; division: string }[]>([]);
    const [meetingShowSuggestions, setMeetingShowSuggestions] = useState(false);
    const [meetingNameInput, setMeetingNameInput] = useState('');
    const meetingNameInputRef = useRef<HTMLInputElement>(null);
    const meetingSuggestionsRef = useRef<HTMLDivElement>(null);

    // Fetch employees when meeting division changes
    useEffect(() => {
        if (meetingForm.requesterDivision) {
            fetch(`/api/employees?division=${encodeURIComponent(meetingForm.requesterDivision)}`)
                .then(r => r.ok ? r.json() : [])
                .then(data => setMeetingEmployees(data))
                .catch(() => setMeetingEmployees([]));
        } else {
            setMeetingEmployees([]);
        }
        setMeetingNameInput('');
        setMeetingForm(prev => ({ ...prev, requesterName: '' }));
    }, [meetingForm.requesterDivision]);

    const meetingFilteredSuggestions = useMemo(() => {
        if (!meetingNameInput.trim()) return meetingEmployees;
        const q = meetingNameInput.toLowerCase();
        return meetingEmployees.filter(e => e.name.toLowerCase().includes(q));
    }, [meetingNameInput, meetingEmployees]);

    // Close meeting suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                meetingSuggestionsRef.current && !meetingSuggestionsRef.current.contains(e.target as Node) &&
                meetingNameInputRef.current && !meetingNameInputRef.current.contains(e.target as Node)
            ) {
                setMeetingShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const MEETING_TYPES = [
        { value: 'monthly_meeting', label: 'Monthly Meeting' },
        { value: 'initiation_meeting', label: 'Initiation Meeting' },
        { value: 'bam', label: 'Business Alignment Meeting (BAM)' },
        { value: 'other', label: 'Other' },
    ];

    // Fetch users for the multi-select dropdown
    useEffect(() => {
        if (activeTab === 'meeting') {
            fetch('/api/users/public')
                .then(r => r.ok ? r.json() : [])
                .then(data => setAllUsers(data))
                .catch(() => {});
        }
    }, [activeTab]);

    const toggleUser = (userId: string) => {
        setSelectedUsers(prev =>
            prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
        );
    };

    const handleMeetingSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setMeetingLoading(true);
        setMeetingError(null);

        try {
            const typeLabel = MEETING_TYPES.find(t => t.value === meetingForm.meetingType)?.label || '';
            const fullTitle = `[${typeLabel}] ${meetingForm.title}`;

            const res = await fetch('/api/request-meeting', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: fullTitle,
                    description: `Division: ${meetingForm.requesterDivision}\n\n${meetingForm.description}`,
                    meetingDate: meetingForm.meetingDate,
                    startTime: meetingForm.startTime,
                    endTime: meetingForm.endTime,
                    meetingType: meetingForm.meetingType,
                    requesterName: meetingForm.requesterName,
                    invitedUsers: selectedUsers,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to submit meeting request');
            }

            setMeetingSuccess(true);
        } catch (err: any) {
            setMeetingError(err.message);
        } finally {
            setMeetingLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    // Upload image file
    const uploadImage = useCallback(async (file: File) => {
        setUploading(true);
        setUploadError(null);

        // Show local preview immediately
        const localPreview = URL.createObjectURL(file);
        setImagePreview(localPreview);

        try {
            const fd = new FormData();
            fd.append('file', file);

            const res = await fetch('/api/upload', { method: 'POST', body: fd });
            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Upload failed');

            setImageUrl(data.url);
        } catch (err: any) {
            setUploadError(err.message || 'Failed to upload image');
            setImagePreview(null);
            setImageUrl(null);
        } finally {
            setUploading(false);
        }
    }, []);

    // Handle paste (Ctrl+V)
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) uploadImage(file);
                return;
            }
        }
    }, [uploadImage]);

    // Handle drop
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                uploadImage(file);
            } else {
                setUploadError('Please drop an image file (PNG, JPEG, WebP, or GIF)');
            }
        }
    }, [uploadImage]);

    // Handle file input change
    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) uploadImage(file);
    }, [uploadImage]);

    // Remove image
    const removeImage = () => {
        setImageUrl(null);
        setImagePreview(null);
        setUploadError(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const res = await fetch('/api/request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...formData,
                    title: formData.brandCode ? `[${formData.brandCode}] ${formData.title}` : formData.title,
                    imageUrl,
                    directAssigneeId: formData.isDirectRequest ? formData.directAssigneeId : null,
                }),
            });

            const data = await res.json();
            if (data.status !== 'success') throw new Error(data.message || 'Request failed');

            setTaskToken(data.data.taskToken);
        } catch (err: any) {
            setError(err.message || 'Failed to submit request. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const copyToken = () => {
        if (taskToken) {
            navigator.clipboard.writeText(taskToken);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };



    // Success Screen
    if (taskToken) {
        return (
            <div className="min-h-screen bg-slate-50 border-slate-200 flex flex-col items-center justify-center p-4">
                <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-3xl p-8 max-w-md w-full text-center">
                    <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                        <Send className="w-8 h-8" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Request Submitted!</h2>
                    <p className="text-slate-500 mb-6">
                        Your request has been received and the FAST team has been notified.
                    </p>

                    {/* Task Token Display */}
                    <div className="bg-slate-50 border border-slate-300 rounded-2xl p-6 mb-6">
                        <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">Your Task Token</p>
                        <div className="flex items-center justify-center gap-3">
                            <span className="text-3xl font-bold text-slate-900 font-mono tracking-wider">{taskToken}</span>
                            <button
                                onClick={copyToken}
                                className="p-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-500 hover:text-slate-900"
                                title="Copy token"
                            >
                                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
                            </button>
                        </div>
                        <p className="text-xs text-slate-500 mt-3">
                            Save this token to track your request status
                        </p>
                    </div>



                    <div className="flex gap-3">
                        <Link
                            href={`/track?token=${taskToken}`}
                            className="flex-1 py-3.5 px-4 bg-indigo-600 text-white font-bold rounded-full hover:bg-indigo-700 transition-all flex items-center justify-center gap-2 text-sm shadow-sm"
                        >
                            <ExternalLink className="w-5 h-5" />
                            Track Status
                        </Link>
                        <button
                            onClick={() => {
                                setTaskToken(null);
                                setFormData({
                                    requesterName: '', requesterDivision: '', requesterEmail: '',
                                    requestType: 'fix_request', title: '', urgency: 'P3',
                                    description: '', dueDate: '', dueDateTime: '',
                                    isDirectRequest: false, directAssigneeId: '', brandCode: '', fileUrls: [], referenceUrls: [],
                                });
                                removeImage();
                                setCurrentStep(1);
                                setHighestStepReached(1);
                                setEditingFromReview(false);
                                setStepErrors([]);
                                setError(null);
                            }}
                            className="flex-1 py-3.5 px-4 bg-white border border-slate-200 text-[#0F0E7F] font-bold rounded-full hover:bg-slate-50 transition-all text-sm shadow-sm"
                        >
                            New Request
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white text-slate-800 p-4 md:p-8 flex justify-center">
            <div className="w-full max-w-2xl">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                            <img src="/aha-logo.png?v=2" alt="AHA Logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">FAST Request Form</h1>
                            <p className="text-slate-500 text-sm">Submit a new request to the FAST team</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <Link href="/track" className="text-sm font-medium text-indigo-500 hover:text-indigo-600 transition-colors">
                            Track Request
                        </Link>
                        <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
                            &larr; Back to AHA COMSS
                        </Link>
                    </div>
                </div>

                {/* Tab Selector */}
                <div className="flex gap-4 mb-6">
                    <button
                        onClick={() => setActiveTab('request')}
                        className={`flex-1 py-3.5 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${
                            activeTab === 'request'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border text-slate-500 hover:text-slate-900 border-slate-200'
                        }`}
                    >
                        <FileText className="w-4 h-4" />
                        Submit Request
                    </button>
                    <button
                        onClick={() => setActiveTab('meeting')}
                        className={`flex-1 py-3.5 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${
                            activeTab === 'meeting'
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white border text-slate-500 hover:text-slate-900 border-slate-200'
                        }`}
                    >
                        <Calendar className="w-4 h-4" />
                        Making Appointment
                    </button>
                </div>

                {/* Request Form (multi-step wizard) */}
                {activeTab === 'request' && (
                <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl">

                    {/* Step Progress Bar */}
                    <div className="mb-8">
                        <div className="flex items-center justify-between">
                            {STEP_LABELS.map((label, idx) => {
                                const stepNum = idx + 1;
                                const isCompleted = highestStepReached > stepNum && currentStep !== stepNum;
                                const isActive = currentStep === stepNum;
                                const isFuture = currentStep < stepNum;
                                return (
                                    <div key={stepNum} className="flex items-center flex-1 last:flex-initial">
                                        <div className="flex flex-col items-center">
                                            <div
                                                className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                                                    isCompleted ? 'bg-indigo-600 text-white' :
                                                    isActive ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                                                    'bg-white border-2 border-slate-300 text-slate-400'
                                                }`}
                                            >
                                                {isCompleted ? <Check className="w-4 h-4" /> : stepNum}
                                            </div>
                                            <span className={`text-xs mt-1.5 font-medium whitespace-nowrap ${
                                                isActive ? 'text-indigo-600' : isCompleted ? 'text-indigo-600' : 'text-slate-400'
                                            }`}>{label}</span>
                                        </div>
                                        {stepNum < 4 && (
                                            <div className={`flex-1 h-0.5 mx-2 mb-5 ${
                                                highestStepReached > stepNum ? 'bg-indigo-600' : 'bg-slate-200'
                                            }`} />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step Title & Subtitle */}
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-slate-900">{STEP_LABELS[currentStep - 1]}</h2>
                        <p className="text-sm text-slate-500 mt-0.5">{STEP_SUBTITLES[currentStep - 1]}</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Step errors moved to above Next button */}

                    <div className="space-y-5" onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        // Allow Enter inside rich text editors and textareas (for newlines)
                        const target = e.target as HTMLElement;
                        if (target.isContentEditable || target.tagName === 'TEXTAREA') return;
                        e.preventDefault();
                    }}>

                        {/* ===== STEP 1: Your Information ===== */}
                        {currentStep === 1 && (
                            <>
                                {/* Division */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Division / Team / Brand <span className="text-rose-500">*</span></label>
                                    <select
                                        name="requesterDivision"
                                        value={formData.requesterDivision} onChange={handleChange}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                    >
                                        <option value="">Select your division...</option>
                                        {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                    </select>
                                </div>


                                {/* Full Name (autocomplete) */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Full Name <span className="text-rose-500">*</span></label>
                                    <div className="relative">
                                        <input
                                            ref={nameInputRef}
                                            type="text"
                                            value={nameInputValue}
                                            disabled={!formData.requesterDivision}
                                            onChange={(e) => {
                                                setNameInputValue(e.target.value);
                                                setFormData({ ...formData, requesterName: e.target.value });
                                                setShowSuggestions(true);
                                            }}
                                            onFocus={() => {
                                                if (formData.requesterDivision) setShowSuggestions(true);
                                            }}
                                            className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                            placeholder={formData.requesterDivision ? 'Type your name...' : 'Select division first...'}
                                            autoComplete="off"
                                        />
                                        {showSuggestions && formData.requesterDivision && filteredSuggestions.length > 0 && (
                                            <div
                                                ref={suggestionsRef}
                                                className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"
                                            >
                                                {filteredSuggestions.map((emp, i) => (
                                                    <button
                                                        key={i}
                                                        type="button"
                                                        onClick={() => {
                                                            setNameInputValue(emp.name);
                                                            setFormData({ ...formData, requesterName: emp.name });
                                                            setShowSuggestions(false);
                                                        }}
                                                        className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${
                                                            nameInputValue === emp.name ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'
                                                        } ${i === 0 ? 'rounded-t-xl' : ''} ${i === filteredSuggestions.length - 1 ? 'rounded-b-xl' : ''}`}
                                                    >
                                                        {emp.name}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {showSuggestions && formData.requesterDivision && nameInputValue && filteredSuggestions.length === 0 && (
                                            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3">
                                                <p className="text-sm text-slate-400">No matching employees found</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Email (Optional) */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Email Address <span className="text-rose-500">*</span></label>
                                    <input
                                        type="email"
                                        name="requesterEmail"
                                        value={formData.requesterEmail}
                                        onChange={handleChange}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                        placeholder="you@ahacommerce.net"
                                    />
                                </div>
                            </>
                        )}

                        {/* ===== STEP 2: Request Details ===== */}
                        {currentStep === 2 && (
                            <>
                                {/* Request Type */}
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-500 font-medium">Request Type</label>
                                    <div className="flex flex-wrap gap-3">
                                        {REQUEST_TYPES.map(rt => (
                                            <label key={rt.value} className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="radio" name="requestType"
                                                    value={rt.value}
                                                    checked={formData.requestType === rt.value}
                                                    onChange={handleChange}
                                                    className="w-4 h-4 text-indigo-500 bg-slate-100 border-slate-300 focus:ring-indigo-500"
                                                />
                                                <span className="text-sm text-slate-700">{rt.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* Brand Code — shown for Partner Request (searchable) */}
                                {formData.requestType === 'fix_request' && (
                                    <div className="space-y-2 relative">
                                        <label className="text-sm text-slate-500 font-medium">Brand Code <span className="text-rose-500">*</span></label>
                                        <input
                                            type="text"
                                            value={formData.brandCode}
                                            onChange={(e) => setFormData({ ...formData, brandCode: e.target.value.toUpperCase() })}
                                            onFocus={() => setBrandSearchOpen(true)}
                                            placeholder="Type or search brand code..."
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                                        />
                                        {brandSearchOpen && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setBrandSearchOpen(false)} />
                                                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-40 max-h-48 overflow-y-auto">
                                                    {brandCodes
                                                        .filter(c => !formData.brandCode || c.toLowerCase().includes(formData.brandCode.toLowerCase()))
                                                        .map(code => (
                                                            <button
                                                                key={code}
                                                                type="button"
                                                                onClick={() => { setFormData({ ...formData, brandCode: code }); setBrandSearchOpen(false); }}
                                                                className="w-full text-left px-4 py-2.5 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                                                            >
                                                                {code}
                                                            </button>
                                                        ))
                                                    }
                                                    {brandCodes.filter(c => !formData.brandCode || c.toLowerCase().includes(formData.brandCode.toLowerCase())).length === 0 && (
                                                        <p className="px-4 py-3 text-sm text-slate-400">No matching brand codes</p>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Direct Request to FBI Member */}
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <div className="relative">
                                            <input
                                                type="checkbox"
                                                checked={formData.isDirectRequest}
                                                onChange={(e) => {
                                                    setFormData({
                                                        ...formData,
                                                        isDirectRequest: e.target.checked,
                                                        directAssigneeId: e.target.checked ? formData.directAssigneeId : null,
                                                    });
                                                }}
                                                className="sr-only peer"
                                            />
                                            <div className="w-10 h-5 bg-slate-200 rounded-full peer-checked:bg-indigo-500 transition-colors" />
                                            <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                                        </div>
                                        <div>
                                            <span className="text-sm text-slate-700 font-medium group-hover:text-slate-900 transition-colors">Direct Request to FBI Member</span>
                                            <p className="text-xs text-slate-400">Send this request directly to a specific team member for approval</p>
                                        </div>
                                    </label>

                                    {formData.isDirectRequest && (
                                        <div className="ml-[52px] space-y-1.5">
                                            <label className="text-sm text-slate-500 font-medium">Select FBI Member <span className="text-rose-500">*</span></label>
                                            <div className="relative">
                                                <select
                                                    value={formData.directAssigneeId || ''}
                                                    onChange={(e) => setFormData({ ...formData, directAssigneeId: e.target.value || null })}
                                                    className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm appearance-none"
                                                >
                                                    <option value="">Select a member...</option>
                                                    {loadingFbi ? (
                                                        <option disabled>Loading members...</option>
                                                    ) : (
                                                        fbiMembers.map(m => (
                                                            <option key={m.id} value={m.id}>{m.name}</option>
                                                        ))
                                                    )}
                                                </select>
                                                <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                                                    <ChevronDown className="w-4 h-4 text-slate-400" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Title */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Request Title / Subject <span className="text-rose-500">*</span></label>
                                    <input
                                        type="text" name="title"
                                        value={formData.title} onChange={handleChange}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                        placeholder="Brief title for your request"
                                    />
                                </div>
                            </>
                        )}

                        {/* ===== STEP 3: Priority & Description ===== */}
                        {currentStep === 3 && (
                            <>
                                {/* Priority Level */}
                                <div className="space-y-2">
                                    <label className="text-sm text-slate-500 font-medium flex items-center gap-1.5 relative">
                                        Priority Level
                                        <button type="button" onClick={() => setShowPriorityInfo(!showPriorityInfo)}
                                            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-600 hover:bg-indigo-200 transition-colors cursor-pointer">?</button>
                                        {showPriorityInfo && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setShowPriorityInfo(false)} />
                                                <div className="absolute left-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-2xl shadow-2xl z-40 p-4" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center justify-between mb-3">
                                                        <h4 className="text-sm font-bold text-slate-800">Estimated Completion Time</h4>
                                                        <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); setShowPriorityInfo(false); }} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div className="space-y-2.5">
                                                        {[
                                                            { label: 'P1', color: 'bg-rose-500', title: 'Critical / Blocker', time: 'Must be completed in 1 day', note: 'Depending on difficulty level' },
                                                            { label: 'P2', color: 'bg-orange-500', title: 'High Priority', time: '3 – 4 days', note: 'Important but not urgent' },
                                                            { label: 'P3', color: 'bg-amber-500', title: 'Normal', time: '1 – 3 days', note: 'Depending on difficulty level' },
                                                            { label: 'P4', color: 'bg-emerald-500', title: 'Low Priority', time: '4 – 5 days', note: 'Non-urgent tasks' },
                                                            { label: '5 Min', color: 'bg-sky-400', title: 'Quick Task', time: '5 minutes', note: 'Instant fix or small change' },
                                                        ].map(p => (
                                                            <div key={p.label} className="flex items-start gap-3">
                                                                <span className={`w-8 h-8 rounded-lg ${p.color} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>{p.label}</span>
                                                                <div>
                                                                    <p className="text-xs font-semibold text-slate-800">{p.title}</p>
                                                                    <p className="text-xs text-indigo-600 font-medium">{p.time}</p>
                                                                    <p className="text-[10px] text-slate-400">{p.note}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </label>
                                    <div className="flex gap-2 flex-wrap">
                                        {PRIORITY_LEVELS.map(p => (
                                            <div key={p.value} className="relative group">
                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, urgency: p.value })}
                                                    className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all shadow-sm ${
                                                        formData.urgency === p.value
                                                            ? (p as any).customStyle ? `ring-2 ${p.ring}` : `${p.color} text-slate-900 ring-2 ${p.ring}`
                                                            : 'bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                                                    }`}
                                                    style={formData.urgency === p.value && (p as any).customStyle ? (p as any).customStyle : undefined}
                                                >
                                                    {p.label}
                                                </button>
                                                {/* Tooltip bubble */}
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-slate-800 text-white text-xs rounded-xl shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-30 pointer-events-none">
                                                    <p className="font-bold">{p.sublabel}</p>
                                                    {p.description && <p className="text-slate-300 mt-0.5">{p.description}</p>}
                                                    <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-slate-800" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {/* Selected priority description bubble */}
                                    {(() => {
                                        const selected = PRIORITY_LEVELS.find(p => p.value === formData.urgency);
                                        return selected ? (
                                            <div className={`flex items-start gap-2.5 px-4 py-3 rounded-xl border transition-all ${
                                                selected.value === 'P1' ? 'bg-rose-50 border-rose-200' :
                                                selected.value === 'P2' ? 'bg-orange-50 border-orange-200' :
                                                selected.value === 'P3' ? 'bg-amber-50 border-amber-200' :
                                                selected.value === 'P4' ? 'bg-emerald-50 border-emerald-200' :
                                                'bg-sky-50 border-sky-200'
                                            }`}>
                                                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                                                    selected.value === 'P1' ? 'bg-rose-500' :
                                                    selected.value === 'P2' ? 'bg-orange-500' :
                                                    selected.value === 'P3' ? 'bg-amber-500' :
                                                    selected.value === 'P4' ? 'bg-emerald-500' :
                                                    'bg-sky-500'
                                                }`} />
                                                <div>
                                                    <p className={`text-xs font-bold ${
                                                        selected.value === 'P1' ? 'text-rose-700' :
                                                        selected.value === 'P2' ? 'text-orange-700' :
                                                        selected.value === 'P3' ? 'text-amber-700' :
                                                        selected.value === 'P4' ? 'text-emerald-700' :
                                                        'text-sky-700'
                                                    }`}>{selected.sublabel}</p>
                                                    {selected.description && (
                                                        <p className={`text-xs mt-0.5 ${
                                                            selected.value === 'P1' ? 'text-rose-600' :
                                                            selected.value === 'P2' ? 'text-orange-600' :
                                                            selected.value === 'P3' ? 'text-amber-600' :
                                                            selected.value === 'P4' ? 'text-emerald-600' :
                                                            'text-sky-600'
                                                        }`}>{selected.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : null;
                                    })()}
                                </div>

                                {/* Description */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Request Description <span className="text-rose-500">*</span></label>
                                    <RichTextEditor
                                        value={formData.description}
                                        onChange={(html) => setFormData(f => ({ ...f, description: html }))}
                                        placeholder="Describe what you need in detail..."
                                        minHeight="120px"
                                        maxHeight="320px"
                                    />
                                </div>

                                {/* Image Upload - Paste Zone */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">
                                        Add Image <span className="text-slate-600">(Optional)</span>
                                    </label>

                                    {!imagePreview ? (
                                        <div
                                            ref={pasteZoneRef}
                                            tabIndex={0}
                                            onPaste={handlePaste}
                                            onDrop={handleDrop}
                                            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                                            onDragLeave={() => setIsDragOver(false)}
                                            onClick={() => fileInputRef.current?.click()}
                                            className={`relative w-full border-2 border-dashed rounded-xl px-4 py-8 text-center cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
                                                isDragOver
                                                    ? 'border-indigo-500 bg-indigo-500/10'
                                                    : 'border-slate-300 bg-slate-50 border-slate-200/50 hover:border-slate-300 hover:bg-white shadow border-slate-200'
                                            }`}
                                        >
                                            <div className="flex flex-col items-center gap-2">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
                                                    isDragOver ? 'bg-indigo-500/20' : 'bg-slate-100'
                                                }`}>
                                                    <ImagePlus className={`w-5 h-5 ${isDragOver ? 'text-indigo-400' : 'text-slate-500'}`} />
                                                </div>
                                                <div>
                                                    <p className="text-sm text-slate-500">
                                                        <span className="text-indigo-400 font-medium">Paste (Ctrl+V)</span>
                                                        {' '}or drag & drop an image here
                                                    </p>
                                                    <p className="text-xs text-slate-600 mt-1">
                                                        Screenshot, WhatsApp chat, or any supporting image • PNG, JPEG, WebP, GIF up to 5MB
                                                    </p>
                                                </div>
                                            </div>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp,image/gif"
                                                onChange={handleFileSelect}
                                                className="hidden"
                                            />
                                        </div>
                                    ) : (
                                        <div className="relative bg-slate-50 border-slate-200 border border-slate-200 rounded-xl p-3">
                                            <div className="relative">
                                                <Image
                                                    src={imagePreview}
                                                    alt="Attachment preview"
                                                    width={600}
                                                    height={400}
                                                    className="w-full max-h-64 object-contain rounded-lg"
                                                    unoptimized
                                                />
                                                {uploading && (
                                                    <div className="absolute inset-0 bg-slate-50 border-slate-200/70 rounded-lg flex items-center justify-center">
                                                        <div className="flex items-center gap-2 text-indigo-400">
                                                            <Loader2 className="w-5 h-5 animate-spin" />
                                                            <span className="text-sm font-medium">Uploading...</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex items-center justify-between mt-2">
                                                <span className="text-xs text-slate-500">
                                                    {uploading ? 'Uploading...' : imageUrl ? '\u2713 Image attached' : 'Processing...'}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={removeImage}
                                                    className="flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {uploadError && (
                                        <p className="text-xs text-rose-400 mt-1">{uploadError}</p>
                                    )}
                                </div>

                                {/* File Upload */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">
                                        Add File <span className="text-slate-400">(Optional)</span>
                                    </label>
                                    <div className="space-y-2">
                                        {formData.fileUrls && (formData.fileUrls as string[]).length > 0 && (
                                            <div className="space-y-1.5">
                                                {(formData.fileUrls as string[]).map((url, i) => (
                                                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                                                        <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                        <span className="truncate flex-1 text-slate-700">{url.split('/').pop() || url}</span>
                                                        <button type="button" onClick={() => setFormData({ ...formData, fileUrls: (formData.fileUrls as string[]).filter((_, idx) => idx !== i) })}
                                                            className="text-rose-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <input
                                            type="file"
                                            ref={fileUploadRef}
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (!file) return;
                                                const fd = new FormData();
                                                fd.append('file', file);
                                                try {
                                                    const res = await fetch('/api/upload', { method: 'POST', body: fd });
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        setFormData(prev => ({ ...prev, fileUrls: [...((prev.fileUrls as string[]) || []), data.url] }));
                                                    }
                                                } catch {}
                                                if (fileUploadRef.current) fileUploadRef.current.value = '';
                                            }}
                                        />
                                        <button type="button" onClick={() => fileUploadRef.current?.click()}
                                            className="w-full px-4 py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-colors flex items-center justify-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            Click to upload a file (PDF, DOC, XLS, etc.)
                                        </button>
                                    </div>
                                </div>

                                {/* Reference URLs */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">
                                        Add URL / Link <span className="text-slate-400">(Optional)</span>
                                    </label>
                                    <div className="space-y-2">
                                        {formData.referenceUrls && (formData.referenceUrls as string[]).length > 0 && (
                                            <div className="space-y-1.5">
                                                {(formData.referenceUrls as string[]).map((url, i) => (
                                                    <div key={i} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                                                        <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                        <a href={url} target="_blank" rel="noopener noreferrer" className="truncate flex-1 text-indigo-600 hover:underline">{url}</a>
                                                        <button type="button" onClick={() => setFormData({ ...formData, referenceUrls: (formData.referenceUrls as string[]).filter((_, idx) => idx !== i) })}
                                                            className="text-rose-400 hover:text-rose-600"><X className="w-3.5 h-3.5" /></button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        <div className="flex gap-2">
                                            <input
                                                type="url"
                                                value={newUrlInput}
                                                onChange={(e) => setNewUrlInput(e.target.value)}
                                                placeholder="https://example.com/reference"
                                                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                                            />
                                            <button type="button" onClick={() => {
                                                if (newUrlInput.trim()) {
                                                    setFormData(prev => ({ ...prev, referenceUrls: [...((prev.referenceUrls as string[]) || []), newUrlInput.trim()] }));
                                                    setNewUrlInput('');
                                                }
                                            }}
                                                className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors flex-shrink-0">
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ===== STEP 4: Review & Submit ===== */}
                        {currentStep === 4 && (
                            <>
                                {/* Review Summary */}
                                <div className="space-y-4">
                                    {/* Section: Your Information */}
                                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-slate-700">Your Information</h3>
                                            <button type="button" onClick={() => goToStep(1, true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors">
                                                <Pencil className="w-3 h-3" /> Edit
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div className="text-slate-500">Division</div>
                                            <div className="text-slate-900 font-medium">{formData.requesterDivision || '-'}</div>
                                            <div className="text-slate-500">Full Name</div>
                                            <div className="text-slate-900 font-medium">{formData.requesterName || '-'}</div>
                                            <div className="text-slate-500">Email</div>
                                            <div className="text-slate-900 font-medium">{formData.requesterEmail || '-'}</div>
                                        </div>
                                    </div>

                                    {/* Section: Request Details */}
                                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-slate-700">Request Details</h3>
                                            <button type="button" onClick={() => goToStep(2, true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors">
                                                <Pencil className="w-3 h-3" /> Edit
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div className="text-slate-500">Request Type</div>
                                            <div className="text-slate-900 font-medium">{REQUEST_TYPES.find(rt => rt.value === formData.requestType)?.label || formData.requestType}</div>
                                            {formData.requestType === 'fix_request' && formData.brandCode && (
                                                <><div className="text-slate-500">Brand Code</div>
                                                <div className="text-slate-900 font-medium">{formData.brandCode}</div></>
                                            )}
                                            <div className="text-slate-500">Direct Request</div>
                                            <div className="text-slate-900 font-medium">
                                                {formData.isDirectRequest
                                                    ? (fbiMembers.find(m => m.id === formData.directAssigneeId)?.name || 'Yes')
                                                    : 'No'}
                                            </div>
                                            <div className="text-slate-500">Title</div>
                                            <div className="text-slate-900 font-medium">{formData.title || '-'}</div>
                                        </div>
                                    </div>

                                    {/* Section: Priority & Description */}
                                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-slate-700">Priority & Description</h3>
                                            <button type="button" onClick={() => goToStep(3, true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors">
                                                <Pencil className="w-3 h-3" /> Edit
                                            </button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                            <div className="text-slate-500">Priority</div>
                                            <div className="text-slate-900 font-medium">
                                                {(() => {
                                                    const p = PRIORITY_LEVELS.find(pl => pl.value === formData.urgency);
                                                    return p ? `${p.label} - ${p.sublabel}` : formData.urgency;
                                                })()}
                                            </div>
                                            <div className="text-slate-500">Description</div>
                                            <div
                                                className="text-slate-900 font-medium col-span-2 mt-1 bg-white rounded-lg border border-slate-200 p-3 text-sm [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_li]:my-0.5 [&_code]:bg-slate-200 [&_code]:text-rose-600 [&_code]:px-1 [&_code]:rounded"
                                                dangerouslySetInnerHTML={{ __html: formData.description || '-' }}
                                            />
                                            {imagePreview && (
                                                <>
                                                    <div className="text-slate-500">Image</div>
                                                    <div className="col-span-2 mt-1">
                                                        <Image src={imagePreview} alt="Attachment" width={300} height={200} className="max-h-40 object-contain rounded-lg" unoptimized />
                                                    </div>
                                                </>
                                            )}
                                            {(formData.fileUrls as string[])?.length > 0 && (
                                                <>
                                                    <div className="text-slate-500">Files</div>
                                                    <div className="col-span-2 mt-1 space-y-1.5">
                                                        {(formData.fileUrls as string[]).map((url, i) => (
                                                            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                                                                <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                                                                <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-600 hover:underline">{url.split('/').pop() || url}</a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                            {(formData.referenceUrls as string[])?.length > 0 && (
                                                <>
                                                    <div className="text-slate-500">Links</div>
                                                    <div className="col-span-2 mt-1 space-y-1.5">
                                                        {(formData.referenceUrls as string[]).map((url, i) => (
                                                            <div key={i} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs">
                                                                <ExternalLink className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                                                                <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-indigo-600 hover:underline">{url}</a>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Preferred Deadline (on review step) */}
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Preferred Deadline</label>
                                    <input
                                        type="date" name="dueDate"
                                        value={formData.dueDate}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            // Always default to end-of-day WIB; don't capture the click-time.
                                            setFormData(f => ({ ...f, dueDate: val, dueDateTime: val ? '23:59:59' : '' }));
                                        }}
                                        min={(() => {
                                            const d = new Date();
                                            if (formData.urgency === '5-minute') {
                                                return d.toISOString().split('T')[0];
                                            }
                                            d.setDate(d.getDate() + 1);
                                            return d.toISOString().split('T')[0];
                                        })()}
                                        style={{ colorScheme: 'light' }}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                    />
                                    <p className="text-xs text-slate-400">
                                        {formData.urgency === '5-minute' ? 'Quick tasks can be set for today' : 'Minimum deadline is tomorrow (H+1)'}
                                    </p>
                                    {formData.dueDate && formData.dueDateTime && (
                                        <p className="text-xs text-indigo-600 font-medium">
                                            Deadline: {(() => {
                                                const [y, m, d] = formData.dueDate.split('-');
                                                return `${d}/${m}/${y} ${formData.dueDateTime} WIB`;
                                            })()}
                                        </p>
                                    )}
                                </div>
                            </>
                        )}

                        {/* Validation Errors */}
                        {stepErrors.length > 0 && (
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 text-sm space-y-1">
                                {stepErrors.map((err, i) => (
                                    <p key={i} className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
                                        {err}
                                    </p>
                                ))}
                            </div>
                        )}

                        {/* Navigation Buttons */}
                        <div className="flex items-center gap-3 pt-2">
                            {editingFromReview && currentStep < 4 ? (
                                <button
                                    type="button"
                                    onClick={() => { if (validateStep(currentStep)) { setEditingFromReview(false); setCurrentStep(4); } }}
                                    className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm flex justify-center items-center gap-2 text-sm"
                                >
                                    <Check className="w-4 h-4" />
                                    Back to Review
                                </button>
                            ) : (<>
                            {currentStep > 1 && (
                                <button
                                    type="button"
                                    onClick={handleBack}
                                    className="flex-1 py-3.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-full hover:bg-slate-50 transition-all shadow-sm flex justify-center items-center gap-2 text-sm"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>
                            )}
                            {currentStep < 4 ? (
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm flex justify-center items-center gap-2 text-sm"
                                >
                                    Next
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleSubmit}
                                    disabled={loading || uploading}
                                    className="flex-1 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm disabled:opacity-50 flex justify-center items-center gap-2 text-sm"
                                >
                                    {loading ? 'Processing...' : (
                                        <>Submit Request <Send className="w-5 h-5" /></>
                                    )}
                                </button>
                            )}
                            </>)}
                        </div>
                        {currentStep === 4 && (
                            <p className="text-center text-xs text-slate-500">
                                You will receive a Task Token after you submit this forms.
                            </p>
                        )}
                    </div>
                </div>
                )}

                {/* Making Appointment Form */}
                {activeTab === 'meeting' && !meetingSuccess && (
                    <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-3xl p-6 md:p-8 shadow-xl">
                        <h2 className="text-lg font-semibold text-slate-900 mb-1">Making Appointment</h2>
                        <p className="text-sm text-slate-500 mb-6">Schedule a meeting with the FBI team</p>

                        {meetingError && (
                            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
                                {meetingError}
                            </div>
                        )}

                        <form onSubmit={handleMeetingSubmit} className="space-y-5">
                            {/* Division first, then Name */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Division / Team / Brand <span className="text-rose-500">*</span></label>
                                <select
                                    required
                                    value={meetingForm.requesterDivision}
                                    onChange={e => setMeetingForm(f => ({ ...f, requesterDivision: e.target.value }))}
                                    className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                >
                                    <option value="">Select your division...</option>
                                    {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Your Name <span className="text-rose-500">*</span></label>
                                <div className="relative">
                                    <input
                                        ref={meetingNameInputRef}
                                        type="text" required
                                        value={meetingNameInput}
                                        disabled={!meetingForm.requesterDivision}
                                        onChange={e => {
                                            setMeetingNameInput(e.target.value);
                                            setMeetingForm(f => ({ ...f, requesterName: e.target.value }));
                                            setMeetingShowSuggestions(true);
                                        }}
                                        onFocus={() => {
                                            if (meetingForm.requesterDivision) setMeetingShowSuggestions(true);
                                        }}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        placeholder={meetingForm.requesterDivision ? 'Type your name...' : 'Select division first...'}
                                        autoComplete="off"
                                    />
                                    {meetingShowSuggestions && meetingForm.requesterDivision && meetingFilteredSuggestions.length > 0 && (
                                        <div
                                            ref={meetingSuggestionsRef}
                                            className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto"
                                        >
                                            {meetingFilteredSuggestions.map((emp, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => {
                                                        setMeetingNameInput(emp.name);
                                                        setMeetingForm(f => ({ ...f, requesterName: emp.name }));
                                                        setMeetingShowSuggestions(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-indigo-50 hover:text-indigo-700 transition-colors ${
                                                        meetingNameInput === emp.name ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-slate-700'
                                                    } ${i === 0 ? 'rounded-t-xl' : ''} ${i === meetingFilteredSuggestions.length - 1 ? 'rounded-b-xl' : ''}`}
                                                >
                                                    {emp.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {meetingShowSuggestions && meetingForm.requesterDivision && meetingNameInput && meetingFilteredSuggestions.length === 0 && (
                                        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3">
                                            <p className="text-sm text-slate-400">No matching employees found</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Meeting Type */}
                            <div className="space-y-2">
                                <label className="text-sm text-slate-500 font-medium">Meeting Type <span className="text-rose-500">*</span></label>
                                <div className="grid grid-cols-2 gap-2">
                                    {MEETING_TYPES.map(mt => (
                                        <label
                                            key={mt.value}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                                                meetingForm.meetingType === mt.value
                                                    ? 'border-indigo-500 bg-indigo-500/10'
                                                    : 'border-slate-200 bg-slate-50 border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <input
                                                type="radio" name="meetingType"
                                                value={mt.value}
                                                checked={meetingForm.meetingType === mt.value}
                                                onChange={e => setMeetingForm(f => ({ ...f, meetingType: e.target.value }))}
                                                className="w-4 h-4 text-indigo-500 bg-slate-100 border-slate-300 focus:ring-indigo-500"
                                            />
                                            <span className="text-sm text-slate-700">{mt.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Meeting Title */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Meeting Title <span className="text-rose-500">*</span></label>
                                <input
                                    type="text" required
                                    value={meetingForm.title}
                                    onChange={e => setMeetingForm(f => ({ ...f, title: e.target.value }))}
                                    className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                    placeholder="e.g. Q1 Review with FBI Team"
                                />
                            </div>

                            {/* Date & Time */}
                            <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Date <span className="text-rose-500">*</span></label>
                                    <input
                                        type="date" required
                                        value={meetingForm.meetingDate}
                                        onChange={e => setMeetingForm(f => ({ ...f, meetingDate: e.target.value }))}
                                        style={{ colorScheme: 'dark' }}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">Start <span className="text-rose-500">*</span></label>
                                    <input
                                        type="time" required
                                        value={meetingForm.startTime}
                                        onChange={e => setMeetingForm(f => ({ ...f, startTime: e.target.value }))}
                                        style={{ colorScheme: 'dark' }}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm text-slate-500 font-medium">End <span className="text-rose-500">*</span></label>
                                    <input
                                        type="time" required
                                        value={meetingForm.endTime}
                                        onChange={e => setMeetingForm(f => ({ ...f, endTime: e.target.value }))}
                                        style={{ colorScheme: 'dark' }}
                                        className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm"
                                    />
                                </div>
                            </div>

                            {/* Invite Members */}
                            <div className="space-y-3">
                                <label className="text-sm text-slate-500 font-medium">Invite Members <span className="text-rose-500">*</span></label>
                                
                                {/* Selected Members Badges */}
                                {selectedUsers.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {selectedUsers.map(uid => {
                                            const u = allUsers.find(x => x.id === uid);
                                            return u ? (
                                                <div key={uid} className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/30 pl-3 pr-1 py-1 rounded-full">
                                                    <span className="text-sm font-medium text-indigo-700">{u.name}</span>
                                                    <button type="button" onClick={() => toggleUser(uid)} className="p-1 hover:bg-indigo-500/20 rounded-full text-indigo-400 transition-colors">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : null;
                                        })}
                                    </div>
                                )}

                                {/* User Select Dropdown & Add Button */}
                                {(isPickingGuest || selectedUsers.length === 0) ? (
                                    <div className="relative">
                                        <select
                                            className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors text-sm appearance-none"
                                            value=""
                                            onChange={(e) => {
                                                if (e.target.value) {
                                                    toggleUser(e.target.value);
                                                    setIsPickingGuest(false);
                                                }
                                            }}
                                        >
                                            <option value="" disabled>Select a member from FBI team...</option>
                                            {allUsers
                                                .filter(u => u.teams?.name?.toLowerCase().includes('factual business intelligence') || u.teams?.name?.toLowerCase().includes('fbi'))
                                                .filter(u => !selectedUsers.includes(u.id))
                                                .map(u => (
                                                    <option key={u.id} value={u.id}>{u.name}</option>
                                                ))}
                                        </select>
                                        <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center">
                                            <div className="w-2 h-2 border-r border-b border-slate-400 transform rotate-45 mb-1" />
                                        </div>
                                    </div>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => setIsPickingGuest(true)}
                                        className="text-sm text-indigo-500 hover:text-indigo-600 font-medium flex items-center gap-1 transition-colors"
                                    >
                                        + Add other member
                                    </button>
                                )}
                            </div>

                            {/* Description */}
                            <div className="space-y-1.5">
                                <label className="text-sm text-slate-500 font-medium">Meeting Agenda / Notes</label>
                                <textarea
                                    value={meetingForm.description}
                                    onChange={e => setMeetingForm(f => ({ ...f, description: e.target.value }))}
                                    rows={3}
                                    className="w-full bg-slate-50 border-slate-200 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors resize-none text-sm"
                                    placeholder="Describe the agenda or purpose of the meeting..."
                                />
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={meetingLoading || selectedUsers.length === 0}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-full transition-all shadow-sm disabled:opacity-50 flex justify-center items-center gap-2 text-sm"
                            >
                                {meetingLoading ? 'Submitting...' : (
                                    <><Calendar className="w-5 h-5" /> Submit Meeting Request</>  
                                )}
                            </button>
                            <p className="text-center text-xs text-slate-500">
                                This meeting request will be sent to the FBI team as a pending approval.
                            </p>
                        </form>
                    </div>
                )}

                {/* Meeting Success Screen */}
                {activeTab === 'meeting' && meetingSuccess && (
                    <div className="bg-white shadow border-slate-200 border border-slate-200 rounded-3xl p-8 text-center shadow-xl">
                        <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
                            <Calendar className="w-8 h-8" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Meeting Request Submitted!</h2>
                        <p className="text-slate-500 mb-6">
                            Your meeting request has been sent to the FBI team and is pending approval.
                        </p>
                        <button
                            onClick={() => {
                                setMeetingSuccess(false);
                                setMeetingForm({ title: '', description: '', meetingDate: '', startTime: '09:00', endTime: '10:00', meetingType: 'monthly_meeting', requesterName: '', requesterDivision: '' });
                                setSelectedUsers([]);
                            }}
                            className="py-3 px-6 bg-white border border-slate-200 text-[#0F0E7F] font-bold rounded-full shadow-sm hover:bg-slate-50 transition-colors text-sm"
                        >
                            Submit Another Meeting
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
