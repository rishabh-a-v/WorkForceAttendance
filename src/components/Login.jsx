import { useState } from 'react';
import { Users, Phone, MapPin, ArrowRight } from 'lucide-react';

export default function Login({ onLoginSuccess }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [branch, setBranch] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim() || !phone.trim() || !branch) {
      setErrorMsg('All fields are required.');
      return;
    }

    onLoginSuccess('supervisor', {
      name: name.trim(),
      phone: phone.trim(),
      branch: branch
    });
  };

  const branches = [
    'Main Branch',
    'North Warehouse',
    'South Depot',
    'Airport Cargo',
    'Port Office'
  ];

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-dark-950 bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950 p-4 select-none relative overflow-hidden" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
      {/* Background ambient glowing nodes */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-violet-500/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-violet-500/10 blur-[120px] pointer-events-none"></div>

      {/* Identification Card */}
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
              Supervisor Identification
            </p>
          </div>
        </div>

        {/* Description badge */}
        <div className="px-4 py-3 bg-violet-500/8 border border-violet-500/20 rounded-xl text-[10px] leading-relaxed text-violet-300 text-center">
          👥 Enter your details below to establish your shift supervisor session.
        </div>

        {/* Error Dialog */}
        {errorMsg && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-xs flex items-start space-x-2 leading-relaxed animate-in fade-in duration-200">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          
          {/* Supervisor Name Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">
              Supervisor Name
            </label>
            <div className="relative">
              <Users className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              <input
                type="text"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Phone Number Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">
              Phone Number
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
              <input
                type="tel"
                placeholder="Enter your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors"
                required
              />
            </div>
          </div>

          {/* Branch Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-dark-450 uppercase tracking-wider">
              Branch
            </label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3.5 h-4 w-4 text-dark-500 pointer-events-none" />
              <select
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                className="w-full bg-dark-950 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-violet-500 transition-colors appearance-none cursor-pointer"
                required
              >
                <option value="" disabled>Select Branch ▼</option>
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Action Trigger */}
          <button
            type="submit"
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-xl shadow-lg flex items-center justify-center space-x-2 transition cursor-pointer"
          >
            <span>Continue</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
