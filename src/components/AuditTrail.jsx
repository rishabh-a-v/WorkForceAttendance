import React, { useState, useEffect } from 'react';
import { 
  History, 
  Search, 
  Download, 
  ShieldCheck, 
  Server, 
  Smartphone,
  Eye
} from 'lucide-react';
import { dbService } from '../db/dbService';

export default function AuditTrail() {
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedActionType, setSelectedActionType] = useState('All');
  
  // Modal viewer state for audit values
  const [activeLogDetail, setActiveLogDetail] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLogs(await dbService.getAuditLogs());
    };
    load();
  }, []);

  const actionTypes = ['All', ...new Set(logs.map(l => l.actionType))];

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.remarks.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.id.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesAction = 
      selectedActionType === 'All' || 
      log.actionType === selectedActionType;

    return matchesSearch && matchesAction;
  });

  const handleExportLogs = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Log ID,Action Type,User Account,Timestamp,IP Address,Device/UserAgent,Remarks\n";
    
    filteredLogs.forEach(log => {
      // Escape commas for safe CSV formatting
      const cleanRemarks = log.remarks.replace(/,/g, ';');
      const cleanUA = log.deviceInfo.replace(/,/g, ';');
      csvContent += `${log.id},${log.actionType},${log.user},${log.timestamp},${log.ipAddress},${cleanUA},${cleanRemarks}\n`;
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `WorkForce_Audit_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4 md:space-y-6 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-display font-extrabold text-white tracking-tight flex items-center space-x-2">
            <History className="h-6.5 w-6.5 text-brand-400" />
            <span>Audit Trail & Compliance Trail</span>
          </h2>
          <p className="text-xs text-dark-400 mt-1">
            Complete cryptographic audit trail of system events, demographic registrations, and manual clock overrides.
          </p>
        </div>
        
        <button
          onClick={handleExportLogs}
          className="px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-bold rounded-xl shadow-lg glow-blue transition duration-150 flex items-center space-x-1.5"
          title="Export audit trail to CSV file"
        >
          <Download className="h-4 w-4" />
          <span>Export Logs (CSV)</span>
        </button>
      </div>

      {/* Grid Filter Bar */}
      <div className="glass-panel p-4 rounded-xl border border-dark-800/60 flex flex-col md:flex-row items-center gap-4 text-xs">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search remarks, users, or log ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-dark-950/60 border border-dark-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-dark-100 focus:outline-none focus:border-brand-500"
          />
        </div>

        <div className="flex flex-col space-y-1 w-full md:w-60">
          <select
            value={selectedActionType}
            onChange={(e) => setSelectedActionType(e.target.value)}
            className="bg-dark-950 border border-dark-800 rounded-xl px-4 py-2.5 text-xs text-dark-300 focus:outline-none focus:border-brand-500 w-full"
          >
            <option value="All">All Event Types</option>
            {actionTypes.filter(t => t !== 'All').map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Data Table */}
      <div className="flex-1 glass-panel rounded-2xl border border-dark-800/60 overflow-hidden flex flex-col">
        <div className="overflow-x-auto overflow-y-auto max-h-[460px] flex-1">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-dark-950/80 sticky top-0 border-b border-dark-900/80 text-dark-400 font-semibold z-10">
              <tr>
                <th className="p-4 whitespace-nowrap">Log ID</th>
                <th className="p-4 whitespace-nowrap">Event Type</th>
                <th className="p-4 whitespace-nowrap">Actioning User</th>
                <th className="p-4 whitespace-nowrap">Timestamp</th>
                <th className="p-4 whitespace-nowrap">Source IP</th>
                <th className="p-4 whitespace-nowrap">Compliance Details</th>
                <th className="p-4 text-center whitespace-nowrap">Payload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-900/40 text-dark-200">
              {filteredLogs.slice().reverse().map((log) => (
                <tr key={log.id} className="hover:bg-dark-900/10 transition">
                  <td className="p-4 font-mono font-bold text-brand-400 whitespace-nowrap">{log.id}</td>
                  <td className="p-4">
                    <span className="px-2.5 py-0.5 bg-dark-900 border border-dark-800 rounded-md text-[10px] font-bold text-dark-300 uppercase tracking-wider">
                      {log.actionType}
                    </span>
                  </td>
                  <td className="p-4 font-bold text-white">{log.user}</td>
                  <td className="p-4 font-medium">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="p-4 font-mono text-dark-400 whitespace-nowrap">
                    <div className="flex items-center space-x-1">
                      <Server className="h-3 w-3 text-dark-500" />
                      <span>{log.ipAddress}</span>
                    </div>
                  </td>
                  <td className="p-4 text-dark-300 font-medium leading-relaxed max-w-sm truncate" title={log.remarks}>
                    {log.remarks}
                  </td>
                  <td className="p-4 text-center whitespace-nowrap">
                    {(log.oldValue || log.newValue) ? (
                      <button
                        onClick={() => setActiveLogDetail(log)}
                        className="p-1.5 bg-dark-900 hover:bg-dark-800 border border-dark-800 rounded-lg text-brand-400 hover:text-brand-300 transition"
                        title="View payload state values"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="text-dark-600">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan="7" className="text-center py-12 text-dark-500">
                    No compliance logs found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Payload State Viewer */}
      {activeLogDetail && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-dark-950 border border-dark-800 w-full max-w-2xl rounded-2xl p-6 flex flex-col space-y-4 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-dark-900/80 pb-3">
              <h4 className="font-display font-extrabold text-sm text-white">
                Compliance Payload Viewer • {activeLogDetail.id}
              </h4>
              <button
                onClick={() => setActiveLogDetail(null)}
                className="text-xs text-dark-500 hover:text-white"
              >
                Close (ESC)
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-[10px] uppercase font-bold text-dark-500 mb-1.5">Original State (Old Value)</p>
                <div className="bg-dark-900/40 p-3 rounded-xl border border-dark-850 h-44 overflow-y-auto font-mono text-[10px] text-dark-400 whitespace-pre-wrap leading-relaxed">
                  {activeLogDetail.oldValue ? JSON.stringify(JSON.parse(activeLogDetail.oldValue), null, 2) : 'NULL'}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold text-dark-500 mb-1.5">Transacted State (New Value)</p>
                <div className="bg-dark-900/40 p-3 rounded-xl border border-dark-850 h-44 overflow-y-auto font-mono text-[10px] text-emerald-400/90 whitespace-pre-wrap leading-relaxed">
                  {activeLogDetail.newValue ? (
                    activeLogDetail.newValue.startsWith('{') 
                      ? JSON.stringify(JSON.parse(activeLogDetail.newValue), null, 2)
                      : activeLogDetail.newValue
                  ) : 'NULL'}
                </div>
              </div>
            </div>

            <div className="p-3 bg-dark-900/20 border border-dark-850 rounded-xl text-[10px] text-dark-400 space-y-1">
              <div className="flex justify-between">
                <span>Action: <strong>{activeLogDetail.actionType}</strong></span>
                <span>User: <strong>{activeLogDetail.user}</strong></span>
              </div>
              <div className="flex justify-between">
                <span className="truncate max-w-[300px]">Agent: {activeLogDetail.deviceInfo}</span>
                <span>IP: {activeLogDetail.ipAddress}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
