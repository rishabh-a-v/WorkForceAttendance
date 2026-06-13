import { 
  LayoutDashboard, 
  UserCheck, 
  Users, 
  ShieldAlert, 
  UserPlus, 
  History, 
  Shield,
  User,
  Camera
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, pendingReviewsCount, portalRole = 'admin', currentUser, onLogout, onOpenChangePassword }) {
  
  // Nav items per role
  const adminItems = [
    { id: 'dashboard',    label: 'Dashboard',        icon: LayoutDashboard },
    { id: 'attendance',   label: 'Check-In / Out',   icon: UserCheck },
    { 
      id: 'verification', 
      label: 'Supervisor Queue', 
      icon: ShieldAlert,
      badge: pendingReviewsCount > 0 ? pendingReviewsCount : null
    },
    { id: 'registration', label: 'Employee Portal',  icon: UserPlus },
    { id: 'audit',        label: 'Audit Compliance', icon: History }
  ];

  const supervisorItems = [
    { id: 'supervisor-portal', label: 'Attendance Scanner', icon: Camera },
  ];

  const employeeItems = [
    { id: 'employee-portal', label: 'Employee Console', icon: User }
  ];

  const menuItems =
    portalRole === 'admin'      ? adminItems :
    portalRole === 'supervisor' ? supervisorItems :
    employeeItems;

  const handleNavClick = (id) => {
    setActiveTab(id);
  };

  const isActive = (id) => {
    return activeTab === id;
  };

  const roleLabel =
    portalRole === 'admin'      ? 'WorkForce Verifier' :
    portalRole === 'supervisor' ? 'Supervisor Console' :
    'Employee Self-Scan';

  const roleColor =
    portalRole === 'supervisor' ? 'text-violet-400' : 'text-brand-400';

  const defaultAvatar =
    portalRole === 'admin'
      ? "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%230f172a'/><text x='50' y='55' font-size='32' fill='%2338bdf8' font-weight='bold' text-anchor='middle'>A</text></svg>"
      : portalRole === 'supervisor'
      ? "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%230f172a'/><text x='50' y='55' font-size='32' fill='%238b5cf6' font-weight='bold' text-anchor='middle'>S</text></svg>"
      : "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='50' fill='%231e293b'/><circle cx='50' cy='40' r='18' fill='%2338bdf8'/><path d='M50 82c15 0 26-9 26-19c0-1-1-4-3-5c-3-1-6 0-9 1c-4 1-9 1-14 0c-3-1-6-2-9-1c-2 1-3 4-3 5c0 10 11 19 12 19z' fill='%230c85e9'/></svg>";

  const roleSubLabel =
    portalRole === 'admin'      ? 'System Administrator' :
    portalRole === 'supervisor' ? `ID: ${currentUser?.id || '—'}` :
    `ID: ${currentUser?.id || '—'}`;

  return (
    <aside className="w-64 glass-panel border-r border-dark-800 flex flex-col h-full z-20">
      {/* Brand Header */}
      <div className="p-6 border-b border-dark-900/60 flex items-center space-x-3">
        <div className={`p-2 rounded-xl border glow-blue ${
          portalRole === 'supervisor'
            ? 'bg-violet-500/10 border-violet-500/20'
            : 'bg-brand-500/10 border-brand-500/20'
        }`}>
          {portalRole === 'supervisor'
            ? <Users className="h-6 w-6 text-violet-400" />
            : <Shield className="h-6 w-6 text-brand-400" />
          }
        </div>
        <div>
          <h1 className="font-display font-bold text-sm tracking-tight text-white leading-none">
            TRANSWORLD
          </h1>
          <p className={`text-[10px] font-semibold tracking-wider uppercase mt-1 ${roleColor}`}>
            {roleLabel}
          </p>
        </div>
      </div>

      {/* User Card */}
      <div className="p-4 mx-3 my-4 bg-dark-900/40 rounded-2xl border border-dark-800/40 flex items-center space-x-3">
        <div className="relative">
          <img 
            src={currentUser?.avatar || defaultAvatar} 
            className="w-10 h-10 rounded-full border border-brand-500/20 object-cover"
            alt="User avatar" 
          />
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-dark-950 animate-pulse"></span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">
            {currentUser?.name || (portalRole === 'admin' ? 'Admin Supervisor' : 'Worker Portal')}
          </p>
          <p className="text-[10px] text-dark-400 truncate">{roleSubLabel}</p>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.id);
          const isSupvItem = item.id.startsWith('supervisor-portal');
          return (
            <button
              key={item.id}
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-xs font-medium transition-all duration-200 group ${
                active
                  ? isSupvItem
                    ? 'bg-violet-600 text-white font-semibold shadow-lg shadow-violet-600/10'
                    : 'bg-brand-600 text-white font-semibold shadow-lg shadow-brand-600/10'
                  : 'text-dark-400 hover:bg-dark-900/50 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`h-4 w-4 transition-transform duration-200 group-hover:scale-110 ${
                  active
                    ? 'text-white'
                    : isSupvItem
                    ? 'text-dark-500 group-hover:text-violet-400'
                    : 'text-dark-500 group-hover:text-brand-400'
                }`} />
                <span>{item.label}</span>
              </div>
              {item.badge && item.badge !== null && (
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                  active 
                    ? 'bg-white text-brand-600' 
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div 
        className="p-4 border-t border-dark-900/60 text-center space-y-2"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          onClick={() => onLogout?.()}
          className="w-full py-2 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-rose-400 text-[10px] font-bold rounded-xl transition duration-150 cursor-pointer flex items-center justify-center space-x-1.5"
        >
          <span>Logout Session</span>
        </button>

        {portalRole === 'admin' && (
          <button
            type="button"
            onClick={() => onOpenChangePassword?.()}
            className="w-full py-2 bg-dark-900 hover:bg-dark-850 border border-dark-800 text-brand-400 text-[10px] font-bold rounded-xl transition duration-150 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <span>Change Admin Password</span>
          </button>
        )}




        <div>
          <p className="text-[10px] text-dark-500">System v1.3.0 (Stable)</p>
          <p className="text-[9px] text-brand-500 mt-0.5">● Secure SSL Encryption</p>
        </div>
      </div>
    </aside>
  );
}
