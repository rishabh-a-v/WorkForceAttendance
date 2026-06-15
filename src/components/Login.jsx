import { useState } from 'react';
import { Users, Key, AlertCircle, RefreshCw } from 'lucide-react';
import { dbService } from '../db/dbService';

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    // Short simulated network delay for rich loading experience
    await new Promise((resolve) => setTimeout(resolve, 800));

    const authUsername = username.trim();

    if (!authUsername || !password) {
      setErrorMsg('Please specify both your username/ID and password.');
      setIsLoading(false);
      return;
    }

    const res = await dbService.authenticate(authUsername, password);

    if (res.success) {
      // For the single login portal, allow only admin and supervisor roles
      if (res.role !== 'supervisor' && res.role !== 'admin') {
        setErrorMsg('Access denied. Only supervisors are authorized to log in.');
        setIsLoading(false);
        return;
      }
      onLoginSuccess(res.role, res.user);
    } else {
      setErrorMsg(res.error || 'Authentication failed.');
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-dark-950 bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950 p-4 select-none relative overflow-hidden" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      
      {/* Background ambient glowing nodes */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-violet-500/10 blur-[120px] animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-violet-500/10 blur-[120px] pointer-events-none"></div>

      {/* Login Card */}
      <div className="glass-panel w-full max-w-md rounded-3xl border border-dark-800/80 p-5 sm:p-8 space-y-6 shadow-2xl relative z-10">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="p-3 rounded-2xl border bg-violet-500/10 border-violet-500/20 text-violet-400">
            <Users className="h-8 w-8" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-xl text-white tracking-tight leading-none">
              TRANSWORLD
            </h1>
            <p className="text-[10px] font-bold tracking-wider uppercase mt-1 text-violet-400">
              Supervisor Login Portal
            </p>
          </div>
        </div>

        {/* Role description badge */}
        <div className="px-4 py-3 bg-violet-500/8 border border-violet-500/20 rounded-xl text-[10px] leading-relaxed text-violet-300 text-center">
          👥 Group & self attendance — capture group photos and bulk-mark shift attendance.
        </div>

        {/* Error Dialog */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start space-x-2 leading-relaxed animate-in fade-in duration-200">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Username Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">
              Supervisor Username or Employee ID
            </label>
            <div className="relative">
              <Users className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              <input
                type="text"
                placeholder="e.g. Jane Doe or Admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Key className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              <input
                type="password"
                placeholder="Enter your password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Action Trigger */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <span>Sign In Securely</span>
            )}
          </button>

          <p className="text-[10px] text-dark-500 text-center leading-normal pt-2">
            Supervisor accounts are assigned by the Administrator. All authentication events are strictly audited.
          </p>
        </form>
      </div>
    </div>
  );
}
