'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/auth-client';
import { useAuth } from '@/lib/auth-context';
import {
  User, Camera, Lock, Eye, EyeOff, Check, AlertCircle,
  Circle, Clock, MinusCircle, XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfileData {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: string;
  status: string;
  team_id: string | null;
  team_name: string | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', icon: Circle, color: 'text-emerald-500', bg: 'bg-emerald-500' },
  { value: 'away', label: 'Away', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500' },
  { value: 'busy', label: 'Busy', icon: MinusCircle, color: 'text-rose-500', bg: 'bg-rose-500' },
  { value: 'offline', label: 'Offline', icon: XCircle, color: 'text-slate-400', bg: 'bg-slate-400' },
];

export default function ProfilePage() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const { profile: authProfile } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit states
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState('active');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');

  // Password states
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Image upload
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.push('/login');
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (!session) return;
    fetchProfile();
  }, [session]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setEditName(data.name);
        setEditStatus(data.status || 'active');
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileError('');
    setProfileSuccess('');

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, status: editStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      setProfileSuccess('Profile updated successfully');
      fetchProfile();
      setTimeout(() => setProfileSuccess(''), 3000);
    } catch (err: any) {
      setProfileError(err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/profile/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to change password');
      }

      setPasswordSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (err: any) {
      setPasswordError(err.message);
    } finally {
      setSavingPassword(false);
    }
  };

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setProfileError('Only PNG, JPEG, WebP, and GIF images are allowed');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Image must be under 2MB');
      return;
    }

    setUploadingImage(true);
    setProfileError('');

    try {
      // Resize and convert to base64
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSize = 256;
            let w = img.width, h = img.height;
            if (w > h) { h = (h / w) * maxSize; w = maxSize; }
            else { w = (w / h) * maxSize; h = maxSize; }
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
          };
          img.onerror = reject;
          img.src = e.target?.result as string;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      });

      if (res.ok) {
        fetchProfile();
        setProfileSuccess('Profile picture updated');
        setTimeout(() => setProfileSuccess(''), 3000);
      } else {
        throw new Error('Failed to save profile picture');
      }
    } catch (err: any) {
      setProfileError(err.message || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session || !profile) return null;

  const currentStatus = STATUS_OPTIONS.find((s) => s.value === editStatus) || STATUS_OPTIONS[0];

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
          <User className="w-5 h-5 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Profile Settings</h1>
          <p className="text-sm text-slate-400">Manage your account and preferences</p>
        </div>
      </div>

      {/* Profile Picture + Info Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start gap-6">
          {/* Avatar */}
          <div className="relative group">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.name}
                  className="w-20 h-20 object-cover"
                />
              ) : (
                profile.name.charAt(0).toUpperCase()
              )}
            </div>
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage}
              className="absolute inset-0 bg-black/40 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              {uploadingImage ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageUpload(e.target.files)}
            />
            {/* Status dot */}
            <div className={cn('absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white', currentStatus.bg)} />
          </div>

          {/* Info */}
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800">{profile.name}</h2>
            <p className="text-sm text-slate-400">{profile.email}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-medium capitalize">
                {profile.role}
              </span>
              {profile.team_name && (
                <span className="text-xs text-slate-400">
                  {profile.team_name}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-300 mt-2">
              Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {/* Edit Profile */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h3 className="text-sm font-bold text-slate-700 mb-4">Edit Profile</h3>

        {profileSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600 text-sm mb-4">
            <Check className="w-4 h-4" />
            {profileSuccess}
          </div>
        )}
        {profileError && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm mb-4">
            <AlertCircle className="w-4 h-4" />
            {profileError}
          </div>
        )}

        <div className="space-y-4">
          {/* Username */}
          <div>
            <label className="text-sm font-medium text-slate-600">Display Name</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-medium text-slate-600">Status</label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setEditStatus(opt.value)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all',
                    editStatus === opt.value
                      ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                      : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
                  )}
                >
                  <div className={cn('w-2.5 h-2.5 rounded-full', opt.bg)} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile || !editName.trim()}
            className="w-full py-2.5 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {savingProfile ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-700">Change Password</h3>
        </div>

        {passwordSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-600 text-sm mb-4">
            <Check className="w-4 h-4" />
            {passwordSuccess}
          </div>
        )}
        {passwordError && (
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-sm mb-4">
            <AlertCircle className="w-4 h-4" />
            {passwordError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          {/* Current password */}
          <div>
            <label className="text-sm font-medium text-slate-600">Current Password</label>
            <div className="relative mt-1">
              <input
                type={showCurrentPw ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPw(!showCurrentPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrentPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="text-sm font-medium text-slate-600">New Password</label>
            <div className="relative mt-1">
              <input
                type={showNewPw ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="text-sm font-medium text-slate-600">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full mt-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-rose-500 mt-1">Passwords do not match</p>
            )}
          </div>

          <button
            type="submit"
            disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword}
            className="w-full py-2.5 bg-slate-800 text-white font-semibold rounded-xl hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
          >
            {savingPassword ? 'Changing...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
