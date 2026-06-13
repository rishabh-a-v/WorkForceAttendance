import { useState } from 'react';
import { X, Lock, KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { dbService } from '../db/dbService';

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMsg('All fields are required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('New passwords do not match.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMsg('Password must be at least 4 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Admin password change
      const res = dbService.changePassword('admin', currentPassword, newPassword, true);
      
      if (res.success) {
        setSuccessMsg('Admin password updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setErrorMsg(res.error || 'Failed to update admin password.');
      }
    } catch (err) {
      setErrorMsg('An unexpected error occurred.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50">
      <div className="bg-dark-950 border border-dark-800 w-full max-w-md rounded-3xl p-6 flex flex-col space-y-5 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-xs">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-dark-900 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-lg">
              <KeyRound className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-sm text-white">Change Admin Password</h3>
              <p className="text-[10px] text-dark-500 mt-0.5">Secure your administrator session console credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-dark-500 hover:text-white rounded-lg transition"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[10px] rounded-xl flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] rounded-xl flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Current Admin Password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="custom-input pr-10 w-full text-xs"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white"
              >
                {showCurrent ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">New Admin Password</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="custom-input pr-10 w-full text-xs"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white"
              >
                {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div className="flex flex-col space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-dark-400">Confirm New Password</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="custom-input pr-10 w-full text-xs"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500 hover:text-white"
              >
                {showConfirm ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 py-2 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-white font-bold rounded-xl transition duration-150 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2 bg-brand-650 hover:bg-brand-600 border border-brand-500/20 text-white font-bold rounded-xl transition duration-150 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
