import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
  Smartphone,
  CheckCircle2,
  Bot,
  MessageSquare,
  Activity,
  Settings,
  X,
  Save,
  Plus,
  Database,
  BrainCircuit,
  Copy,
  Files,
  Menu,
  HelpCircle,
  ArrowLeft,
  Pencil,
  Trash2,
  Link2,
  Inbox,
  Send,
  LogOut
} from 'lucide-react';
import './App.css';
import './dashboard.css';

type LogEntry = {
  id: string;
  type: 'info' | 'message_in' | 'message_out' | 'error';
  text: string;
  timestamp: string;
};

type KnowledgeItem = {
  id: string;
  title: string; // Keep for compatibility if needed, but we'll mainly use content as the "Aturan"
  content: string;
};

type BotSettings = {
  botEnabled: boolean;
  ignoreGroups: boolean;
  systemPrompt: string;
  knowledgeItems: KnowledgeItem[];
  ignoredNumbers: string[];
};

// Pakai hostname yang sedang dibuka, supaya dashboard juga bisa diakses dari HP di jaringan WiFi yang sama
const SERVER_URL = import.meta.env.VITE_SERVER_URL || `${window.location.protocol}//${window.location.hostname}:3001`;

function App() {
  const [status, setStatus] = useState<'connecting' | 'waiting_qr' | 'connected' | 'error'>('connecting');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const logListRef = useRef<HTMLDivElement>(null);

  // Mobile view state
  const [mobileView, setMobileView] = useState<'status' | 'logs'>('status');
  const [seenLogCount, setSeenLogCount] = useState(0);

  // Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'knowledge' | 'general'>('knowledge');

  const [settings, setSettings] = useState<BotSettings>({
    botEnabled: true,
    ignoreGroups: true,
    systemPrompt: 'Anda adalah asisten AI pintar.',
    knowledgeItems: [],
    ignoredNumbers: []
  });

  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);

  const addLog = (type: LogEntry['type'], text: string) => {
    setLogs(prev => [...prev, {
      id: Date.now().toString() + Math.random().toString(),
      type,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }]);
  };

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      setStatus('waiting_qr');
      addLog('info', 'Terhubung ke server lokal...');
    });

    newSocket.on('disconnect', () => {
      setStatus('error');
      addLog('error', 'Terputus dari server!');
    });

    newSocket.on('qr', (qrDataUrl: string) => {
      setQrCode(qrDataUrl);
      setStatus('waiting_qr');
      addLog('info', 'QR Code baru diterima. Silakan scan melalui WhatsApp.');
    });

    newSocket.on('ready', () => {
      setStatus('connected');
      addLog('info', 'WhatsApp Client siap dan terhubung ke akun Anda!');
    });

    newSocket.on('settings', (receivedSettings: BotSettings) => {
      setSettings({
        ...receivedSettings,
        knowledgeItems: receivedSettings.knowledgeItems || [],
        ignoredNumbers: receivedSettings.ignoredNumbers || []
      });
    });

    newSocket.on('message_in', (data: { from: string, body: string }) => {
      addLog('message_in', `Masuk dari ${data.from.split('@')[0]}: "${data.body}"`);
    });

    newSocket.on('message_out', (data: { to: string, body: string }) => {
      addLog('message_out', `AI Membalas ke ${data.to.split('@')[0]}: "${data.body}"`);
    });

    newSocket.on('logout_success', () => {
      addLog('info', 'Berhasil logout dari WhatsApp.');
      setStatus('waiting_qr');
      setQrCode(null);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Auto-scroll log ke bawah (scroll container saja, bukan seluruh halaman)
  useEffect(() => {
    const el = logListRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [logs, mobileView]);

  // Tandai log sudah dibaca saat tab Log dibuka di HP
  useEffect(() => {
    if (mobileView === 'logs') setSeenLogCount(logs.length);
  }, [mobileView, logs.length]);

  // Kunci tombol Escape untuk menutup modal / sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showModal) setShowModal(false);
      else if (sidebarOpen) setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showModal, sidebarOpen]);

  const unreadLogs = Math.max(0, logs.length - seenLogCount);
  const incomingCount = logs.filter(l => l.type === 'message_in').length;
  const repliedCount = logs.filter(l => l.type === 'message_out').length;

  // Sync back to backend whenever knowledgeItems or other settings change
  // We do it directly on save rule
  const handleSaveSettings = (newSettings: BotSettings) => {
    if (socket) {
      socket.emit('update_settings', newSettings);
      addLog('info', 'Pengaturan berhasil disimpan ke Database!');
    }
  };

  const openAdmin = () => {
    setShowSettings(true);
    setSidebarOpen(false);
  };

  const handleLogout = () => {
    if (socket) {
      if (window.confirm("Yakin ingin logout dari WhatsApp? Anda harus scan QR ulang nanti.")) {
        socket.emit('logout');
        setStatus('connecting'); 
      }
    }
  };

  const selectTab = (tab: 'knowledge' | 'general') => {
    setActiveTab(tab);
    setSidebarOpen(false);
  };

  const openAddModal = () => {
    setEditingItem({ id: '', title: 'Aturan', content: '' });
    setShowModal(true);
  };

  const openEditModal = (item: KnowledgeItem) => {
    setEditingItem(item);
    setShowModal(true);
  };

  const saveKnowledgeItem = () => {
    if (!editingItem || !editingItem.content) return;

    let newItems = [...settings.knowledgeItems];
    const index = newItems.findIndex(i => i.id === editingItem.id);

    if (index >= 0) {
      newItems[index] = editingItem;
    } else {
      newItems.push({ ...editingItem, id: Date.now().toString() });
    }

    const updatedSettings = { ...settings, knowledgeItems: newItems };
    setSettings(updatedSettings);
    handleSaveSettings(updatedSettings);
    setShowModal(false);
    setEditingItem(null);
  };

  const deleteKnowledgeItem = (id: string) => {
    const updatedSettings = {
      ...settings,
      knowledgeItems: settings.knowledgeItems.filter(i => i.id !== id)
    };
    setSettings(updatedSettings);
    handleSaveSettings(updatedSettings);
  };

  const copyRule = () => {
    if (editingItem?.content) navigator.clipboard?.writeText(editingItem.content);
  };

  const isOnline = status !== 'error';

  return (
    <div className="app-container sc-app">
      {/* HEADER UTAMA APLIKASI */}
      <header className="sc-header">
        <div className="sc-brand">
          <div className="sc-brand-logo">
            <Bot size={22} color="var(--accent-color)" />
          </div>
          <div className="sc-brand-text">
            <h1 className="sc-brand-title">
              <span className="sc-gradient-text">SukaCoding</span>
              <span className="sc-title-suffix">AI Controller</span>
              <span className="sc-badge-pro">PRO</span>
            </h1>
            <span className="sc-brand-sub">WhatsApp Automation Suite</span>
          </div>
        </div>

        <div className="sc-header-actions">
          <div className="sc-status-pill" title={`Server ${isOnline ? 'Online' : 'Offline'}`}>
            <span className={`sc-dot ${isOnline ? '' : 'off'}`} />
            <span className="sc-status-text">{isOnline ? 'Online' : 'Offline'}</span>
          </div>
          <button id="btn-open-admin" className="sc-btn-admin" onClick={openAdmin}>
            <Database size={18} />
            Buka Panel Admin
          </button>
        </div>
      </header>

      <main className="sc-main" data-view={mobileView}>
        {/* Left Panel - Connection / QR */}
        <section className="sc-status-panel" aria-label="Status koneksi WhatsApp">
          {status === 'connecting' && (
            <div className="sc-center">
              <Activity size={48} color="var(--text-secondary)" className="sc-connecting" style={{ marginBottom: 20 }} />
              <h2>Menghubungkan ke Server...</h2>
            </div>
          )}

          {status === 'error' && (
            <div className="sc-center">
              <Activity size={48} color="#ef4444" style={{ marginBottom: 20 }} />
              <h2>Server Tidak Terhubung</h2>
              <p>Pastikan backend sudah berjalan (<code>node index.js</code>) di port 3001.</p>
            </div>
          )}

          {status === 'waiting_qr' && (
            <div className="sc-card">
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <Smartphone size={44} color="var(--accent-color)" />
              </div>
              <h2>Tautkan Perangkat</h2>
              <p>Buka WhatsApp di HP Anda &gt; Tautkan Perangkat &gt; Arahkan kamera ke QR Code ini.</p>

              {qrCode ? (
                <div className="sc-qr-box">
                  <img src={qrCode} alt="WhatsApp QR Code" />
                </div>
              ) : (
                <div className="sc-qr-placeholder">
                  <span className="sc-connecting">Memuat QR Code...</span>
                </div>
              )}
            </div>
          )}

          {status === 'connected' && (
            <div className="sc-center">
              <div className="sc-connected-icon">
                <CheckCircle2 size={48} color="var(--accent-color)" />
              </div>
              <h2 className="sc-connected-title">WhatsApp Terhubung!</h2>
              <p>Bot AI aktif dan siap membalas pelanggan. Buka Panel Admin untuk melatih AI dan menambah aturan.</p>

              <div className="sc-stats">
                <div className="sc-stat">
                  <Inbox size={18} className="sc-stat-icon" />
                  <div className="sc-stat-value">{incomingCount}</div>
                  <div className="sc-stat-label">Masuk</div>
                </div>
                <div className="sc-stat">
                  <Send size={18} className="sc-stat-icon" />
                  <div className="sc-stat-value">{repliedCount}</div>
                  <div className="sc-stat-label">Dibalas</div>
                </div>
                <div className="sc-stat">
                  <BrainCircuit size={18} className="sc-stat-icon" />
                  <div className="sc-stat-value">{settings.knowledgeItems.length}</div>
                  <div className="sc-stat-label">Aturan</div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
                <button id="btn-cta-admin" className="sc-btn-cta" onClick={openAdmin}>
                  <Database size={18} /> Buka Panel Admin
                </button>
                <button 
                  className="sc-btn-outline" 
                  onClick={handleLogout}
                  style={{ color: '#ef4444', borderColor: '#ef4444' }}
                >
                  <LogOut size={18} /> Logout
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Right Panel - Live Logs */}
        <section className="sc-log-panel" aria-label="Live Activity Log">
          <div className="sc-log-header">
            <h3 className="sc-log-title">
              <Activity size={18} color="var(--accent-color)" />
              Live Activity Log
            </h3>
            <span className="sc-log-count">{logs.length} event</span>
          </div>

          <div className="sc-log-list" ref={logListRef}>
            {logs.length === 0 ? (
              <div className="sc-empty">
                <MessageSquare size={32} opacity={0.3} />
                <span>Belum ada aktivitas.</span>
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className={`sc-log-item ${log.type}`}>
                  <span className="sc-log-time">[{log.timestamp}]</span>
                  <span className="sc-log-text">{log.text}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* BOTTOM NAV - hanya muncul di HP */}
      <nav className="sc-bottom-nav" aria-label="Navigasi utama">
        <button
          id="nav-status"
          className={mobileView === 'status' ? 'active' : ''}
          onClick={() => setMobileView('status')}
        >
          <Link2 size={20} />
          Koneksi
        </button>
        <button
          id="nav-logs"
          className={mobileView === 'logs' ? 'active' : ''}
          onClick={() => setMobileView('logs')}
        >
          <Activity size={20} />
          Activity Log
          {unreadLogs > 0 && mobileView !== 'logs' && (
            <span className="sc-nav-badge">{unreadLogs > 99 ? '99+' : unreadLogs}</span>
          )}
        </button>
        <button id="nav-admin" onClick={openAdmin}>
          <Database size={20} />
          Admin
        </button>
      </nav>

      {/* FULL SCREEN ADMIN PANEL OVERLAY */}
      {showSettings && (
        <div className={`sc-admin ${sidebarOpen ? 'sidebar-open' : ''}`}>
          <div className="sc-sidebar-backdrop" onClick={() => setSidebarOpen(false)} />

          {/* SIDEBAR */}
          <aside className="sc-admin-sidebar">
            <div className="sc-admin-sidebar-head">
              <span className="sc-admin-sidebar-title">Panel Admin</span>
              <button className="sc-icon-btn sc-sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Tutup menu">
                <X size={20} />
              </button>
            </div>

            <button
              id="tab-knowledge"
              className={`sc-nav-item ${activeTab === 'knowledge' ? 'active' : ''}`}
              onClick={() => selectTab('knowledge')}
            >
              <BrainCircuit size={18} />
              <span>Ajari AI (Knowledge Base)</span>
            </button>

            <button
              id="tab-general"
              className={`sc-nav-item ${activeTab === 'general' ? 'active' : ''}`}
              onClick={() => selectTab('general')}
            >
              <Settings size={18} />
              <span>Pengaturan Bot</span>
            </button>

            <div className="sc-admin-sidebar-foot">
              <button id="btn-back-dashboard" className="sc-btn-back" onClick={() => setShowSettings(false)}>
                <ArrowLeft size={16} /> Kembali ke Dashboard
              </button>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <div className="sc-admin-main">
            <div className="sc-admin-topbar">
              <button className="sc-icon-btn sc-hamburger" onClick={() => setSidebarOpen(true)} aria-label="Buka menu">
                <Menu size={22} />
              </button>
              <span className="sc-admin-topbar-title">
                {activeTab === 'knowledge' ? 'Knowledge Base' : 'Pengaturan Bot'}
              </span>
              <button className="sc-btn-guide">
                <HelpCircle size={16} /> Panduan
              </button>
            </div>

            <div className="sc-admin-content">
              {activeTab === 'knowledge' && (
                <>
                  <div className="sc-section-head">
                    <h2 className="sc-section-title">Knowledge Base</h2>
                    <button id="btn-add-rule" className="sc-btn-outline" onClick={openAddModal}>
                      <Plus size={18} /> Tambah Aturan
                    </button>
                  </div>

                  <div className="sc-table-card">
                    <table className="sc-table">
                      <thead>
                        <tr>
                          <th>ATURAN</th>
                          <th>AKSI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {settings.knowledgeItems.length === 0 ? (
                          <tr>
                            <td colSpan={2} className="sc-table-empty">
                              Belum ada aturan. Klik "Tambah Aturan" untuk mulai mengajari AI.
                            </td>
                          </tr>
                        ) : (
                          settings.knowledgeItems.map(item => (
                            <tr key={item.id}>
                              <td className="sc-rule-text">{item.content}</td>
                              <td>
                                <div className="sc-row-actions">
                                  <button className="sc-link-btn edit" onClick={() => openEditModal(item)}>
                                    <Pencil size={14} /> Edit
                                  </button>
                                  <button className="sc-link-btn delete" onClick={() => deleteKnowledgeItem(item.id)}>
                                    <Trash2 size={14} /> Hapus
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {activeTab === 'general' && (
                <>
                  <div className="sc-section-head">
                    <h2 className="sc-section-title">Pengaturan Global</h2>
                  </div>
                  <div className="sc-settings-card">
                    <div className="sc-setting-row">
                      <div>
                        <h4>Aktifkan Bot AI</h4>
                        <p>Izinkan AI membalas pesan secara otomatis</p>
                      </div>
                      <label className="sc-switch">
                        <input
                          id="toggle-bot-enabled"
                          type="checkbox"
                          checked={settings.botEnabled}
                          onChange={e => {
                            const updated = { ...settings, botEnabled: e.target.checked };
                            setSettings(updated);
                            handleSaveSettings(updated);
                          }}
                        />
                        <span className="sc-slider" />
                      </label>
                    </div>

                    <div className="sc-setting-row">
                      <div>
                        <h4>Abaikan Pesan Grup</h4>
                        <p>Jangan balas pesan yang berasal dari Grup WhatsApp</p>
                      </div>
                      <label className="sc-switch">
                        <input
                          id="toggle-ignore-groups"
                          type="checkbox"
                          checked={settings.ignoreGroups}
                          onChange={e => {
                            const updated = { ...settings, ignoreGroups: e.target.checked };
                            setSettings(updated);
                            handleSaveSettings(updated);
                          }}
                        />
                        <span className="sc-slider" />
                      </label>
                    </div>

                    <div className="sc-setting-block">
                      <h4>Instruksi Dasar AI (System Prompt)</h4>
                      <p>Berikan kepribadian atau tugas utama untuk AI.</p>
                      <textarea
                        id="input-system-prompt"
                        className="sc-textarea"
                        value={settings.systemPrompt}
                        onChange={e => setSettings({ ...settings, systemPrompt: e.target.value })}
                        onBlur={() => handleSaveSettings(settings)}
                        rows={5}
                      />
                    </div>

                    <div className="sc-setting-block" style={{ marginTop: '20px' }}>
                      <h4>Daftar Nomor Hitam (Ignored Numbers)</h4>
                      <p>Masukkan nomor WhatsApp yang TIDAK BOLEH dibalas oleh AI (pisahkan dengan koma). Contoh: 6281234567, 6289876543</p>
                      <textarea
                        id="input-ignored-numbers"
                        className="sc-textarea"
                        value={(settings.ignoredNumbers || []).join(', ')}
                        onChange={e => {
                          const val = e.target.value;
                          // Jangan format array saat user sedang mengetik agar koma tidak hilang/loncat
                          // Kita simpan string as is, tapi karena settings.ignoredNumbers array,
                          // lebih baik pakai state lokal atau biarkan di-split, tapi UI bisa glitch kalau ngetik koma.
                          // Untuk amannya, saat onChange kita langsung update array-nya.
                          const inputArr = val.split(',').map(s => s.trim());
                          setSettings({ ...settings, ignoredNumbers: inputArr });
                        }}
                        onBlur={() => {
                          // Bersihkan array kosong sebelum disave
                          const cleaned = (settings.ignoredNumbers || []).filter(s => s !== '');
                          const newSettings = { ...settings, ignoredNumbers: cleaned };
                          setSettings(newSettings);
                          handleSaveSettings(newSettings);
                        }}
                        rows={3}
                        placeholder="628123456789, 628987654321"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* MODAL "AJARI AI (TAMBAH ATURAN)" */}
          {showModal && editingItem && (
            <div className="sc-modal-backdrop" onClick={() => setShowModal(false)}>
              <div className="sc-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
                <button className="sc-icon-btn sc-modal-close" onClick={() => setShowModal(false)} aria-label="Tutup">
                  <X size={22} />
                </button>

                <h2>Ajari AI ({editingItem.id ? 'Edit Aturan' : 'Tambah Aturan'})</h2>

                <label htmlFor="input-rule">Instruksi/Aturan untuk AI</label>
                <p className="sc-modal-hint">
                  Berikan instruksi yang jelas. Contoh: "Jika ada yang bertanya harga promo, pastikan tawarkan diskon 10% untuk kode LOMBOKHEBOH."
                </p>

                <div className="sc-modal-field">
                  <textarea
                    id="input-rule"
                    className="sc-textarea"
                    value={editingItem.content}
                    onChange={(e) => setEditingItem({ ...editingItem, content: e.target.value })}
                    placeholder="Ketik aturan di sini..."
                    rows={6}
                    autoFocus
                  />
                  <div className="sc-modal-tools">
                    <button onClick={copyRule} title="Salin aturan">
                      <Copy size={16} />
                    </button>
                    <button title="Template">
                      <Files size={16} />
                    </button>
                  </div>
                </div>

                <div className="sc-modal-actions">
                  <button id="btn-save-rule" className="sc-btn-save" onClick={saveKnowledgeItem}>
                    <Save size={18} /> Simpan Aturan
                  </button>
                  <button className="sc-btn-cancel" onClick={() => setShowModal(false)}>
                    Batal
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
