import React, { useState, useEffect } from 'react';
import { Menu, X, Shield, Users } from 'lucide-react';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import AttendanceScanner from './components/AttendanceScanner';
import SupervisorQueue from './components/SupervisorQueue';
import RegisterEmployee from './components/RegisterEmployee';
import AuditTrail from './components/AuditTrail';
import EmployeePortal from './components/EmployeePortal';
import SupervisorPortal from './components/SupervisorPortal';
import Login from './components/Login';
import { dbService } from './db/dbService';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem('wf_session_user');
    return stored ? JSON.parse(stored) : null;
  });
  
  const [portalRole, setPortalRole] = useState(() => {
    return localStorage.getItem('wf_session_role') || 'admin';
  });

  const [activeTab, setActiveTab] = useState(() => {
    const role = localStorage.getItem('wf_session_role') || 'admin';
    if (role === 'admin')      return 'dashboard';
    if (role === 'supervisor') return 'supervisor-portal';
    return 'employee-portal';
  });

  const [pendingReviewsCount, setPendingReviewsCount] = useState(0);
  const [loginInitialTab, setLoginInitialTab] = useState('admin');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);


  useEffect(() => {
    // Hydrate local database tables on initial mount
    dbService.initialize();
    updatePendingBadge();
  }, []);

  const updatePendingBadge = () => {
    const logs = dbService.getAttendance();
    const reviews = logs.filter(a => a.verificationStatus === 'Verification Required').length;
    setPendingReviewsCount(reviews);
  };

  const handleLoginSuccess = (role, user) => {
    setCurrentUser(user);
    setPortalRole(role);
    setLoginInitialTab(role);
    localStorage.setItem('wf_session_user', JSON.stringify(user));
    localStorage.setItem('wf_session_role', role);

    if (role === 'admin') {
      setActiveTab('dashboard');
    } else if (role === 'supervisor') {
      setActiveTab('supervisor-portal');
      localStorage.setItem('wf_employee_login', user.id);
    } else {
      setActiveTab('employee-portal');
      localStorage.setItem('wf_employee_login', user.id);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setPortalRole('admin');
    setLoginInitialTab('admin');
    localStorage.removeItem('wf_session_user');
    localStorage.removeItem('wf_session_role');
    localStorage.removeItem('wf_employee_login');
    setActiveTab('dashboard');
  };

  const handleSwitchRole = (targetRole) => {
    setCurrentUser(null);
    setPortalRole(targetRole);
    setLoginInitialTab(targetRole);
    localStorage.removeItem('wf_session_user');
    localStorage.removeItem('wf_session_role');
    localStorage.removeItem('wf_employee_login');
    if (targetRole === 'admin')           setActiveTab('dashboard');
    else if (targetRole === 'supervisor') setActiveTab('supervisor-portal');
    else                                  setActiveTab('employee-portal');
  };

  const renderActiveComponent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'attendance':
        return <AttendanceScanner />;
      case 'verification':
        return (
          <SupervisorQueue 
            onActionTriggered={() => {
              updatePendingBadge();
            }} 
          />
        );
      case 'registration':
        return <RegisterEmployee />;
      case 'audit':
        return <AuditTrail />;
      case 'employee-portal':
        return <EmployeePortal currentUser={currentUser} onLogout={handleLogout} />;
      case 'supervisor-portal':
        return <SupervisorPortal currentUser={currentUser} onLogout={handleLogout} />;
      default:
        return <Dashboard />;
    }
  };

  if (!currentUser) {
    return (
      <Login 
        onLoginSuccess={handleLoginSuccess} 
        initialTab={loginInitialTab} 
      />
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen bg-dark-950 overflow-hidden text-dark-50 select-none flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div 
        className="flex md:hidden items-center justify-between px-4 py-3 bg-dark-950 border-b border-dark-900 z-30"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-brand-500/10 border border-brand-500/20 text-brand-400">
            {portalRole === 'supervisor' ? <Users className="h-4 w-4 text-violet-400" /> : <Shield className="h-4 w-4 text-brand-400" />}
          </div>
          <span className="font-display font-bold text-xs tracking-tight text-white">TRANSWORLD</span>
        </div>
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-1.5 text-dark-400 hover:text-white rounded-lg border border-dark-850 cursor-pointer"
        >
          {isSidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {/* Backdrop overlay for mobile screen drawer */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Navigation Sidebar Panel */}
      <div className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition-transform duration-200 ease-in-out z-30 md:z-10 h-full`}>
        <Sidebar 
          activeTab={activeTab} 
          setActiveTab={(tab) => {
            setActiveTab(tab);
            setIsSidebarOpen(false); // Auto close sidebar on tab switch
          }} 
          pendingReviewsCount={pendingReviewsCount} 
          portalRole={portalRole}
          currentUser={currentUser}
          onLogout={handleLogout}
          onSwitchRole={handleSwitchRole}
        />
      </div>

      {/* Main Core Router Viewport */}
      <main className="flex-1 flex flex-col h-full overflow-hidden bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950">
        {renderActiveComponent()}
      </main>
    </div>
  );
}
