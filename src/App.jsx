import { useState, useEffect } from 'react';
import SupervisorPortal from './components/SupervisorPortal';
import Login from './components/Login';
import { dbService } from './db/dbService';

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    const stored = localStorage.getItem('wf_session_user');
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    // Hydrate local database tables on initial mount
    dbService.initialize();
  }, []);

  const handleLoginSuccess = (role, user) => {
    setCurrentUser(user);
    localStorage.setItem('wf_session_user', JSON.stringify(user));
    localStorage.setItem('wf_session_role', role);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('wf_session_user');
    localStorage.removeItem('wf_session_role');
    localStorage.removeItem('wf_employee_login');
  };

  if (!currentUser) {
    return (
      <Login 
        onLoginSuccess={handleLoginSuccess} 
      />
    );
  }

  return (
    <div className="flex h-[100dvh] w-screen bg-dark-950 overflow-hidden text-dark-50 select-none flex-col">
      <main className="flex-1 flex flex-col overflow-hidden bg-gradient-to-br from-dark-950 via-dark-900 to-dark-950">
        <SupervisorPortal currentUser={currentUser} onLogout={handleLogout} />
      </main>
    </div>
  );
}
