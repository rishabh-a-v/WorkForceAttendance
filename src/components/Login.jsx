import { useState } from 'react';
import { Shield, Key, User, AlertCircle, RefreshCw, Users } from 'lucide-react';
import { dbService } from '../db/dbService';

export default function Login({ onLoginSuccess, initialTab = 'admin' }) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'admin', 'supervisor', or 'employee'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const switchTab = (tab) => {
    setActiveTab(tab);
    setErrorMsg('');
    setUsername('');
    setPassword('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setIsLoading(true);

    // Short simulated network delay for rich loading experience
    await new Promise((resolve) => setTimeout(resolve, 800));

    // Resolve the effective username for the auth call
    const authUsername = activeTab === 'admin' ? 'admin' : username;

    if (!authUsername || !password) {
      setErrorMsg('Please specify both your username and password.');
      setIsLoading(false);
      return;
    }

    const res = await dbService.authenticate(authUsername, password);

    if (res.success) {
      // For the supervisor tab, reject anyone who isn't actually a supervisor-role employee
      if (activeTab === 'supervisor' && res.role !== 'supervisor') {
        setErrorMsg('This account does not have supervisor privileges. Please use the Employee Console instead.');
        setIsLoading(false);
        return;
      }
      onLoginSuccess(res.role, res.user);
    } else {
      setErrorMsg(res.error || 'Authentication failed.');
    }
    setIsLoading(false);
  };

  const tabConfig = [
    { key: 'admin',      label: 'Admin',      fullLabel: 'Admin Portal',      Icon: Shield, color: 'brand' },
    { key: 'supervisor', label: 'Supervisor', fullLabel: 'Supervisor Login',   Icon: Users,  color: 'violet' },
    { key: 'employee',   label: 'Employee',   fullLabel: 'Employee Console',   Icon: User,   color: 'brand' },
  ];

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-dark-950 bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950 p-4 select-none relative overflow-hidden" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      
      {/* Background ambient glowing nodes */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-brand-500/10 blur-[120px] animate-pulse pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-violet-500/10 blur-[120px] animate-pulse pointer-events-none"></div>

      {/* Login Card */}
      <div className="glass-panel w-full max-w-md rounded-3xl border border-dark-800/80 p-5 sm:p-8 space-y-6 shadow-2xl relative z-10">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className={`p-3 rounded-2xl border glow-blue text-brand-400 ${
            activeTab === 'supervisor'
              ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
              : 'bg-brand-500/10 border-brand-500/20 text-brand-400'
          }`}>
            {activeTab === 'supervisor' ? <Users className="h-8 w-8" /> : <Shield className="h-8 w-8" />}
          </div>
          <div>
            <h1 className="font-display font-extrabold text-xl text-white tracking-tight leading-none">
              TRANSWORLD
            </h1>
            <p className={`text-[10px] font-bold tracking-wider uppercase mt-1 ${
              activeTab === 'supervisor' ? 'text-violet-400' : 'text-brand-400'
            }`}>
              WorkForce Access Gate
            </p>
          </div>
        </div>

        {/* Tab Selector — 3 tabs */}
        <div className="grid grid-cols-3 bg-dark-950 p-1 rounded-xl border border-dark-850 gap-0.5">
          {tabConfig.map(({ key, label, fullLabel, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTab(key)}
              className={`py-2 rounded-lg text-[10px] font-bold transition flex items-center justify-center space-x-1 ${
                activeTab === key
                  ? key === 'supervisor'
                    ? 'bg-violet-600 text-white shadow-md'
                    : 'bg-brand-600 text-white shadow-md glow-blue'
                  : 'text-dark-400 hover:text-white'
              }`}
            >
              <Icon className="h-3 w-3 flex-shrink-0" />
              <span className="leading-none hidden sm:inline">{fullLabel}</span>
              <span className="leading-none sm:hidden">{label}</span>
            </button>
          ))}
        </div>

        {/* Role description badge */}
        <div className={`px-3 py-2 rounded-xl border text-[10px] leading-relaxed ${
          activeTab === 'admin'
            ? 'bg-brand-500/8 border-brand-500/20 text-brand-400'
            : activeTab === 'supervisor'
            ? 'bg-violet-500/8 border-violet-500/20 text-violet-300'
            : 'bg-dark-800/50 border-dark-700 text-dark-400'
        }`}>
          {activeTab === 'admin' && '🛡️ Full system access — manage employees, view reports, configure settings.'}
          {activeTab === 'supervisor' && '👥 Group & self attendance — capture group photos and bulk-mark shift attendance.'}
          {activeTab === 'employee' && '👤 Self check-in / check-out using facial biometric verification.'}
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
          
          {/* Username — locked for admin, free text for supervisor/employee */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">
              {activeTab === 'admin' ? 'Admin Username' : 'Employee ID or Name'}
            </label>
            <div className="relative">
              {activeTab === 'admin'
                ? <Shield className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
                : activeTab === 'supervisor'
                ? <Users className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
                : <User className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              }
              {activeTab === 'admin' ? (
                <input
                  type="text"
                  value="admin"
                  disabled
                  className="w-full bg-dark-900 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-dark-550 cursor-not-allowed font-bold"
                />
              ) : (
                <input
                  type="text"
                  placeholder={activeTab === 'supervisor' ? 'e.g. Jane Doe' : 'e.g. John Doe'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                  required
                />
              )}
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">Password</label>
            <div className="relative">
              <Key className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              <input
                type="password"
                placeholder={
                  activeTab === 'admin'
                    ? 'Enter admin password...'
                    : 'Enter your password...'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-brand-500"
                required
              />
            </div>
          </div>

          {/* Action Trigger */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-3 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer ${
              activeTab === 'supervisor'
                ? 'bg-violet-600 hover:bg-violet-500'
                : 'bg-brand-600 hover:bg-brand-500 glow-blue'
            }`}
          >
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <span>Sign In Securely</span>
            )}
          </button>

          <p className="text-[10px] text-dark-500 text-center leading-normal pt-2">
            {activeTab === 'admin'
              ? 'Authorized administrators only. System actions are strictly audited.'
              : activeTab === 'supervisor'
              ? 'Supervisor accounts are assigned by Admin during employee registration.'
              : 'Contact your administrator if you forgot your credentials.'
            }
          </p>
        </form>
      </div>
    </div>
  );
}
