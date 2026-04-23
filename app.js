// ============================================================
// ProjeXWise ERP — Main Application (app.js)
// Firebase v10 Modular SDK — NO STORAGE VERSION
// ============================================================
'use strict';

// ===== FIREBASE IMPORTS =====
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updatePassword, EmailAuthProvider,
  reauthenticateWithCredential, createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, Timestamp, writeBatch,
  setDoc, increment
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
// No Firebase Storage imports

// ===== FIREBASE CONFIG =====
// Replace with your actual Firebase project configuration
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCobzaJhuN-jqPSm2xvMDUhplXGd9Tqa3s",
  authDomain: "projexwise-erp.firebaseapp.com",
  projectId: "projexwise-erp",
  storageBucket: "projexwise-erp.firebasestorage.app",
  messagingSenderId: "933242430125",
  appId: "1:933242430125:web:de1672e9290dc1026f9c24"
};

// ===== INITIALIZE FIREBASE =====
const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

// ===== GLOBAL STATE =====
const State = {
  user: null,        // Firebase Auth user
  profile: null,     // Firestore user profile
  settings: null,    // Company settings
  charts: {},
  listeners: [],     // Active Firestore listeners to unsubscribe
  sidebarCollapsed: false,
  currentPage: 'dashboard',
  notifUnread: 0
};

// ===== PERMISSION DEFINITIONS =====
const ALL_PERMISSIONS = {
  income_view: 'عرض الإيرادات', income_add: 'إضافة إيراد', income_edit: 'تعديل الإيراد',
  income_delete: 'حذف الإيراد', income_approve: 'اعتماد الإيراد',
  expenses_view: 'عرض المصروفات', expenses_add: 'إضافة مصروف', expenses_edit: 'تعديل المصروف',
  expenses_delete: 'حذف المصروف', expenses_approve: 'اعتماد المصروف',
  projects_create: 'إنشاء مشروع', projects_edit: 'تعديل المشروع',
  projects_delete: 'حذف المشروع', projects_archive: 'أرشفة مشروع',
  partners_view: 'عرض الشركاء', partners_add: 'إضافة شريك',
  partners_edit: 'تعديل شريك', partners_delete: 'حذف شريك',
  custody_create: 'إنشاء عهدة', custody_settle: 'تسوية عهدة',
  custody_edit: 'تعديل عهدة', custody_close: 'إغلاق عهدة',
  reports_view: 'عرض التقارير', reports_partner: 'تقارير الشركاء',
  reports_export: 'تصدير وطباعة',
  admin_users: 'إدارة المستخدمين', admin_permissions: 'إدارة الصلاحيات',
  admin_settings: 'إعدادات النظام'
};

const ADMIN_ALL_PERMS = Object.keys(ALL_PERMISSIONS).reduce((acc, k) => { acc[k] = true; return acc; }, {});

// ===== HELPERS =====
const H = {
  fmt(n, dec = 0) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    return new Intl.NumberFormat('ar-AE', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
  },
  fmtDate(ts) {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    return d.toLocaleDateString('ar-AE', { year: 'numeric', month: '2-digit', day: '2-digit' });
  },
  fmtDateTime(ts) {
    if (!ts) return '-';
    const d = ts.toDate ? ts.toDate() : (ts instanceof Date ? ts : new Date(ts));
    return d.toLocaleString('ar-AE');
  },
  now() { return serverTimestamp(); },
  currency() { return State.settings?.currency || 'AED'; },
  isAdmin() { return State.profile?.role === 'admin'; },
  hasPerm(perm) {
    if (H.isAdmin()) return true;
    return !!State.profile?.permissions?.[perm];
  },
  canEdit(record) {
    if (H.isAdmin()) return true;
    const days = State.profile?.editDays ?? 0;
    if (days === -1) return true;
    const created = record.createdAt?.toDate ? record.createdAt.toDate() : new Date(record.createdAt);
    const diffDays = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= days;
  },
  escape(str) { return String(str || '').replace(/[<>"']/g, c => ({ '<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); },
  genId() { return Date.now().toString(36) + Math.random().toString(36).substr(2, 5); },
  avatarColor(name) {
    const colors = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444','#06b6d4','#f97316'];
    let h = 0;
    for (const c of (name || 'U')) h = c.charCodeAt(0) + ((h << 5) - h);
    return colors[Math.abs(h) % colors.length];
  },
  sourceLabel(s) {
    const m = { partner_contribution:'مساهمة شريك', customer_payment:'دفعة عميل', project_payment:'دفعة مشروع', debt_collection:'تحصيل دين', other:'أخرى' };
    return m[s] || s;
  },
  categoryLabel(c) {
    const m = { materials:'مواد', salaries:'رواتب', transport:'نقل', general:'عام', maintenance:'صيانة', misc:'متنوع', partner_withdrawal:'سحب شريك' };
    return m[c] || c;
  },
  methodLabel(m) { const x = { cash:'نقدي', bank:'بنك', transfer:'تحويل' }; return x[m] || m; },
  statusLabel(s) {
    const m = { active:'نشط', completed:'مكتمل', pending:'معلق', archived:'مؤرشف', on_hold:'متوقف' };
    return m[s] || s;
  },
  statusBadge(s) {
    const cls = { active:'badge-green', completed:'badge-blue', pending:'badge-amber', archived:'badge-gray', on_hold:'badge-red' };
    return `<span class="badge ${cls[s]||'badge-gray'}">${H.statusLabel(s)}</span>`;
  },
  approvedBadge(a) { return a ? '<span class="badge badge-green">معتمد</span>' : '<span class="badge badge-amber">معلق</span>'; }
};

// ===== AUDIT =====
async function logAudit(action, type, details, oldVal = null, newVal = null, refId = null) {
  try {
    await addDoc(collection(db, 'audit'), {
      action, type, details,
      oldVal: oldVal ? JSON.stringify(oldVal) : null,
      newVal: newVal ? JSON.stringify(newVal) : null,
      refId,
      userId: State.user?.uid,
      userName: State.profile?.name || State.user?.email,
      createdAt: serverTimestamp()
    });
  } catch (e) { console.warn('Audit log failed:', e); }
}

// ===== TOAST =====
const Toast = {
  show(msg, type = 'info') {
    const icons = { success: '✓', error: '✕', info: 'ℹ', warning: '⚠' };
    const c = document.getElementById('toastStack');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${H.escape(msg)}</span>`;
    c.appendChild(t);
    setTimeout(() => { t.style.transition = 'all 0.3s'; t.style.opacity = '0'; t.style.transform = 'translateX(-40px)'; setTimeout(() => t.remove(), 300); }, 3500);
  }
};

// ===== UI UTILITIES =====
const UI = {
  togglePassword(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (!inp) return;
    if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🙈'; }
    else { inp.type = 'password'; btn.textContent = '👁'; }
  },
  toggleTheme() {
    document.body.classList.toggle('dark');
    document.body.classList.toggle('light');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('pxw_theme', isDark ? 'dark' : 'light');
  },
  toggleSidebar() {
    const sb = document.getElementById('sidebar');
    sb.classList.toggle('collapsed');
    State.sidebarCollapsed = sb.classList.contains('collapsed');
  },
  toggleMobileSidebar() {
    document.getElementById('sidebar').classList.toggle('mobile-open');
  },
  openModal(title, html, wide = false, narrow = false) {
    const box = document.getElementById('modalBox');
    box.className = 'modal-box' + (wide ? ' wide' : '') + (narrow ? ' narrow' : '');
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalContent').innerHTML = html;
    document.getElementById('modalBackdrop').classList.remove('hidden');
    setTimeout(() => UI._initModalCharts(), 100);
  },
  _initModalCharts() { },
  closeModal(e) {
    if (!e || e.target === document.getElementById('modalBackdrop')) {
      document.getElementById('modalBackdrop').classList.add('hidden');
      document.getElementById('modalContent').innerHTML = '';
    }
  },
  confirm(title, msg, onConfirm) {
    document.getElementById('cdTitle').textContent = title;
    document.getElementById('cdMsg').textContent = msg;
    const btn = document.getElementById('cdConfirmBtn');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.addEventListener('click', () => {
      document.getElementById('confirmDialog').classList.add('hidden');
      onConfirm();
    });
    document.getElementById('confirmDialog').classList.remove('hidden');
  },
  confirmCancel() { document.getElementById('confirmDialog').classList.add('hidden'); },
  toggleNotifications() {
    const p = document.getElementById('notifPanel');
    p.classList.toggle('hidden');
    if (!p.classList.contains('hidden')) State.notifUnread = 0, document.getElementById('notifCount').classList.add('hidden');
  },
  destroyCharts() {
    Object.values(State.charts).forEach(c => { try { c.destroy(); } catch {} });
    State.charts = {};
  },
  clearListeners() {
    State.listeners.forEach(unsub => { try { unsub(); } catch {} });
    State.listeners = [];
  },
  setPage(name) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === name));
    const labels = {
      dashboard: 'لوحة التحكم', income: 'الإيرادات', expenses: 'المصروفات',
      custody: 'العهد والسلف', projects: 'المشاريع', partners: 'الشركاء',
      cashbank: 'الخزينة والبنك', reports: 'التقارير', audit: 'سجل العمليات',
      users: 'المستخدمون', settings: 'الإعدادات', profile: 'الملف الشخصي'
    };
    document.getElementById('topbarBreadcrumb').textContent = labels[name] || name;
    State.currentPage = name;
  },
  applyPermissions() {
    document.querySelectorAll('[class*="perm-"]').forEach(el => {
      const classes = [...el.classList];
      const permClass = classes.find(c => c.startsWith('perm-'));
      if (!permClass) return;
      const perm = permClass.replace('perm-', '');
      el.style.display = H.hasPerm(perm) ? '' : 'none';
    });
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = H.isAdmin() ? '' : 'none';
    });
  }
};

// ===== AUTH MODULE =====
const Auth = {
  async login() {
    const email = document.getElementById('loginEmail').value.trim();
    const pass = document.getElementById('loginPassword').value;
    const errEl = document.getElementById('loginError');
    const btn = document.getElementById('loginBtn');
    errEl.classList.add('hidden');
    if (!email || !pass) { errEl.textContent = 'يرجى إدخال البريد الإلكتروني وكلمة المرور'; errEl.classList.remove('hidden'); return; }
    btn.classList.add('btn-loading');
    btn.innerHTML = '<span class="spinner"></span> جاري الدخول...';
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const profDoc = await getDoc(doc(db, 'users', cred.user.uid));
      if (!profDoc.exists()) throw new Error('المستخدم غير موجود في النظام');
      const profile = profDoc.data();
      if (profile.active === false) {
        await signOut(auth);
        throw new Error('هذا الحساب موقف. يرجى التواصل مع المسؤول');
      }
      await logAudit('تسجيل دخول', 'auth', `${profile.name} — ${email}`);
    } catch (err) {
      const msgs = {
        'auth/user-not-found': 'البريد الإلكتروني غير مسجل',
        'auth/wrong-password': 'كلمة المرور غير صحيحة',
        'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
        'auth/too-many-requests': 'تم تجاوز عدد المحاولات. حاول لاحقاً'
      };
      errEl.textContent = msgs[err.code] || err.message;
      errEl.classList.remove('hidden');
      btn.classList.remove('btn-loading');
      btn.innerHTML = '<span>دخول</span>';
    }
  },
  async logout() {
    await logAudit('تسجيل خروج', 'auth', State.profile?.name || '');
    UI.clearListeners();
    UI.destroyCharts();
    await signOut(auth);
  }
};

// ===== FIREBASE SETUP (first admin) =====
window.FirebaseSetup = {
  async createFirstAdmin(email, password, name) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'users', cred.user.uid), {
        name, email, role: 'admin', active: true, editDays: -1,
        permissions: ADMIN_ALL_PERMS, createdAt: serverTimestamp()
      });
      await setDoc(doc(db, 'settings', 'company'), {
        companyName: 'ProjeXWise Company', currency: 'AED', taxRate: 5,
        address: '', phone: '', email: '', website: '', notes: '',
        createdAt: serverTimestamp()
      });
      console.log('✅ Admin created successfully! Email:', email);
      return 'success';
    } catch (e) { console.error('❌ Setup failed:', e); return e.message; }
  }
};

// ===== AUTH STATE OBSERVER =====
onAuthStateChanged(auth, async (user) => {
  if (user) {
    State.user = user;
    const profSnap = await getDoc(doc(db, 'users', user.uid));
    if (!profSnap.exists()) { await signOut(auth); return; }
    State.profile = { id: user.uid, ...profSnap.data() };
    const settSnap = await getDoc(doc(db, 'settings', 'company'));
    State.settings = settSnap.exists() ? settSnap.data() : {};
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appShell').classList.remove('hidden');
    document.getElementById('sucName').textContent = State.profile.name;
    document.getElementById('sucRole').textContent = State.profile.role === 'admin' ? 'مدير النظام' : 'موظف';
    document.getElementById('sucAvatar').textContent = (State.profile.name || 'U').charAt(0);
    document.getElementById('sucAvatar').style.background = H.avatarColor(State.profile.name);
    UI.applyPermissions();
    App.navigate('dashboard');
    const theme = localStorage.getItem('pxw_theme') || 'light';
    document.body.className = theme;
    Notifications.load();
  } else {
    State.user = null; State.profile = null;
    document.getElementById('loadingScreen').style.display = 'none';
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('appShell').classList.add('hidden');
  }
});

// ===== NAVIGATION =====
const App = {
  navigate(page) {
    UI.clearListeners();
    UI.destroyCharts();
    UI.setPage(page);
    if (page === 'users' && !H.isAdmin()) { Toast.show('غير مصرح', 'error'); return; }
    if (page === 'settings' && !H.isAdmin()) { Toast.show('غير مصرح', 'error'); return; }
    const pageMap = {
      dashboard: Pages.dashboard,
      income: Pages.income,
      expenses: Pages.expenses,
      custody: Pages.custody,
      projects: Pages.projects,
      partners: Pages.partners,
      cashbank: Pages.cashbank,
      reports: Pages.reports,
      audit: Pages.audit,
      users: Pages.users,
      settings: Pages.settings,
      profile: Pages.profile
    };
    const renderer = pageMap[page];
    if (renderer) renderer();
    else document.getElementById('pageContainer').innerHTML = '<div class="no-data">الصفحة غير موجودة</div>';
    window.scrollTo(0, 0);
    document.getElementById('notifPanel').classList.add('hidden');
  }
};

// ===== NOTIFICATIONS =====
const Notifications = {
  items: [],
  async load() {
    if (!H.hasPerm('income_view') && !H.isAdmin()) return;
    const q = query(collection(db, 'income'), where('approved', '==', false));
    const snap = await getDocs(q);
    const pendingIncome = snap.size;
    const q2 = query(collection(db, 'expenses'), where('approved', '==', false));
    const snap2 = await getDocs(q2);
    const total = pendingIncome + pendingExpenses;
    if (total > 0) {
      document.getElementById('notifCount').textContent = total;
      document.getElementById('notifCount').classList.remove('hidden');
      State.notifUnread = total;
    }
    const list = document.getElementById('notifList');
    let html = '';
    if (pendingIncome > 0) html += `<div class="np-item"><div class="np-dot" style="background:#f59e0b;"></div><div>${pendingIncome} إيراد بانتظار الاعتماد</div></div>`;
    if (pendingExpenses > 0) html += `<div class="np-item"><div class="np-dot" style="background:#ef4444;"></div><div>${pendingExpenses} مصروف بانتظار الاعتماد</div></div>`;
    if (!html) html = '<div class="np-item text-muted">لا توجد إشعارات جديدة</div>';
    list.innerHTML = html;
  }
};

// ===== GLOBAL SEARCH =====
const Search = {
  timer: null,
  async global(val) {
    clearTimeout(Search.timer);
    const res = document.getElementById('searchResults');
    if (!val || val.length < 2) { res.classList.add('hidden'); return; }
    Search.timer = setTimeout(async () => {
      res.classList.remove('hidden');
      res.innerHTML = '<div class="sr-item text-muted">جاري البحث...</div>';
      const results = [];
      const pSnap = await getDocs(query(collection(db, 'projects'), orderBy('name'), limit(5)));
      pSnap.forEach(d => {
        const p = d.data();
        if (p.name?.includes(val) || p.client?.includes(val)) results.push({ type: 'مشروع', text: p.name, page: 'projects' });
      });
      const iSnap = await getDocs(query(collection(db, 'income'), orderBy('voucher'), limit(5)));
      iSnap.forEach(d => {
        const r = d.data();
        if (r.voucher?.includes(val) || r.notes?.includes(val)) results.push({ type: 'إيراد', text: r.voucher, page: 'income' });
      });
      if (results.length === 0) { res.innerHTML = '<div class="sr-item text-muted">لا نتائج</div>'; return; }
      res.innerHTML = results.map(r => `
        <div class="sr-item" onclick="App.navigate('${r.page}');document.getElementById('searchResults').classList.add('hidden');document.getElementById('globalSearch').value='';">
          <span class="sr-type">${r.type}</span><span>${H.escape(r.text)}</span>
        </div>`).join('');
    }, 400);
  }
};

// ===== PAGES =====
const Pages = {};

// ============================================================
// DASHBOARD
// ============================================================
Pages.dashboard = async function() {
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">لوحة التحكم</div><div class="ph-sub" id="dashSub">جاري التحميل...</div></div>
      <div class="ph-actions"><button class="btn btn-ghost btn-sm" onclick="Pages.dashboard()">↻ تحديث</button></div>
    </div>
    <div class="kpi-row" id="dashKpis"><div class="text-muted">جاري تحميل البيانات...</div></div>
    <div class="charts-row" id="dashCharts" style="display:none;">
      <div class="card">
        <div class="card-header"><span class="card-title">الإيرادات والمصروفات الشهرية</span></div>
        <div class="card-body chart-wrap"><canvas id="monthlyChart"></canvas></div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">توزيع المصروفات</span></div>
        <div class="card-body chart-wrap"><canvas id="catChart"></canvas></div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;" id="dashBottom">
      <div class="card">
        <div class="card-header"><span class="card-title">آخر الإيرادات</span><button class="btn btn-ghost btn-sm" onclick="App.navigate('income')">عرض الكل</button></div>
        <div id="dashRecentIncome">...</div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">آخر المصروفات</span><button class="btn btn-ghost btn-sm" onclick="App.navigate('expenses')">عرض الكل</button></div>
        <div id="dashRecentExpenses">...</div>
      </div>
    </div>`;

  try {
    const [incSnap, expSnap, projSnap, partSnap, custSnap] = await Promise.all([
      getDocs(collection(db, 'income')),
      getDocs(collection(db, 'expenses')),
      getDocs(query(collection(db, 'projects'), where('status', '==', 'active'))),
      getDocs(collection(db, 'partners')),
      getDocs(query(collection(db, 'custody'), where('status', '==', 'active')))
    ]);

    const income = incSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    const totalIncome = income.reduce((s, r) => s + (r.amount || 0), 0);
    const totalExpenses = expenses.reduce((s, r) => s + (r.amount || 0), 0);
    const netProfit = totalIncome - totalExpenses;
    const cashBal = income.filter(r => r.method === 'cash').reduce((s, r) => s + (r.amount || 0), 0) -
      expenses.filter(r => r.method === 'cash').reduce((s, r) => s + (r.amount || 0), 0);
    const partnerBal = partSnap.docs.reduce((s, d) => s + (d.data().capital || 0) + (d.data().profitShare || 0) - (d.data().withdrawals || 0), 0);
    const custodyTotal = custSnap.docs.reduce((s, d) => s + (d.data().remaining || 0), 0);

    document.getElementById('dashSub').textContent = `${State.settings?.companyName || 'ProjeXWise'} — ${new Date().toLocaleDateString('ar-AE', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

    document.getElementById('dashKpis').innerHTML = `
      <div class="kpi-card kpi-green">
        <div class="kpi-top"><div><div class="kpi-label">إجمالي الإيرادات</div><div class="kpi-value">${H.fmt(totalIncome)}</div><div class="kpi-sub">${H.currency()}</div></div><div class="kpi-icon-wrap">↑</div></div>
        <div class="kpi-stripe"></div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-top"><div><div class="kpi-label">إجمالي المصروفات</div><div class="kpi-value">${H.fmt(totalExpenses)}</div><div class="kpi-sub">${H.currency()}</div></div><div class="kpi-icon-wrap">↓</div></div>
        <div class="kpi-stripe"></div>
      </div>
      <div class="kpi-card ${netProfit >= 0 ? 'kpi-blue' : 'kpi-amber'}">
        <div class="kpi-top"><div><div class="kpi-label">صافي الربح</div><div class="kpi-value">${H.fmt(Math.abs(netProfit))}</div><div class="kpi-sub">${netProfit >= 0 ? '▲ ربح' : '▼ خسارة'}</div></div><div class="kpi-icon-wrap">◈</div></div>
        <div class="kpi-stripe"></div>
      </div>
      <div class="kpi-card kpi-cyan">
        <div class="kpi-top"><div><div class="kpi-label">رصيد الخزينة</div><div class="kpi-value">${H.fmt(cashBal)}</div><div class="kpi-sub">${H.currency()}</div></div><div class="kpi-icon-wrap">◉</div></div>
        <div class="kpi-stripe"></div>
      </div>
      <div class="kpi-card kpi-purple">
        <div class="kpi-top"><div><div class="kpi-label">المشاريع النشطة</div><div class="kpi-value">${projSnap.size}</div><div class="kpi-sub">مشروع</div></div><div class="kpi-icon-wrap">◧</div></div>
        <div class="kpi-stripe"></div>
      </div>
      <div class="kpi-card kpi-amber">
        <div class="kpi-top"><div><div class="kpi-label">عهد غير مسوّاة</div><div class="kpi-value">${H.fmt(custodyTotal)}</div><div class="kpi-sub">${H.currency()} — ${custSnap.size} عهدة</div></div><div class="kpi-icon-wrap">◷</div></div>
        <div class="kpi-stripe"></div>
      </div>`;

    const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    const mIncome = Array(12).fill(0), mExpense = Array(12).fill(0);
    income.forEach(r => { const ts = r.createdAt?.toDate?.(); if (ts) mIncome[ts.getMonth()] += r.amount || 0; });
    expenses.forEach(r => { const ts = r.createdAt?.toDate?.(); if (ts) mExpense[ts.getMonth()] += r.amount || 0; });
    const catTotals = {};
    expenses.forEach(r => { catTotals[r.category] = (catTotals[r.category] || 0) + (r.amount || 0); });
    const isDark = document.body.classList.contains('dark');
    const textColor = isDark ? '#8b949e' : '#6b7280';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    document.getElementById('dashCharts').style.display = 'grid';
    const mCtx = document.getElementById('monthlyChart');
    if (mCtx) {
      State.charts.monthly = new Chart(mCtx, {
        type: 'bar',
        data: { labels: months, datasets: [
          { label: 'إيرادات', data: mIncome, backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 5 },
          { label: 'مصروفات', data: mExpense, backgroundColor: 'rgba(239,68,68,0.65)', borderRadius: 5 }
        ]},
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: textColor, font: { family: 'Tajawal' } } } }, scales: { x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Tajawal' } } }, y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'Tajawal' }, callback: v => H.fmt(v) } } } }
      });
    }
    const cCtx = document.getElementById('catChart');
    if (cCtx && Object.keys(catTotals).length > 0) {
      State.charts.cat = new Chart(cCtx, {
        type: 'doughnut',
        data: { labels: Object.keys(catTotals).map(k => H.categoryLabel(k)), datasets: [{ data: Object.values(catTotals), backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'], borderWidth: 2, borderColor: isDark ? '#161b22' : '#fff' }] },
        options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Tajawal' }, padding: 10, boxWidth: 12 } } } }
      });
    }

    const recentInc = income.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);
    const recentExp = expenses.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);
    document.getElementById('dashRecentIncome').innerHTML = recentInc.length ?
      recentInc.map(r => `<div class="ledger-row"><div class="lr-info"><div class="lr-label">${H.escape(r.voucher)}</div><div class="lr-sub">${H.sourceLabel(r.source)} — ${H.fmtDate(r.createdAt)}</div></div><div class="amt-income">+${H.fmt(r.amount)}</div></div>`).join('') :
      '<div class="no-data">لا توجد إيرادات</div>';
    document.getElementById('dashRecentExpenses').innerHTML = recentExp.length ?
      recentExp.map(r => `<div class="ledger-row"><div class="lr-info"><div class="lr-label">${H.escape(r.voucher)}</div><div class="lr-sub">${H.categoryLabel(r.category)} — ${H.fmtDate(r.createdAt)}</div></div><div class="amt-expense">-${H.fmt(r.amount)}</div></div>`).join('') :
      '<div class="no-data">لا توجد مصروفات</div>';

  } catch (e) { console.error(e); Toast.show('خطأ في تحميل البيانات: ' + e.message, 'error'); }
};

// ============================================================
// INCOME (No file attachment)
// ============================================================
Pages.income = async function(filters = {}) {
  if (!H.hasPerm('income_view')) { Toast.show('غير مصرح', 'error'); return; }

  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">الإيرادات</div><div class="ph-sub" id="incSub">جاري التحميل...</div></div>
      <div class="ph-actions">
        ${H.hasPerm('income_add') ? `<button class="btn btn-primary" onclick="IncomeActions.showForm()">+ إضافة إيراد</button>` : ''}
      </div>
    </div>
    <div class="filter-bar">
      <div class="fb-search"><input class="form-control" id="incSearch" placeholder="بحث بالقسيمة أو الملاحظات..." value="${filters.search || ''}"></div>
      <select class="form-control filter-select" id="incSource">
        <option value="">كل المصادر</option>
        <option value="partner_contribution">مساهمة شريك</option>
        <option value="customer_payment">دفعة عميل</option>
        <option value="project_payment">دفعة مشروع</option>
        <option value="debt_collection">تحصيل دين</option>
        <option value="other">أخرى</option>
      </select>
      <select class="form-control filter-select" id="incApproved">
        <option value="">كل الحالات</option>
        <option value="true">معتمد</option>
        <option value="false">معلق</option>
      </select>
      <input type="date" class="form-control filter-date" id="incDateFrom">
      <input type="date" class="form-control filter-date" id="incDateTo">
      <button class="btn btn-ghost btn-sm" onclick="IncomeActions.applyFilter()">تصفية</button>
    </div>
    <div class="card">
      <div class="table-wrap" id="incomeTableWrap">
        <div class="no-data"><div class="no-data-icon">⏳</div>جاري التحميل...</div>
      </div>
    </div>`;

  await IncomeActions.loadTable();
};

const IncomeActions = {
  data: [],
  async loadTable() {
    try {
      const snap = await getDocs(query(collection(db, 'income'), orderBy('createdAt', 'desc')));
      IncomeActions.data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      IncomeActions.renderTable(IncomeActions.data);
      const sub = document.getElementById('incSub');
      if (sub) sub.textContent = `${snap.size} سجل — إجمالي ${H.fmt(IncomeActions.data.reduce((s, r) => s + (r.amount || 0), 0))} ${H.currency()}`;
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  applyFilter() {
    const search = document.getElementById('incSearch')?.value?.toLowerCase() || '';
    const source = document.getElementById('incSource')?.value || '';
    const approved = document.getElementById('incApproved')?.value || '';
    const dateFrom = document.getElementById('incDateFrom')?.value;
    const dateTo = document.getElementById('incDateTo')?.value;
    let data = [...IncomeActions.data];
    if (search) data = data.filter(r => (r.voucher || '').toLowerCase().includes(search) || (r.notes || '').toLowerCase().includes(search));
    if (source) data = data.filter(r => r.source === source);
    if (approved !== '') data = data.filter(r => String(r.approved) === approved);
    if (dateFrom) data = data.filter(r => { const d = r.createdAt?.toDate?.(); return d && d >= new Date(dateFrom); });
    if (dateTo) data = data.filter(r => { const d = r.createdAt?.toDate?.(); return d && d <= new Date(dateTo + 'T23:59:59'); });
    IncomeActions.renderTable(data);
  },
  renderTable(data) {
    const wrap = document.getElementById('incomeTableWrap');
    if (!wrap) return;
    if (!data.length) { wrap.innerHTML = '<div class="no-data"><div class="no-data-icon">◎</div>لا توجد سجلات</div>'; return; }
    wrap.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>القسيمة</th><th>التاريخ</th><th>المصدر</th><th>المشروع</th><th>طريقة الدفع</th><th>المبلغ</th><th>الحالة</th><th>الإجراءات</th>
       </tr></thead>
      <tbody>${data.map(r => `<tr>
        <td class="mono fw-7" style="font-size:0.82rem;">${H.escape(r.voucher || '')}</td>
        <td>${H.fmtDate(r.createdAt)}</td>
        <td><span class="badge badge-blue">${H.sourceLabel(r.source)}</span></td>
        <td>${H.escape(r.projectName || '-')}</td>
        <td><span class="badge badge-gray">${H.methodLabel(r.method)}</span></td>
        <td class="amt-income">+${H.fmt(r.amount)} ${H.currency()}</td>
        <td>${H.approvedBadge(r.approved)}</td>
        <td>
          <div class="flex gap-1">
            <button class="btn btn-ghost btn-xs" onclick="IncomeActions.view('${r.id}')">👁</button>
            ${H.hasPerm('income_edit') && H.canEdit(r) ? `<button class="btn btn-ghost btn-xs" onclick="IncomeActions.showForm('${r.id}')">✎</button>` : ''}
            ${H.hasPerm('income_approve') && !r.approved ? `<button class="btn btn-green btn-xs" onclick="IncomeActions.approve('${r.id}')">اعتماد</button>` : ''}
            ${H.hasPerm('income_delete') ? `<button class="btn btn-danger btn-xs" onclick="IncomeActions.delete('${r.id}')">✕</button>` : ''}
          </div>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>`;
  },
  async showForm(id) {
    const projects = (await getDocs(collection(db, 'projects'))).docs.map(d => ({ id: d.id, ...d.data() }));
    const rec = id ? IncomeActions.data.find(r => r.id === id) : null;
    UI.openModal(rec ? 'تعديل الإيراد' : 'إضافة إيراد جديد', `
      <div class="form-grid">
        <div class="form-group"><label>التاريخ <span class="req">*</span></label><input type="date" class="form-control" id="fDate" value="${rec ? (rec.date || '') : new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>المصدر <span class="req">*</span></label>
          <select class="form-control" id="fSource">
            ${['partner_contribution','customer_payment','project_payment','debt_collection','other'].map(s => `<option value="${s}" ${rec?.source===s?'selected':''}>${H.sourceLabel(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>المبلغ <span class="req">*</span></label><input type="number" class="form-control" id="fAmount" min="0" step="0.01" placeholder="0.00" value="${rec ? rec.amount : ''}"></div>
        <div class="form-group"><label>طريقة الدفع</label>
          <select class="form-control" id="fMethod">
            <option value="cash" ${rec?.method==='cash'?'selected':''}>نقدي</option>
            <option value="bank" ${rec?.method==='bank'?'selected':''}>بنك</option>
            <option value="transfer" ${rec?.method==='transfer'?'selected':''}>تحويل</option>
          </select>
        </div>
        <div class="form-group"><label>المشروع</label>
          <select class="form-control" id="fProject">
            <option value="">— بدون مشروع —</option>
            ${projects.map(p => `<option value="${p.id}" data-name="${H.escape(p.name)}" ${rec?.projectId===p.id?'selected':''}>${H.escape(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>المستلم</label><input type="text" class="form-control" id="fReceiver" value="${H.escape(rec?.receiver || State.profile.name || '')}"></div>
      </div>
      <div class="form-group mt-2"><label>الملاحظات</label><textarea class="form-control" id="fNotes" rows="3">${H.escape(rec?.notes || '')}</textarea></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        <button class="btn btn-primary" onclick="IncomeActions.save('${id || ''}')">حفظ</button>
      </div>`);
  },
  async save(id) {
    const date = document.getElementById('fDate')?.value;
    const source = document.getElementById('fSource')?.value;
    const amount = parseFloat(document.getElementById('fAmount')?.value);
    const method = document.getElementById('fMethod')?.value;
    const projectEl = document.getElementById('fProject');
    const projectId = projectEl?.value || null;
    const projectName = projectId ? projectEl?.selectedOptions[0]?.dataset?.name || '' : '';
    const receiver = document.getElementById('fReceiver')?.value;
    const notes = document.getElementById('fNotes')?.value;

    if (!date || !source || !amount || amount <= 0) { Toast.show('يرجى ملء الحقول المطلوبة بشكل صحيح', 'error'); return; }

    try {
      const existing = id ? IncomeActions.data.find(r => r.id === id) : null;
      const voucher = id ? existing.voucher : `INC-${Date.now().toString().slice(-6)}`;
      const data = { date, source, amount, method, projectId, projectName, receiver, notes, voucher };

      if (id) {
        await updateDoc(doc(db, 'income', id), { ...data, editedBy: State.user.uid, editedByName: State.profile.name, editedAt: serverTimestamp() });
        await logAudit('تعديل إيراد', 'income', voucher, { amount: existing.amount }, { amount }, id);
        Toast.show('تم التعديل', 'success');
      } else {
        const ref = await addDoc(collection(db, 'income'), { ...data, approved: false, createdBy: State.user.uid, createdByName: State.profile.name, createdAt: serverTimestamp() });
        await logAudit('إضافة إيراد', 'income', voucher, null, { amount }, ref.id);
        Toast.show('تمت الإضافة', 'success');
      }
      UI.closeModal();
      await IncomeActions.loadTable();
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async approve(id) {
    try {
      const rec = IncomeActions.data.find(r => r.id === id);
      await updateDoc(doc(db, 'income', id), { approved: true, approvedBy: State.user.uid, approvedByName: State.profile.name, approvedAt: serverTimestamp() });
      await logAudit('اعتماد إيراد', 'income', rec?.voucher, { approved: false }, { approved: true }, id);
      Toast.show('تم الاعتماد', 'success');
      await IncomeActions.loadTable();
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async delete(id) {
    const rec = IncomeActions.data.find(r => r.id === id);
    UI.confirm('حذف الإيراد', `هل أنت متأكد من حذف ${rec?.voucher}؟ لا يمكن التراجع.`, async () => {
      try {
        await deleteDoc(doc(db, 'income', id));
        await logAudit('حذف إيراد', 'income', rec?.voucher, { amount: rec?.amount }, null, id);
        Toast.show('تم الحذف', 'warning');
        await IncomeActions.loadTable();
      } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
    });
  },
  async view(id) {
    const rec = IncomeActions.data.find(r => r.id === id);
    if (!rec) return;
    UI.openModal('تفاصيل الإيراد', `
      <div style="display:grid;gap:0.75rem;">
        ${[['رقم القسيمة',rec.voucher],['التاريخ',H.fmtDate(rec.createdAt)],['المصدر',H.sourceLabel(rec.source)],
           ['المشروع',rec.projectName||'-'],['طريقة الدفع',H.methodLabel(rec.method)],
           ['المبلغ',`${H.fmt(rec.amount)} ${H.currency()}`],['الحالة',rec.approved?'معتمد':'غير معتمد'],
           ['المستلم',rec.receiver||'-'],['أنشئ بواسطة',rec.createdByName||'-'],['تاريخ الإنشاء',H.fmtDateTime(rec.createdAt)],
           ['الملاحظات',rec.notes||'-']
        ].map(([k,v])=>`<div class="uc-detail"><span class="uc-dl">${k}</span><span class="fw-7">${H.escape(String(v))}</span></div>`).join('')}
      </div>`, false, true);
  }
};

// ============================================================
// EXPENSES (No file attachment)
// ============================================================
Pages.expenses = async function() {
  if (!H.hasPerm('expenses_view')) { Toast.show('غير مصرح', 'error'); return; }
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">المصروفات</div><div class="ph-sub" id="expSub">جاري التحميل...</div></div>
      <div class="ph-actions">${H.hasPerm('expenses_add')?`<button class="btn btn-primary" onclick="ExpenseActions.showForm()">+ إضافة مصروف</button>`:''}</div>
    </div>
    <div class="filter-bar">
      <div class="fb-search"><input class="form-control" id="expSearch" placeholder="بحث..."></div>
      <select class="form-control filter-select" id="expCat">
        <option value="">كل الفئات</option>
        ${['materials','salaries','transport','general','maintenance','misc','partner_withdrawal'].map(c=>`<option value="${c}">${H.categoryLabel(c)}</option>`).join('')}
      </select>
      <select class="form-control filter-select" id="expApproved">
        <option value="">كل الحالات</option><option value="true">معتمد</option><option value="false">معلق</option>
      </select>
      <button class="btn btn-ghost btn-sm" onclick="ExpenseActions.applyFilter()">تصفية</button>
    </div>
    <div class="card"><div class="table-wrap" id="expTableWrap"><div class="no-data">جاري التحميل...</div></div></div>`;
  await ExpenseActions.loadTable();
};

const ExpenseActions = {
  data: [],
  async loadTable() {
    try {
      const snap = await getDocs(query(collection(db, 'expenses'), orderBy('createdAt', 'desc')));
      ExpenseActions.data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      ExpenseActions.renderTable(ExpenseActions.data);
      const sub = document.getElementById('expSub');
      if (sub) sub.textContent = `${snap.size} سجل — إجمالي ${H.fmt(ExpenseActions.data.reduce((s,r)=>s+(r.amount||0),0))} ${H.currency()}`;
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  applyFilter() {
    const search = document.getElementById('expSearch')?.value?.toLowerCase() || '';
    const cat = document.getElementById('expCat')?.value || '';
    const approved = document.getElementById('expApproved')?.value || '';
    let data = [...ExpenseActions.data];
    if (search) data = data.filter(r => (r.voucher||'').toLowerCase().includes(search) || (r.reason||'').toLowerCase().includes(search));
    if (cat) data = data.filter(r => r.category === cat);
    if (approved !== '') data = data.filter(r => String(r.approved) === approved);
    ExpenseActions.renderTable(data);
  },
  renderTable(data) {
    const wrap = document.getElementById('expTableWrap');
    if (!wrap) return;
    if (!data.length) { wrap.innerHTML = '<div class="no-data"><div class="no-data-icon">◎</div>لا توجد سجلات</div>'; return; }
    wrap.innerHTML = `<table class="data-table"><thead><tr>
      <th>القسيمة</th><th>التاريخ</th><th>الفئة</th><th>المشروع</th><th>السبب</th><th>المبلغ</th><th>الحالة</th><th>الإجراءات</th>
     </tr></thead><tbody>
    ${data.map(r=>`<tr>
      <td class="mono fw-7" style="font-size:0.82rem;">${H.escape(r.voucher||'')}</td>
      <td>${H.fmtDate(r.createdAt)}</td>
      <td><span class="badge badge-purple">${H.categoryLabel(r.category)}</span></td>
      <td>${H.escape(r.projectName||'-')}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${H.escape(r.reason||'')}</td>
      <td class="amt-expense">-${H.fmt(r.amount)} ${H.currency()}</td>
      <td>${H.approvedBadge(r.approved)}</td>
      <td><div class="flex gap-1">
        <button class="btn btn-ghost btn-xs" onclick="ExpenseActions.view('${r.id}')">👁</button>
        ${H.hasPerm('expenses_edit')&&H.canEdit(r)&&!r.approved?`<button class="btn btn-ghost btn-xs" onclick="ExpenseActions.showForm('${r.id}')">✎</button>`:''}
        ${H.hasPerm('expenses_approve')&&!r.approved?`<button class="btn btn-green btn-xs" onclick="ExpenseActions.approve('${r.id}')">اعتماد</button>`:''}
        ${H.hasPerm('expenses_delete')?`<button class="btn btn-danger btn-xs" onclick="ExpenseActions.delete('${r.id}')">✕</button>`:''}
      </div></td>
    </tr>`).join('')}</tbody></table>`;
  },
  async showForm(id) {
    const projects = (await getDocs(collection(db, 'projects'))).docs.map(d => ({ id: d.id, ...d.data() }));
    const rec = id ? ExpenseActions.data.find(r => r.id === id) : null;
    const costCenters = ['مركز المشاريع','مركز الإدارة','مركز اللوجستيات','مركز الشركاء','مركز التشغيل'];
    UI.openModal(rec ? 'تعديل المصروف' : 'إضافة مصروف جديد', `
      <div class="form-grid">
        <div class="form-group"><label>التاريخ <span class="req">*</span></label><input type="date" class="form-control" id="fDate" value="${rec?.date||new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group"><label>الفئة <span class="req">*</span></label>
          <select class="form-control" id="fCat">
            ${['materials','salaries','transport','general','maintenance','misc','partner_withdrawal'].map(c=>`<option value="${c}" ${rec?.category===c?'selected':''}>${H.categoryLabel(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>المبلغ <span class="req">*</span></label><input type="number" class="form-control" id="fAmount" min="0" step="0.01" value="${rec?.amount||''}"></div>
        <div class="form-group"><label>طريقة الدفع</label>
          <select class="form-control" id="fMethod">
            <option value="cash" ${rec?.method==='cash'?'selected':''}>نقدي</option>
            <option value="bank" ${rec?.method==='bank'?'selected':''}>بنك</option>
            <option value="transfer" ${rec?.method==='transfer'?'selected':''}>تحويل</option>
          </select>
        </div>
        <div class="form-group"><label>المشروع</label>
          <select class="form-control" id="fProject">
            <option value="">— عام —</option>
            ${projects.map(p=>`<option value="${p.id}" data-name="${H.escape(p.name)}" ${rec?.projectId===p.id?'selected':''}>${H.escape(p.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>مركز التكلفة</label>
          <select class="form-control" id="fCC">
            ${costCenters.map(c=>`<option ${rec?.costCenter===c?'selected':''}>${c}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group mt-2"><label>سبب الصرف <span class="req">*</span></label><input type="text" class="form-control" id="fReason" value="${H.escape(rec?.reason||'')}" placeholder="وصف المصروف..."></div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        <button class="btn btn-primary" onclick="ExpenseActions.save('${id||''}')">حفظ</button>
      </div>`);
  },
  async save(id) {
    const date = document.getElementById('fDate')?.value;
    const category = document.getElementById('fCat')?.value;
    const amount = parseFloat(document.getElementById('fAmount')?.value);
    const method = document.getElementById('fMethod')?.value;
    const projectEl = document.getElementById('fProject');
    const projectId = projectEl?.value || null;
    const projectName = projectId ? (projectEl?.selectedOptions[0]?.dataset?.name || '') : '';
    const costCenter = document.getElementById('fCC')?.value;
    const reason = document.getElementById('fReason')?.value;
    if (!date || !category || !amount || !reason) { Toast.show('يرجى ملء الحقول المطلوبة', 'error'); return; }
    try {
      const existing = id ? ExpenseActions.data.find(r => r.id === id) : null;
      const voucher = id ? existing.voucher : `EXP-${Date.now().toString().slice(-6)}`;
      const data = { date, category, amount, method, projectId, projectName, costCenter, reason, voucher };
      if (id) {
        await updateDoc(doc(db, 'expenses', id), { ...data, editedBy: State.user.uid, editedByName: State.profile.name, editedAt: serverTimestamp() });
        await logAudit('تعديل مصروف', 'expense', voucher, { amount: existing.amount }, { amount }, id);
        Toast.show('تم التعديل', 'success');
      } else {
        const ref = await addDoc(collection(db, 'expenses'), { ...data, approved: false, createdBy: State.user.uid, createdByName: State.profile.name, createdAt: serverTimestamp() });
        await logAudit('إضافة مصروف', 'expense', voucher, null, { amount }, ref.id);
        Toast.show('تمت الإضافة', 'success');
      }
      UI.closeModal();
      await ExpenseActions.loadTable();
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async approve(id) {
    const rec = ExpenseActions.data.find(r => r.id === id);
    await updateDoc(doc(db, 'expenses', id), { approved: true, approvedBy: State.user.uid, approvedByName: State.profile.name, approvedAt: serverTimestamp() });
    await logAudit('اعتماد مصروف', 'expense', rec?.voucher, { approved: false }, { approved: true }, id);
    Toast.show('تم الاعتماد', 'success');
    await ExpenseActions.loadTable();
  },
  async delete(id) {
    const rec = ExpenseActions.data.find(r => r.id === id);
    UI.confirm('حذف المصروف', `هل أنت متأكد من حذف ${rec?.voucher}؟`, async () => {
      await deleteDoc(doc(db, 'expenses', id));
      await logAudit('حذف مصروف', 'expense', rec?.voucher, { amount: rec?.amount }, null, id);
      Toast.show('تم الحذف', 'warning');
      await ExpenseActions.loadTable();
    });
  },
  async view(id) {
    const r = ExpenseActions.data.find(x => x.id === id);
    if (!r) return;
    UI.openModal('تفاصيل المصروف', `<div style="display:grid;gap:0.75rem;">
      ${[['رقم القسيمة',r.voucher],['التاريخ',H.fmtDate(r.createdAt)],['الفئة',H.categoryLabel(r.category)],
         ['المشروع',r.projectName||'-'],['مركز التكلفة',r.costCenter||'-'],['طريقة الدفع',H.methodLabel(r.method)],
         ['المبلغ',`${H.fmt(r.amount)} ${H.currency()}`],['الحالة',r.approved?'معتمد':'غير معتمد'],
         ['سبب الصرف',r.reason||'-'],['أنشئ بواسطة',r.createdByName||'-']
      ].map(([k,v])=>`<div class="uc-detail"><span class="uc-dl">${k}</span><span class="fw-7">${H.escape(String(v))}</span></div>`).join('')}
    </div>`, false, true);
  }
};

// ============================================================
// PARTNERS
// ============================================================
Pages.partners = async function() {
  if (!H.hasPerm('partners_view')) { Toast.show('غير مصرح', 'error'); return; }
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">الشركاء</div><div class="ph-sub">إدارة حسابات وأرصدة الشركاء</div></div>
      <div class="ph-actions">${H.hasPerm('partners_add')?`<button class="btn btn-primary" onclick="PartnerActions.showForm()">+ إضافة شريك</button>`:''}</div>
    </div>
    <div id="partnerGrid" class="partner-grid"><div class="no-data">جاري التحميل...</div></div>
    <div class="mt-3"><div class="tab-bar">
      <button class="tab-btn active" onclick="PartnerActions.showTab('summary',this)">ملخص الشراكة</button>
      <button class="tab-btn" onclick="PartnerActions.showTab('ledger',this)">كشف الحسابات</button>
    </div></div>
    <div id="partnerTabContent"></div>`;
  await PartnerActions.load();
  PartnerActions.showTab('summary', document.querySelector('.tab-btn.active'));
};

const PartnerActions = {
  data: [],
  async load() {
    const snap = await getDocs(collection(db, 'partners'));
    PartnerActions.data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    PartnerActions.renderCards();
  },
  renderCards() {
    const grid = document.getElementById('partnerGrid');
    if (!grid) return;
    if (!PartnerActions.data.length) { grid.innerHTML = '<div class="no-data"><div class="no-data-icon">◎</div>لا يوجد شركاء</div>'; return; }
    const colors = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ef4444'];
    grid.innerHTML = PartnerActions.data.map((p, i) => {
      const bal = (p.capital || 0) + (p.profitShare || 0) - (p.withdrawals || 0);
      const color = p.color || colors[i % colors.length];
      return `<div class="partner-card">
        <div class="partner-card-accent" style="background:${color};"></div>
        <div class="pc-avatar" style="background:${color};">${(p.name||'؟').charAt(0)}</div>
        <div class="pc-name">${H.escape(p.name)}</div>
        <div class="pc-share">حصة ${p.share || 0}% من الشركة</div>
        <div class="pc-balance ${bal>=0?'text-success':''}">
          ${bal < 0 ? '-' : ''}${H.fmt(Math.abs(bal))} <span style="font-size:0.9rem;font-weight:400;">${H.currency()}</span>
        </div>
        <div class="pc-stats">
          <div class="pc-stat"><div class="pc-stat-label">رأس المال</div><div class="pc-stat-val" style="color:#10b981;">${H.fmt(p.capital||0)}</div></div>
          <div class="pc-stat"><div class="pc-stat-label">الأرباح</div><div class="pc-stat-val" style="color:#3b82f6;">${H.fmt(p.profitShare||0)}</div></div>
          <div class="pc-stat"><div class="pc-stat-label">السحوبات</div><div class="pc-stat-val" style="color:#ef4444;">${H.fmt(p.withdrawals||0)}</div></div>
        </div>
        <div class="flex gap-1 mt-2">
          <button class="btn btn-ghost btn-sm" onclick="PartnerActions.recordTx('${p.id}')">+ معاملة</button>
          ${H.hasPerm('partners_edit')?`<button class="btn btn-ghost btn-sm" onclick="PartnerActions.showForm('${p.id}')">تعديل</button>`:''}
          ${H.hasPerm('partners_delete')?`<button class="btn btn-danger btn-sm" onclick="PartnerActions.delete('${p.id}')">حذف</button>`:''}
        </div>
      </div>`;
    }).join('');
  },
  async showTab(tab, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const cont = document.getElementById('partnerTabContent');
    if (!cont) return;
    if (tab === 'summary') {
      const totalCap = PartnerActions.data.reduce((s,p)=>s+(p.capital||0),0);
      const totalWit = PartnerActions.data.reduce((s,p)=>s+(p.withdrawals||0),0);
      const totalProfit = PartnerActions.data.reduce((s,p)=>s+(p.profitShare||0),0);
      cont.innerHTML = `<div class="card">
        <div class="card-header"><span class="card-title">ملخص الشراكة</span></div>
        <div class="card-body">
          <div class="cashbox-overview">
            <div class="cashbox-card"><div class="cbc-label">إجمالي رأس المال</div><div class="cbc-val" style="color:#10b981;">${H.fmt(totalCap)}</div></div>
            <div class="cashbox-card"><div class="cbc-label">إجمالي الأرباح الموزعة</div><div class="cbc-val" style="color:#3b82f6;">${H.fmt(totalProfit)}</div></div>
            <div class="cashbox-card"><div class="cbc-label">إجمالي السحوبات</div><div class="cbc-val" style="color:#ef4444;">${H.fmt(totalWit)}</div></div>
          </div>
          <table class="data-table"><thead><tr><th>الشريك</th><th>الحصة</th><th>رأس المال</th><th>الأرباح</th><th>السحوبات</th><th>الرصيد الصافي</th></tr></thead>
          <tbody>${PartnerActions.data.map(p=>{const b=(p.capital||0)+(p.profitShare||0)-(p.withdrawals||0);return`<tr>
            <td class="fw-7">${H.escape(p.name)}</td><td>${p.share||0}%</td>
            <td class="amt-income">${H.fmt(p.capital||0)}</td><td class="amt-income">${H.fmt(p.profitShare||0)}</td>
            <td class="amt-expense">${H.fmt(p.withdrawals||0)}</td>
            <td class="${b>=0?'amt-income':'amt-expense'}">${H.fmt(b)} ${H.currency()}</td>
           </tr>`;}).join('')}</tbody></table>
        </div>
      </div>`;
    } else {
      cont.innerHTML = PartnerActions.data.map(p => {
        const bal = (p.capital || 0) + (p.profitShare || 0) - (p.withdrawals || 0);
        return `<div class="card mb-2">
          <div class="card-header"><span class="card-title">كشف حساب — ${H.escape(p.name)}</span><button class="btn btn-ghost btn-sm" onclick="window.print()">🖨</button></div>
          <div>
            <div class="ledger-row"><div class="lr-info"><div class="lr-label">رأس المال المساهم</div></div><div class="amt-income">${H.fmt(p.capital||0)} ${H.currency()}</div></div>
            <div class="ledger-row"><div class="lr-info"><div class="lr-label">حصة الأرباح الموزعة (${p.share}%)</div></div><div class="amt-income">${H.fmt(p.profitShare||0)} ${H.currency()}</div></div>
            <div class="ledger-row"><div class="lr-info"><div class="lr-label">إجمالي السحوبات</div></div><div class="amt-expense">-${H.fmt(p.withdrawals||0)} ${H.currency()}</div></div>
            <div class="ledger-row total"><div class="lr-info"><div class="lr-label">الرصيد الصافي</div></div><div class="${bal>=0?'amt-income':'amt-expense'}">${H.fmt(bal)} ${H.currency()}</div></div>
          </div>
        </div>`;
      }).join('');
    }
  },
  async showForm(id) {
    const rec = id ? PartnerActions.data.find(p => p.id === id) : null;
    UI.openModal(rec ? 'تعديل الشريك' : 'إضافة شريك جديد', `
      <div class="form-grid">
        <div class="form-group col-full"><label>الاسم الكامل <span class="req">*</span></label><input type="text" class="form-control" id="fpName" value="${H.escape(rec?.name||'')}"></div>
        <div class="form-group"><label>نسبة الحصة (%) <span class="req">*</span></label><input type="number" class="form-control" id="fpShare" min="0" max="100" value="${rec?.share||''}"></div>
        <div class="form-group"><label>رأس المال الأولي</label><input type="number" class="form-control" id="fpCapital" min="0" value="${rec?.capital||''}"></div>
        <div class="form-group"><label>الهاتف</label><input type="text" class="form-control" id="fpPhone" value="${H.escape(rec?.phone||'')}"></div>
        <div class="form-group"><label>البريد الإلكتروني</label><input type="email" class="form-control" id="fpEmail" value="${H.escape(rec?.email||'')}"></div>
        <div class="form-group col-full"><label>العنوان</label><input type="text" class="form-control" id="fpAddress" value="${H.escape(rec?.address||'')}"></div>
        <div class="form-group col-full"><label>ملاحظات</label><textarea class="form-control" id="fpNotes">${H.escape(rec?.notes||'')}</textarea></div>
        <div class="form-group"><label>الحالة</label><select class="form-control" id="fpStatus"><option value="active" ${rec?.status!=='inactive'?'selected':''}>نشط</option><option value="inactive" ${rec?.status==='inactive'?'selected':''}>غير نشط</option></select></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button><button class="btn btn-primary" onclick="PartnerActions.save('${id||''}')">حفظ</button></div>`);
  },
  async save(id) {
    const name = document.getElementById('fpName')?.value?.trim();
    const share = parseFloat(document.getElementById('fpShare')?.value) || 0;
    if (!name) { Toast.show('أدخل اسم الشريك', 'error'); return; }
    const data = { name, share, capital: parseFloat(document.getElementById('fpCapital')?.value)||0, phone: document.getElementById('fpPhone')?.value, email: document.getElementById('fpEmail')?.value, address: document.getElementById('fpAddress')?.value, notes: document.getElementById('fpNotes')?.value, status: document.getElementById('fpStatus')?.value };
    try {
      if (id) { await updateDoc(doc(db, 'partners', id), { ...data, updatedAt: serverTimestamp() }); Toast.show('تم التعديل', 'success'); }
      else { await addDoc(collection(db, 'partners'), { ...data, withdrawals: 0, profitShare: 0, createdAt: serverTimestamp() }); Toast.show('تمت الإضافة', 'success'); }
      await logAudit(id?'تعديل شريك':'إضافة شريك', 'partner', name);
      UI.closeModal();
      await PartnerActions.load();
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async delete(id) {
    const rec = PartnerActions.data.find(p => p.id === id);
    UI.confirm('حذف الشريك', `هل أنت متأكد من حذف ${rec?.name}؟`, async () => {
      await deleteDoc(doc(db, 'partners', id));
      await logAudit('حذف شريك', 'partner', rec?.name);
      Toast.show('تم الحذف', 'warning');
      await PartnerActions.load();
    });
  },
  async recordTx(partnerId) {
    const partner = PartnerActions.data.find(p => p.id === partnerId);
    UI.openModal(`معاملة — ${partner.name}`, `
      <div class="form-grid">
        <div class="form-group"><label>نوع المعاملة</label>
          <select class="form-control" id="txType">
            <option value="capital">مساهمة رأس مال</option>
            <option value="withdrawal">سحب</option>
            <option value="profit">توزيع أرباح</option>
          </select>
        </div>
        <div class="form-group"><label>المبلغ</label><input type="number" class="form-control" id="txAmount" min="0" step="0.01"></div>
        <div class="form-group col-full"><label>ملاحظات</label><input type="text" class="form-control" id="txNotes"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button><button class="btn btn-primary" onclick="PartnerActions.saveTx('${partnerId}')">تسجيل</button></div>`, false, true);
  },
  async saveTx(partnerId) {
    const type = document.getElementById('txType')?.value;
    const amount = parseFloat(document.getElementById('txAmount')?.value);
    const notes = document.getElementById('txNotes')?.value;
    if (!amount || amount <= 0) { Toast.show('أدخل مبلغاً صحيحاً', 'error'); return; }
    const updates = {};
    if (type === 'capital') updates.capital = increment(amount);
    else if (type === 'withdrawal') updates.withdrawals = increment(amount);
    else if (type === 'profit') updates.profitShare = increment(amount);
    updates.updatedAt = serverTimestamp();
    try {
      await updateDoc(doc(db, 'partners', partnerId), updates);
      await logAudit('معاملة شريك', 'partner', `${type} — ${H.fmt(amount)}`);
      Toast.show('تم تسجيل المعاملة', 'success');
      UI.closeModal();
      await PartnerActions.load();
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  }
};

// ============================================================
// PROJECTS
// ============================================================
Pages.projects = async function() {
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">المشاريع</div></div>
      <div class="ph-actions">
        <select class="form-control filter-select" id="projStatusFilter" onchange="ProjectActions.filterByStatus(this.value)" style="width:auto;">
          <option value="">كل المشاريع</option>
          <option value="active">نشطة</option><option value="completed">مكتملة</option>
          <option value="pending">معلقة</option><option value="archived">مؤرشفة</option>
        </select>
        ${H.hasPerm('projects_create')?`<button class="btn btn-primary" onclick="ProjectActions.showForm()">+ مشروع جديد</button>`:''}
      </div>
    </div>
    <div id="projectGrid" class="project-grid"><div class="no-data">جاري التحميل...</div></div>`;
  await ProjectActions.load();
};

const ProjectActions = {
  data: [],
  async load() {
    const snap = await getDocs(query(collection(db, 'projects'), orderBy('createdAt', 'desc')));
    ProjectActions.data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    ProjectActions.render(ProjectActions.data);
  },
  filterByStatus(status) {
    const filtered = status ? ProjectActions.data.filter(p => p.status === status) : ProjectActions.data;
    ProjectActions.render(filtered);
  },
  async render(projects) {
    const grid = document.getElementById('projectGrid');
    if (!grid) return;
    const incSnap = await getDocs(collection(db, 'income'));
    const expSnap = await getDocs(collection(db, 'expenses'));
    const income = incSnap.docs.map(d => d.data());
    const expenses = expSnap.docs.map(d => d.data());
    const statusColors = { active: '#10b981', completed: '#3b82f6', pending: '#f59e0b', archived: '#6b7280', on_hold: '#ef4444' };
    if (!projects.length) { grid.innerHTML = '<div class="no-data"><div class="no-data-icon">◧</div>لا توجد مشاريع</div>'; return; }
    grid.innerHTML = projects.map(p => {
      const inc = income.filter(r => r.projectId === p.id).reduce((s, r) => s + (r.amount || 0), 0);
      const exp = expenses.filter(r => r.projectId === p.id).reduce((s, r) => s + (r.amount || 0), 0);
      const net = inc - exp;
      const pct = p.budget ? Math.min(100, Math.round((inc / p.budget) * 100)) : 0;
      const color = statusColors[p.status] || '#6b7280';
      return `<div class="project-card" onclick="ProjectActions.viewDetail('${p.id}')">
        <div class="proj-status"><div class="proj-status-dot" style="background:${color};"></div><span class="badge" style="background:${color}18;color:${color};">${H.statusLabel(p.status)}</span></div>
        <div class="proj-name">${H.escape(p.name)}</div>
        <div class="proj-client">👤 ${H.escape(p.client||'-')}</div>
        <div class="proj-finance">
          <div class="pf-row"><span class="pf-label">الميزانية</span><span class="pf-val">${H.fmt(p.budget||0)}</span></div>
          <div class="pf-row"><span class="pf-label">الإيرادات</span><span class="pf-val" style="color:#10b981;">${H.fmt(inc)}</span></div>
          <div class="pf-row"><span class="pf-label">المصروفات</span><span class="pf-val" style="color:#ef4444;">${H.fmt(exp)}</span></div>
          <div class="pf-row"><span class="pf-label">الربح/الخسارة</span><span class="pf-val" style="color:${net>=0?'#10b981':'#ef4444'};">${H.fmt(net)}</span></div>
        </div>
        <div class="proj-bar"><div class="proj-bar-fill" style="width:${pct}%;background:${net>=0?'#10b981':'#ef4444'};"></div></div>
        <div class="text-xs text-muted mt-1">${pct}% من الميزانية</div>
        <div class="flex gap-1 mt-2" onclick="event.stopPropagation()">
          ${H.hasPerm('projects_edit')?`<button class="btn btn-ghost btn-sm" onclick="ProjectActions.showForm('${p.id}')">تعديل</button>`:''}
          ${H.hasPerm('projects_archive')?`<button class="btn btn-ghost btn-sm" onclick="ProjectActions.archive('${p.id}')">أرشفة</button>`:''}
          ${H.hasPerm('projects_delete')?`<button class="btn btn-danger btn-sm" onclick="ProjectActions.delete('${p.id}')">حذف</button>`:''}
        </div>
      </div>`;
    }).join('');
  },
  async showForm(id) {
    const rec = id ? ProjectActions.data.find(p => p.id === id) : null;
    UI.openModal(rec ? 'تعديل المشروع' : 'مشروع جديد', `
      <div class="form-grid">
        <div class="form-group col-full"><label>اسم المشروع <span class="req">*</span></label><input type="text" class="form-control" id="fpName" value="${H.escape(rec?.name||'')}"></div>
        <div class="form-group col-full"><label>العميل</label><input type="text" class="form-control" id="fpClient" value="${H.escape(rec?.client||'')}"></div>
        <div class="form-group"><label>الميزانية</label><input type="number" class="form-control" id="fpBudget" value="${rec?.budget||''}"></div>
        <div class="form-group"><label>الحالة</label>
          <select class="form-control" id="fpStatus">
            ${['pending','active','completed','archived','on_hold'].map(s=>`<option value="${s}" ${rec?.status===s?'selected':''}>${H.statusLabel(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>تاريخ البداية</label><input type="date" class="form-control" id="fpStart" value="${rec?.startDate||''}"></div>
        <div class="form-group"><label>تاريخ النهاية</label><input type="date" class="form-control" id="fpEnd" value="${rec?.endDate||''}"></div>
        <div class="form-group col-full"><label>الوصف</label><textarea class="form-control" id="fpDesc">${H.escape(rec?.description||'')}</textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button><button class="btn btn-primary" onclick="ProjectActions.save('${id||''}')">حفظ</button></div>`);
  },
  async save(id) {
    const name = document.getElementById('fpName')?.value?.trim();
    if (!name) { Toast.show('أدخل اسم المشروع', 'error'); return; }
    const data = { name, client: document.getElementById('fpClient')?.value||'', budget: parseFloat(document.getElementById('fpBudget')?.value)||0, status: document.getElementById('fpStatus')?.value, startDate: document.getElementById('fpStart')?.value||'', endDate: document.getElementById('fpEnd')?.value||'', description: document.getElementById('fpDesc')?.value||'' };
    try {
      if (id) { await updateDoc(doc(db, 'projects', id), { ...data, updatedAt: serverTimestamp() }); Toast.show('تم التعديل', 'success'); }
      else { await addDoc(collection(db, 'projects'), { ...data, createdBy: State.user.uid, createdByName: State.profile.name, createdAt: serverTimestamp() }); Toast.show('تمت الإضافة', 'success'); }
      await logAudit(id?'تعديل مشروع':'إضافة مشروع', 'project', name);
      UI.closeModal();
      await ProjectActions.load();
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async archive(id) {
    await updateDoc(doc(db, 'projects', id), { status: 'archived', updatedAt: serverTimestamp() });
    Toast.show('تم الأرشفة', 'info');
    await ProjectActions.load();
  },
  async delete(id) {
    const rec = ProjectActions.data.find(p => p.id === id);
    UI.confirm('حذف المشروع', `هل أنت متأكد من حذف "${rec?.name}"؟`, async () => {
      await deleteDoc(doc(db, 'projects', id));
      await logAudit('حذف مشروع', 'project', rec?.name);
      Toast.show('تم الحذف', 'warning');
      await ProjectActions.load();
    });
  },
  async viewDetail(id) {
    const p = ProjectActions.data.find(x => x.id === id);
    if (!p) return;
    const incSnap = await getDocs(query(collection(db, 'income'), where('projectId', '==', id)));
    const expSnap = await getDocs(query(collection(db, 'expenses'), where('projectId', '==', id)));
    const inc = incSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
    const exp = expSnap.docs.reduce((s, d) => s + (d.data().amount || 0), 0);
    const net = inc - exp;
    UI.openModal('تفاصيل المشروع — ' + p.name, `
      <div style="display:grid;gap:0.75rem;margin-bottom:1rem;">
        ${[['اسم المشروع',p.name],['العميل',p.client||'-'],['الحالة',H.statusLabel(p.status)],['الميزانية',`${H.fmt(p.budget||0)} ${H.currency()}`],['تاريخ البداية',p.startDate||'-'],['تاريخ النهاية',p.endDate||'-'],['الوصف',p.description||'-']].map(([k,v])=>`<div class="uc-detail"><span class="uc-dl">${k}</span><span class="fw-7">${H.escape(String(v))}</span></div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;">
        <div class="cashbox-card"><div class="cbc-label">الإيرادات</div><div class="cbc-val" style="color:#10b981;">${H.fmt(inc)}</div></div>
        <div class="cashbox-card"><div class="cbc-label">المصروفات</div><div class="cbc-val" style="color:#ef4444;">${H.fmt(exp)}</div></div>
        <div class="cashbox-card"><div class="cbc-label">الربح/الخسارة</div><div class="cbc-val" style="color:${net>=0?'#10b981':'#ef4444'};">${H.fmt(net)}</div></div>
      </div>`, true);
  }
};

// ============================================================
// CUSTODY
// ============================================================
Pages.custody = async function() {
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">العهد والسلف</div><div class="ph-sub">إدارة العهد المالية لكل موظف</div></div>
      <div class="ph-actions">${H.hasPerm('custody_create')?`<button class="btn btn-primary" onclick="CustodyActions.showForm()">+ إصدار عهدة</button>`:''}</div>
    </div>
    <div class="tab-bar">
      <button class="tab-btn active" onclick="CustodyActions.showTab('active',this)">عهد نشطة</button>
      <button class="tab-btn" onclick="CustodyActions.showTab('settled',this)">مسوّاة</button>
      <button class="tab-btn" onclick="CustodyActions.showTab('all',this)">الكل</button>
    </div>
    <div id="custodyContent"></div>`;
  await CustodyActions.load();
  CustodyActions.showTab('active', document.querySelector('.tab-btn.active'));
};

const CustodyActions = {
  data: [],
  async load() {
    const snap = await getDocs(query(collection(db, 'custody'), orderBy('createdAt', 'desc')));
    CustodyActions.data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async showTab(status, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    let data = CustodyActions.data;
    if (status === 'active') data = data.filter(c => c.status === 'active');
    else if (status === 'settled') data = data.filter(c => c.status === 'settled');
    const cont = document.getElementById('custodyContent');
    if (!cont) return;
    if (!data.length) { cont.innerHTML = '<div class="no-data"><div class="no-data-icon">◷</div>لا توجد عهد</div>'; return; }
    const colors = ['#3b82f6','#10b981','#8b5cf6','#f59e0b'];
    cont.innerHTML = `<div class="custody-grid">${data.map((c, i) => `
      <div class="custody-card">
        <div class="cc-header">
          <div class="cc-avatar" style="background:${colors[i%colors.length]};">${(c.employeeName||'؟').charAt(0)}</div>
          <div>
            <div class="fw-7">${H.escape(c.employeeName||'')}</div>
            <span class="badge ${c.status==='active'?'badge-amber':'badge-green'}">${c.status==='active'?'نشطة':'مسوّاة'}</span>
          </div>
        </div>
        <div class="cc-stats">
          <div class="cc-stat"><div class="cc-stat-label">المبلغ الأصلي</div><div class="cc-stat-val">${H.fmt(c.amount||0)}</div></div>
          <div class="cc-stat"><div class="cc-stat-label">المصروف</div><div class="cc-stat-val" style="color:#ef4444;">${H.fmt(c.spent||0)}</div></div>
          <div class="cc-stat"><div class="cc-stat-label">المتبقي</div><div class="cc-stat-val" style="color:#10b981;">${H.fmt(c.remaining||0)}</div></div>
          <div class="cc-stat"><div class="cc-stat-label">تاريخ الإصدار</div><div class="cc-stat-val" style="font-family:var(--font-ui);font-size:0.75rem;">${H.fmtDate(c.createdAt)}</div></div>
        </div>
        <div class="mt-2 text-sm text-muted">${H.escape(c.notes||'')}</div>
        <div class="flex gap-1 mt-2">
          ${H.hasPerm('custody_settle')&&c.status==='active'?`<button class="btn btn-green btn-sm" onclick="CustodyActions.settle('${c.id}')">تسوية</button>`:''}
          ${H.hasPerm('custody_edit')&&c.status==='active'?`<button class="btn btn-ghost btn-sm" onclick="CustodyActions.addExpense('${c.id}')">+ مصروف</button>`:''}
          <button class="btn btn-ghost btn-sm" onclick="CustodyActions.viewLedger('${c.id}')">كشف حساب</button>
        </div>
      </div>`).join('')}</div>`;
  },
  async showForm() {
    const users = (await getDocs(collection(db, 'users'))).docs.map(d => ({ id: d.id, ...d.data() }));
    UI.openModal('إصدار عهدة جديدة', `
      <div class="form-grid">
        <div class="form-group"><label>الموظف <span class="req">*</span></label>
          <select class="form-control" id="ceEmp">
            ${users.filter(u=>u.active).map(u=>`<option value="${u.id}" data-name="${H.escape(u.name)}">${H.escape(u.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>المبلغ <span class="req">*</span></label><input type="number" class="form-control" id="ceAmount" min="0" step="0.01"></div>
        <div class="form-group"><label>طريقة الصرف</label>
          <select class="form-control" id="ceMethod"><option value="cash">نقدي</option><option value="bank">بنك</option></select>
        </div>
        <div class="form-group"><label>تاريخ الإصدار</label><input type="date" class="form-control" id="ceDate" value="${new Date().toISOString().split('T')[0]}"></div>
        <div class="form-group col-full"><label>الغرض / الملاحظات</label><textarea class="form-control" id="ceNotes" rows="3"></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button><button class="btn btn-primary" onclick="CustodyActions.save()">إصدار العهدة</button></div>`, false, true);
  },
  async save() {
    const empEl = document.getElementById('ceEmp');
    const empId = empEl?.value;
    const empName = empEl?.selectedOptions[0]?.dataset?.name || '';
    const amount = parseFloat(document.getElementById('ceAmount')?.value);
    const method = document.getElementById('ceMethod')?.value;
    const date = document.getElementById('ceDate')?.value;
    const notes = document.getElementById('ceNotes')?.value;
    if (!empId || !amount) { Toast.show('يرجى ملء الحقول المطلوبة', 'error'); return; }
    try {
      const ref = await addDoc(collection(db, 'custody'), { employeeId: empId, employeeName: empName, amount, spent: 0, remaining: amount, method, date, notes, status: 'active', transactions: [], createdBy: State.user.uid, createdByName: State.profile.name, createdAt: serverTimestamp() });
      await logAudit('إصدار عهدة', 'custody', `${empName} — ${H.fmt(amount)}`, null, { amount }, ref.id);
      Toast.show('تم إصدار العهدة', 'success');
      UI.closeModal();
      await CustodyActions.load();
      CustodyActions.showTab('active', null);
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async addExpense(custodyId) {
    const cust = CustodyActions.data.find(c => c.id === custodyId);
    UI.openModal('إضافة مصروف من العهدة', `
      <div class="alert alert-info">المتبقي في العهدة: ${H.fmt(cust?.remaining||0)} ${H.currency()}</div>
      <div class="form-grid">
        <div class="form-group"><label>المبلغ <span class="req">*</span></label><input type="number" class="form-control" id="ceExpAmount" min="0" max="${cust?.remaining||0}" step="0.01"></div>
        <div class="form-group"><label>الفئة</label>
          <select class="form-control" id="ceExpCat">
            ${['materials','transport','general','maintenance','misc'].map(c=>`<option value="${c}">${H.categoryLabel(c)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group col-full"><label>السبب <span class="req">*</span></label><input type="text" class="form-control" id="ceExpReason"></div>
      </div>
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button><button class="btn btn-primary" onclick="CustodyActions.saveExpense('${custodyId}')">حفظ</button></div>`, false, true);
  },
  async saveExpense(custodyId) {
    const amount = parseFloat(document.getElementById('ceExpAmount')?.value);
    const category = document.getElementById('ceExpCat')?.value;
    const reason = document.getElementById('ceExpReason')?.value;
    const cust = CustodyActions.data.find(c => c.id === custodyId);
    if (!amount || !reason) { Toast.show('يرجى ملء الحقول المطلوبة', 'error'); return; }
    if (amount > (cust?.remaining || 0)) { Toast.show('المبلغ يتجاوز المتبقي في العهدة', 'error'); return; }
    const tx = { id: H.genId(), amount, category, reason, date: new Date().toISOString(), addedBy: State.profile.name };
    try {
      const newSpent = (cust.spent || 0) + amount;
      const newRemaining = (cust.remaining || 0) - amount;
      const newTxs = [...(cust.transactions || []), tx];
      await updateDoc(doc(db, 'custody', custodyId), { spent: newSpent, remaining: newRemaining, transactions: newTxs, updatedAt: serverTimestamp() });
      await addDoc(collection(db, 'expenses'), { voucher: `EXP-CUS-${Date.now().toString().slice(-5)}`, category, reason, amount, method: 'cash', approved: true, custodyId, projectId: null, createdBy: State.user.uid, createdByName: State.profile.name, createdAt: serverTimestamp() });
      await logAudit('مصروف من عهدة', 'custody', `${cust.employeeName} — ${H.fmt(amount)}`);
      Toast.show('تم تسجيل المصروف', 'success');
      UI.closeModal();
      await CustodyActions.load();
      CustodyActions.showTab('active', null);
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async settle(custodyId) {
    const cust = CustodyActions.data.find(c => c.id === custodyId);
    UI.confirm('تسوية العهدة', `هل تريد تسوية عهدة ${cust?.employeeName}؟ المتبقي: ${H.fmt(cust?.remaining||0)} ${H.currency()}`, async () => {
      await updateDoc(doc(db, 'custody', custodyId), { status: 'settled', settledAt: serverTimestamp(), settledBy: State.profile.name });
      await logAudit('تسوية عهدة', 'custody', `${cust.employeeName} — متبقي: ${H.fmt(cust.remaining)}`);
      Toast.show('تم التسوية', 'success');
      await CustodyActions.load();
      CustodyActions.showTab('settled', null);
    });
  },
  viewLedger(custodyId) {
    const cust = CustodyActions.data.find(c => c.id === custodyId);
    if (!cust) return;
    const txs = cust.transactions || [];
    UI.openModal(`كشف حساب عهدة — ${cust.employeeName}`, `
      <div class="mb-2">
        ${[['المبلغ الأصلي',H.fmt(cust.amount||0),true],['المصروف',H.fmt(cust.spent||0),false],['المتبقي',H.fmt(cust.remaining||0),true]].map(([l,v,positive])=>`<div class="ledger-row"><span>${l}</span><span class="${positive?'amt-income':'amt-expense'}">${v} ${H.currency()}</span></div>`).join('')}
      </div>
      <div class="card-title mb-1">سجل المصروفات</div>
      ${txs.length ? `<table class="data-table"><thead><tr><th>التاريخ</th><th>السبب</th><th>الفئة</th><th>المبلغ</th></tr></thead><tbody>
        ${txs.map(t=>`<tr><td>${new Date(t.date).toLocaleDateString('ar-AE')}</td><td>${H.escape(t.reason)}</td><td>${H.categoryLabel(t.category)}</td><td class="amt-expense">-${H.fmt(t.amount)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="no-data">لا توجد مصروفات</div>'}`, true);
  }
};

// ============================================================
// CASH & BANK
// ============================================================
Pages.cashbank = async function() {
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header"><div><div class="ph-title">الخزينة والبنك</div></div></div>
    <div id="cashboxOverview" class="cashbox-overview"><div class="no-data">جاري التحميل...</div></div>
    <div class="tab-bar">
      <button class="tab-btn active" onclick="CashActions.showTab('cash',this)">حركة الخزينة</button>
      <button class="tab-btn" onclick="CashActions.showTab('bank',this)">حركة البنك</button>
    </div>
    <div id="cashTabContent"></div>`;
  await CashActions.load();
  CashActions.showTab('cash', document.querySelector('.tab-btn.active'));
};

const CashActions = {
  income: [], expenses: [],
  async load() {
    const [iSnap, eSnap] = await Promise.all([getDocs(collection(db, 'income')), getDocs(collection(db, 'expenses'))]);
    CashActions.income = iSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    CashActions.expenses = eSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const cashIn = CashActions.income.filter(r => r.method === 'cash').reduce((s, r) => s + (r.amount || 0), 0);
    const cashOut = CashActions.expenses.filter(r => r.method === 'cash').reduce((s, r) => s + (r.amount || 0), 0);
    const bankIn = CashActions.income.filter(r => r.method !== 'cash').reduce((s, r) => s + (r.amount || 0), 0);
    const bankOut = CashActions.expenses.filter(r => r.method !== 'cash').reduce((s, r) => s + (r.amount || 0), 0);
    const el = document.getElementById('cashboxOverview');
    if (el) el.innerHTML = `
      <div class="cashbox-card"><div class="cbc-icon">💰</div><div class="cbc-label">رصيد الخزينة النقدية</div><div class="cbc-val ${cashIn-cashOut>=0?'':'text-danger'}">${H.fmt(cashIn-cashOut)} ${H.currency()}</div></div>
      <div class="cashbox-card"><div class="cbc-icon">🏦</div><div class="cbc-label">رصيد البنك والتحويلات</div><div class="cbc-val ${bankIn-bankOut>=0?'':'text-danger'}">${H.fmt(bankIn-bankOut)} ${H.currency()}</div></div>
      <div class="cashbox-card"><div class="cbc-icon">📊</div><div class="cbc-label">الرصيد الإجمالي</div><div class="cbc-val">${H.fmt(cashIn-cashOut+bankIn-bankOut)} ${H.currency()}</div></div>`;
  },
  showTab(type, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const isCash = type === 'cash';
    const filteredInc = CashActions.income.filter(r => isCash ? r.method === 'cash' : r.method !== 'cash');
    const filteredExp = CashActions.expenses.filter(r => isCash ? r.method === 'cash' : r.method !== 'cash');
    const movements = [
      ...filteredInc.map(r => ({ ...r, txType: 'income' })),
      ...filteredExp.map(r => ({ ...r, txType: 'expense' }))
    ].sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
    let running = 0;
    const cont = document.getElementById('cashTabContent');
    if (!cont) return;
    if (!movements.length) { cont.innerHTML = '<div class="card"><div class="no-data">لا توجد حركات</div></div>'; return; }
    cont.innerHTML = `<div class="card">
      <div class="card-header"><span class="card-title">${isCash ? 'دفتر الخزينة النقدية' : 'دفتر البنك'}</span><button class="btn btn-ghost btn-sm" onclick="window.print()">🖨 طباعة</button></div>
      <div class="table-wrap"><table class="data-table"><thead><tr>
        <th>التاريخ</th><th>القسيمة</th><th>البيان</th><th>النوع</th><th>وارد</th><th>صادر</th><th>الرصيد</th>
       </tr></thead><tbody>${movements.map(r => {
        if (r.txType === 'income') running += r.amount || 0;
        else running -= r.amount || 0;
        return `<tr>
          <td>${H.fmtDate(r.createdAt)}</td>
          <td class="mono" style="font-size:0.82rem;">${H.escape(r.voucher || '')}</td>
          <td>${r.txType === 'income' ? H.sourceLabel(r.source) : H.categoryLabel(r.category)}</td>
          <td>${r.txType === 'income' ? '<span class="badge badge-green">وارد</span>' : '<span class="badge badge-red">صادر</span>'}</td>
          <td class="amt-income">${r.txType === 'income' ? H.fmt(r.amount) : '-'}</td>
          <td class="amt-expense">${r.txType === 'expense' ? H.fmt(r.amount) : '-'}</td>
          <td class="${running >= 0 ? 'amt-income' : 'amt-expense'}">${H.fmt(running)} ${H.currency()}</td>
        </tr>`;
      }).join('')}</tbody></table></div>
    </div>`;
  }
};

// ============================================================
// REPORTS
// ============================================================
Pages.reports = async function() {
  if (!H.hasPerm('reports_view')) { Toast.show('غير مصرح', 'error'); return; }
  const reportTypes = [
    { id: 'daily', icon: '📅', name: 'التقرير اليومي', desc: 'معاملات اليوم الحالي' },
    { id: 'monthly', icon: '📆', name: 'الملخص الشهري', desc: 'الإيرادات والمصروفات الشهرية' },
    { id: 'income', icon: '📈', name: 'تقرير الإيرادات', desc: 'تفصيل كامل للإيرادات' },
    { id: 'expense', icon: '📉', name: 'تقرير المصروفات', desc: 'تفصيل كامل للمصروفات' },
    { id: 'project', icon: '🏗', name: 'ربحية المشاريع', desc: 'تحليل الربح والخسارة' },
    { id: 'partners', icon: '🤝', name: 'كشف حساب الشركاء', desc: 'أرصدة وحركات الشركاء' },
    { id: 'cashflow', icon: '💵', name: 'التدفق النقدي', desc: 'حركة النقد والبنك' },
    { id: 'custody', icon: '◷', name: 'تقرير العهد', desc: 'العهد الصادرة والمسوّاة' },
    { id: 'audit', icon: '🔍', name: 'تقرير المراجعة', desc: 'سجل كامل لجميع العمليات' }
  ];
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header"><div><div class="ph-title">التقارير</div><div class="ph-sub">تقارير مالية شاملة قابلة للطباعة والتصدير</div></div></div>
    <div class="report-grid">${reportTypes.map(r => `
      <div class="report-card" onclick="ReportActions.generate('${r.id}')">
        <div class="rc-icon">${r.icon}</div>
        <div class="rc-name">${r.name}</div>
        <div class="rc-desc">${r.desc}</div>
      </div>`).join('')}
    </div>`;
};

const ReportActions = {
  async generate(type) {
    const settings = State.settings || {};
    const [incSnap, expSnap, projSnap, partSnap, custSnap] = await Promise.all([
      getDocs(collection(db, 'income')), getDocs(collection(db, 'expenses')),
      getDocs(collection(db, 'projects')), getDocs(collection(db, 'partners')),
      getDocs(collection(db, 'custody'))
    ]);
    const income = incSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const projects = projSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const partners = partSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const custody = custSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const today = new Date().toLocaleDateString('ar-AE');
    let title = '', body = '';
    const tableStyle = 'width:100%;border-collapse:collapse;margin-top:1rem;';
    const thStyle = 'padding:8px;border:1px solid #e5e7eb;text-align:right;background:#f9fafb;font-weight:700;font-size:0.82rem;';
    const tdStyle = 'padding:8px;border:1px solid #e5e7eb;font-size:0.85rem;';

    if (type === 'income') {
      title = 'تقرير الإيرادات';
      body = `<table style="${tableStyle}"><thead><tr>${['القسيمة','التاريخ','المصدر','المشروع','طريقة الدفع','المبلغ','الحالة'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>
        ${income.map(r=>`<tr>${[r.voucher,H.fmtDate(r.createdAt),H.sourceLabel(r.source),r.projectName||'-',H.methodLabel(r.method),H.fmt(r.amount)+' '+H.currency(),r.approved?'معتمد':'معلق'].map(v=>`<td style="${tdStyle}">${v}</td>`).join('')}</tr>`).join('')}
      </tbody><tfoot><tr><td colspan="5" style="${tdStyle}font-weight:700;">الإجمالي</td><td colspan="2" style="${tdStyle}font-weight:700;">${H.fmt(income.reduce((s,r)=>s+(r.amount||0),0))} ${H.currency()}</td></tr></tfoot></table>`;
    } else if (type === 'expense') {
      title = 'تقرير المصروفات';
      body = `<table style="${tableStyle}"><thead><tr>${['القسيمة','التاريخ','الفئة','المشروع','السبب','المبلغ','الحالة'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>
        ${expenses.map(r=>`<tr>${[r.voucher,H.fmtDate(r.createdAt),H.categoryLabel(r.category),r.projectName||'-',r.reason||'-',H.fmt(r.amount)+' '+H.currency(),r.approved?'معتمد':'معلق'].map(v=>`<td style="${tdStyle}">${v}</td>`).join('')}</tr>`).join('')}
      </tbody><tfoot><tr><td colspan="5" style="${tdStyle}font-weight:700;">الإجمالي</td><td colspan="2" style="${tdStyle}font-weight:700;">${H.fmt(expenses.reduce((s,r)=>s+(r.amount||0),0))} ${H.currency()}</td></tr></tfoot></table>`;
    } else if (type === 'project') {
      title = 'تقرير ربحية المشاريع';
      body = `<table style="${tableStyle}"><thead><tr>${['المشروع','العميل','الميزانية','الإيرادات','المصروفات','الربح/الخسارة','الحالة'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>
        ${projects.map(p=>{const inc=income.filter(r=>r.projectId===p.id).reduce((s,r)=>s+(r.amount||0),0);const exp=expenses.filter(r=>r.projectId===p.id).reduce((s,r)=>s+(r.amount||0),0);const net=inc-exp;return`<tr>${[p.name,p.client||'-',H.fmt(p.budget||0),H.fmt(inc),H.fmt(exp),H.fmt(net)+(net>=0?' ▲':' ▼'),H.statusLabel(p.status)].map(v=>`<td style="${tdStyle}">${v}</td>`).join('')}</tr>`;}).join('')}
      </tbody></table>`;
    } else if (type === 'partners') {
      title = 'كشف حساب الشركاء';
      body = `<table style="${tableStyle}"><thead><tr>${['الشريك','الحصة','رأس المال','الأرباح','السحوبات','الرصيد'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>
        ${partners.map(p=>{const b=(p.capital||0)+(p.profitShare||0)-(p.withdrawals||0);return`<tr>${[p.name,p.share+'%',H.fmt(p.capital||0),H.fmt(p.profitShare||0),H.fmt(p.withdrawals||0),H.fmt(b)].map(v=>`<td style="${tdStyle}">${v} ${H.currency()}</td>`).join('')}</tr>`;}).join('')}
      </tbody></table>`;
    } else if (type === 'daily') {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const todayInc = income.filter(r => r.date === todayStr);
      const todayExp = expenses.filter(r => r.date === todayStr);
      title = `التقرير اليومي — ${today}`;
      body = `<div style="display:flex;gap:2rem;margin:1rem 0;justify-content:center;">
        <div style="text-align:center"><div style="font-size:1.5rem;color:#10b981;font-weight:800;">${H.fmt(todayInc.reduce((s,r)=>s+(r.amount||0),0))} ${H.currency()}</div><div>إيرادات اليوم</div></div>
        <div style="text-align:center"><div style="font-size:1.5rem;color:#ef4444;font-weight:800;">${H.fmt(todayExp.reduce((s,r)=>s+(r.amount||0),0))} ${H.currency()}</div><div>مصروفات اليوم</div></div>
      </div>
      <p style="font-weight:700;">إيرادات اليوم</p>
      ${todayInc.length?`<table style="${tableStyle}"><thead><tr>${['القسيمة','المصدر','المبلغ'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>${todayInc.map(r=>`<tr>${[r.voucher,H.sourceLabel(r.source),H.fmt(r.amount)+' '+H.currency()].map(v=>`<td style="${tdStyle}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p>لا توجد إيرادات</p>'}
      <p style="font-weight:700;margin-top:1rem;">مصروفات اليوم</p>
      ${todayExp.length?`<table style="${tableStyle}"><thead><tr>${['القسيمة','الفئة','المبلغ'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>${todayExp.map(r=>`<tr>${[r.voucher,H.categoryLabel(r.category),H.fmt(r.amount)+' '+H.currency()].map(v=>`<td style="${tdStyle}">${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`:'<p>لا توجد مصروفات</p>'}`;
    } else if (type === 'monthly') {
      const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
      const mi = Array(12).fill(0), me = Array(12).fill(0);
      income.forEach(r => { const d = r.createdAt?.toDate?.(); if (d) mi[d.getMonth()] += r.amount||0; });
      expenses.forEach(r => { const d = r.createdAt?.toDate?.(); if (d) me[d.getMonth()] += r.amount||0; });
      title = 'الملخص الشهري';
      body = `<table style="${tableStyle}"><thead><tr>${['الشهر','الإيرادات','المصروفات','الصافي'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>
        ${months.map((m,i)=>`<tr><td style="${tdStyle}">${m}</td><td style="${tdStyle}color:#10b981;">${H.fmt(mi[i])}</td><td style="${tdStyle}color:#ef4444;">${H.fmt(me[i])}</td><td style="${tdStyle}color:${mi[i]-me[i]>=0?'#10b981':'#ef4444'};">${H.fmt(mi[i]-me[i])}</td></tr>`).join('')}
      </tbody></table>`;
    } else if (type === 'cashflow') {
      const ci=income.filter(r=>r.method==='cash').reduce((s,r)=>s+(r.amount||0),0);
      const co=expenses.filter(r=>r.method==='cash').reduce((s,r)=>s+(r.amount||0),0);
      const bi=income.filter(r=>r.method!=='cash').reduce((s,r)=>s+(r.amount||0),0);
      const bo=expenses.filter(r=>r.method!=='cash').reduce((s,r)=>s+(r.amount||0),0);
      title = 'تقرير التدفق النقدي';
      body = `<table style="${tableStyle}"><tbody>
        <tr><td colspan="2" style="${tdStyle}font-weight:700;background:#f9fafb;">الخزينة النقدية</td></tr>
        <tr><td style="${tdStyle}">وارد نقدي</td><td style="${tdStyle}color:#10b981;">${H.fmt(ci)} ${H.currency()}</td></tr>
        <tr><td style="${tdStyle}">صادر نقدي</td><td style="${tdStyle}color:#ef4444;">${H.fmt(co)} ${H.currency()}</td></tr>
        <tr><td style="${tdStyle}font-weight:700;">رصيد الخزينة</td><td style="${tdStyle}font-weight:700;color:${ci-co>=0?'#10b981':'#ef4444'};">${H.fmt(ci-co)} ${H.currency()}</td></tr>
        <tr><td colspan="2" style="${tdStyle}font-weight:700;background:#f9fafb;">البنك والتحويلات</td></tr>
        <tr><td style="${tdStyle}">وارد بنكي</td><td style="${tdStyle}color:#10b981;">${H.fmt(bi)} ${H.currency()}</td></tr>
        <tr><td style="${tdStyle}">صادر بنكي</td><td style="${tdStyle}color:#ef4444;">${H.fmt(bo)} ${H.currency()}</td></tr>
        <tr><td style="${tdStyle}font-weight:700;">رصيد البنك</td><td style="${tdStyle}font-weight:700;color:${bi-bo>=0?'#10b981':'#ef4444'};">${H.fmt(bi-bo)} ${H.currency()}</td></tr>
        <tr style="background:#eff6ff;"><td style="${tdStyle}font-weight:800;font-size:1.05em;">الرصيد الإجمالي</td><td style="${tdStyle}font-weight:800;font-size:1.05em;color:${ci-co+bi-bo>=0?'#10b981':'#ef4444'};">${H.fmt(ci-co+bi-bo)} ${H.currency()}</td></tr>
      </tbody></table>`;
    } else if (type === 'custody') {
      title = 'تقرير العهد';
      body = `<table style="${tableStyle}"><thead><tr>${['الموظف','المبلغ الأصلي','المصروف','المتبقي','الحالة','تاريخ الإصدار'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>
        ${custody.map(c=>`<tr>${[c.employeeName,H.fmt(c.amount||0),H.fmt(c.spent||0),H.fmt(c.remaining||0),c.status==='active'?'نشطة':'مسوّاة',H.fmtDate(c.createdAt)].map(v=>`<td style="${tdStyle}">${v}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
    } else {
      const auditSnap = await getDocs(query(collection(db, 'audit'), orderBy('createdAt', 'desc'), limit(100)));
      const auditData = auditSnap.docs.map(d => d.data());
      title = 'تقرير المراجعة';
      body = `<table style="${tableStyle}"><thead><tr>${['التاريخ','المستخدم','العملية','التفاصيل'].map(h=>`<th style="${thStyle}">${h}</th>`).join('')}</tr></thead><tbody>
        ${auditData.map(a=>`<tr>${[H.fmtDateTime(a.createdAt),a.userName||'-',a.action,a.details||'-'].map(v=>`<td style="${tdStyle}">${v}</td>`).join('')}</tr>`).join('')}
      </tbody></table>`;
    }
    const html = `<html dir="rtl"><head><meta charset="UTF-8"><title>${title}</title>
      <link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet">
      <style>body{font-family:'Tajawal',sans-serif;direction:rtl;padding:2rem;color:#111;}h1{color:#d97706;}h2{color:#374151;}@media print{body{padding:0;}}</style>
    </head><body>
      <div style="text-align:center;margin-bottom:2rem;border-bottom:3px solid #f59e0b;padding-bottom:1rem;">
        <h1>${settings.companyName || 'ProjeXWise ERP'}</h1>
        <h2>${title}</h2>
        <p style="color:#6b7280;">تاريخ التقرير: ${today} — أنشأه: ${State.profile?.name}</p>
      </div>
      ${body}
      <div style="margin-top:2rem;text-align:center;color:#9ca3af;font-size:0.8rem;border-top:1px solid #e5e7eb;padding-top:1rem;">
        تم إنشاء هذا التقرير بواسطة ProjeXWise ERP — ${new Date().toLocaleString('ar-AE')}
      </div>
    </body></html>`;
    const win = window.open('', '_blank', 'width=1000,height=750');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 600);
  }
};

// ============================================================
// AUDIT LOG
// ============================================================
Pages.audit = async function() {
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">سجل العمليات</div></div>
      <div class="ph-actions"><button class="btn btn-ghost btn-sm" onclick="ReportActions.generate('audit')">🖨 طباعة</button></div>
    </div>
    <div class="card" id="auditCard"><div class="no-data">جاري التحميل...</div></div>`;
  try {
    const snap = await getDocs(query(collection(db, 'audit'), orderBy('createdAt', 'desc'), limit(200)));
    const data = snap.docs.map(d => d.data());
    const typeColors = { auth: '#3b82f6', income: '#10b981', expense: '#ef4444', approval: '#f59e0b', project: '#8b5cf6', partner: '#06b6d4', custody: '#f97316', settings: '#6b7280' };
    document.getElementById('auditCard').innerHTML = `<div class="audit-timeline">${data.map(a => {
      const color = typeColors[a.type] || '#6b7280';
      return `<div class="audit-item">
        <div class="audit-dot-col">
          <div class="audit-dot" style="background:${color};"></div>
          <div class="audit-line"></div>
        </div>
        <div class="audit-body">
          <div class="audit-action">${H.escape(a.action)} — <span style="color:${color};">${H.escape(a.details||'')}</span></div>
          <div class="audit-meta">👤 ${H.escape(a.userName||'-')} · 🕐 ${H.fmtDateTime(a.createdAt)}</div>
          ${a.oldVal||a.newVal ? `<div class="audit-diff">${a.oldVal?'← '+a.oldVal:''} ${a.oldVal&&a.newVal?'→':''} ${a.newVal?a.newVal:''}</div>` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
};

// ============================================================
// USERS
// ============================================================
Pages.users = async function() {
  if (!H.isAdmin()) { Toast.show('غير مصرح', 'error'); return; }
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header">
      <div><div class="ph-title">إدارة المستخدمين</div></div>
      <div class="ph-actions"><button class="btn btn-primary" onclick="UserActions.showForm()">+ مستخدم جديد</button></div>
    </div>
    <div id="userCards" class="user-cards"><div class="no-data">جاري التحميل...</div></div>`;
  await UserActions.load();
};

const UserActions = {
  data: [],
  async load() {
    const snap = await getDocs(collection(db, 'users'));
    UserActions.data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const grid = document.getElementById('userCards');
    if (!grid) return;
    grid.innerHTML = UserActions.data.map(u => `
      <div class="user-card">
        <div class="uc-header">
          <div class="uc-avatar" style="background:${H.avatarColor(u.name)};">${(u.name||'U').charAt(0)}</div>
          <div>
            <div class="fw-7">${H.escape(u.name)}</div>
            <span class="badge ${u.role==='admin'?'badge-amber':'badge-blue'}">${u.role==='admin'?'مدير النظام':'موظف'}</span>
            ${!u.active?'<span class="badge badge-red">موقف</span>':''}
          </div>
        </div>
        <div class="uc-detail"><span class="uc-dl">البريد الإلكتروني</span><span>${H.escape(u.email||'-')}</span></div>
        <div class="uc-detail"><span class="uc-dl">أيام التعديل</span><span>${u.editDays===-1?'غير محدود':(u.editDays||0)+' أيام'}</span></div>
        <div class="uc-detail"><span class="uc-dl">الحالة</span><span class="${u.active?'':''}"><span class="badge ${u.active?'badge-green':'badge-red'}">${u.active?'نشط':'موقف'}</span></span></div>
        <div class="uc-actions">
          <button class="btn btn-ghost btn-sm" onclick="UserActions.showForm('${u.id}')">تعديل</button>
          <button class="btn btn-ghost btn-sm" onclick="UserActions.showPermissions('${u.id}')">الصلاحيات</button>
          ${u.id!==State.user.uid?`<button class="btn btn-${u.active?'red':'green'} btn-sm" onclick="UserActions.toggleActive('${u.id}')">${u.active?'إيقاف':'تفعيل'}</button>`:''}
        </div>
      </div>`).join('');
  },
  async showForm(id) {
    const rec = id ? UserActions.data.find(u => u.id === id) : null;
    UI.openModal(rec ? 'تعديل المستخدم' : 'مستخدم جديد', `
      <div class="form-grid">
        <div class="form-group"><label>الاسم الكامل <span class="req">*</span></label><input type="text" class="form-control" id="fuName" value="${H.escape(rec?.name||'')}"></div>
        <div class="form-group"><label>البريد الإلكتروني <span class="req">*</span></label><input type="email" class="form-control" id="fuEmail" value="${H.escape(rec?.email||'')}" ${rec?'readonly':''}></div>
        ${!rec?`<div class="form-group"><label>كلمة المرور <span class="req">*</span></label><div class="input-with-icon"><input type="password" class="form-control" id="fuPass" placeholder="8 أحرف على الأقل"><button class="input-toggle" onclick="UI.togglePassword('fuPass',this)">👁</button></div></div>`:''}
        <div class="form-group"><label>الدور الوظيفي</label>
          <select class="form-control" id="fuRole">
            <option value="employee" ${rec?.role!=='admin'?'selected':''}>موظف</option>
            <option value="admin" ${rec?.role==='admin'?'selected':''}>مدير النظام</option>
          </select>
        </div>
        <div class="form-group"><label>أيام التعديل المسموحة</label>
          <select class="form-control" id="fuEditDays">
            <option value="0" ${rec?.editDays===0?'selected':''}>0 — لا تعديل</option>
            <option value="1" ${rec?.editDays===1?'selected':''}>1 يوم</option>
            <option value="2" ${rec?.editDays===2?'selected':''}>2 أيام</option>
            <option value="7" ${rec?.editDays===7?'selected':''}>أسبوع</option>
            <option value="30" ${rec?.editDays===30?'selected':''}>شهر</option>
            <option value="-1" ${rec?.editDays===-1?'selected':''}>غير محدود</option>
          </select>
        </div>
        <div class="form-group"><label>رقم الهاتف</label><input type="text" class="form-control" id="fuPhone" value="${H.escape(rec?.phone||'')}"></div>
      </div>
      ${rec?`<div class="form-group mt-2"><label>إعادة تعيين كلمة المرور</label><div class="flex gap-1"><input type="password" class="form-control" id="fuNewPass" placeholder="اتركه فارغاً للإبقاء على الحالية"><button class="input-toggle btn btn-ghost btn-sm" onclick="UI.togglePassword('fuNewPass',this)">👁</button></div></div>`:''}
      <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button><button class="btn btn-primary" onclick="UserActions.save('${id||''}')">حفظ</button></div>`);
  },
  async save(id) {
    const name = document.getElementById('fuName')?.value?.trim();
    const email = document.getElementById('fuEmail')?.value?.trim();
    const role = document.getElementById('fuRole')?.value;
    const editDays = parseInt(document.getElementById('fuEditDays')?.value);
    const phone = document.getElementById('fuPhone')?.value;
    if (!name) { Toast.show('أدخل الاسم', 'error'); return; }
    try {
      if (id) {
        const newPass = document.getElementById('fuNewPass')?.value;
        const data = { name, role, editDays, phone, ...(role === 'admin' ? { permissions: ADMIN_ALL_PERMS } : {}), updatedAt: serverTimestamp() };
        await updateDoc(doc(db, 'users', id), data);
        if (newPass && newPass.length >= 6) {
          await sendPasswordResetEmail(auth, email);
          Toast.show('تم إرسال إعادة تعيين كلمة المرور', 'info');
        }
        await logAudit('تعديل مستخدم', 'user', name);
        Toast.show('تم التعديل', 'success');
      } else {
        const pass = document.getElementById('fuPass')?.value;
        if (!email || !pass || pass.length < 8) { Toast.show('يرجى ملء كل الحقول (كلمة المرور 8 أحرف على الأقل)', 'error'); return; }
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        const defaultPerms = role === 'admin' ? ADMIN_ALL_PERMS : { income_view: true, expenses_view: true };
        await setDoc(doc(db, 'users', cred.user.uid), { name, email, role, editDays, phone: phone || '', active: true, permissions: defaultPerms, createdBy: State.user.uid, createdByName: State.profile.name, createdAt: serverTimestamp() });
        await logAudit('إضافة مستخدم', 'user', `${name} — ${email}`);
        Toast.show('تم إنشاء المستخدم', 'success');
      }
      UI.closeModal();
      await UserActions.load();
    } catch (e) {
      const msgs = { 'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل' };
      Toast.show(msgs[e.code] || e.message, 'error');
    }
  },
  async toggleActive(id) {
    const u = UserActions.data.find(x => x.id === id);
    const newState = !u.active;
    await updateDoc(doc(db, 'users', id), { active: newState });
    await logAudit(newState ? 'تفعيل مستخدم' : 'إيقاف مستخدم', 'user', u.name);
    Toast.show(newState ? 'تم التفعيل' : 'تم الإيقاف', 'info');
    await UserActions.load();
  },
  async showPermissions(id) {
    const u = UserActions.data.find(x => x.id === id);
    if (!u) return;
    const perms = u.permissions || {};
    const groups = {
      'الإيرادات': ['income_view','income_add','income_edit','income_delete','income_approve'],
      'المصروفات': ['expenses_view','expenses_add','expenses_edit','expenses_delete','expenses_approve'],
      'المشاريع': ['projects_create','projects_edit','projects_delete','projects_archive'],
      'الشركاء': ['partners_view','partners_add','partners_edit','partners_delete'],
      'العهد': ['custody_create','custody_settle','custody_edit','custody_close'],
      'التقارير': ['reports_view','reports_partner','reports_export'],
      'الإدارة': ['admin_users','admin_permissions','admin_settings']
    };
    UI.openModal(`صلاحيات — ${u.name}`, `
      <div class="perm-grid">${Object.entries(groups).map(([gname, keys]) => `
        <div class="perm-section">
          <div class="perm-section-title">${gname}</div>
          <div class="perm-checks">${keys.map(k => `
            <div class="form-check">
              <input type="checkbox" id="perm_${k}" ${perms[k]?'checked':''} ${u.role==='admin'?'disabled':''}>
              <label for="perm_${k}">${ALL_PERMISSIONS[k]||k}</label>
            </div>`).join('')}
          </div>
        </div>`).join('')}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        ${u.role!=='admin'?`<button class="btn btn-primary" onclick="UserActions.savePermissions('${id}')">حفظ الصلاحيات</button>`:'<span class="text-muted">المدير لديه كل الصلاحيات تلقائياً</span>'}
      </div>`, true);
  },
  async savePermissions(id) {
    const newPerms = {};
    Object.keys(ALL_PERMISSIONS).forEach(k => {
      const el = document.getElementById('perm_' + k);
      if (el) newPerms[k] = el.checked;
    });
    await updateDoc(doc(db, 'users', id), { permissions: newPerms });
    await logAudit('تعديل صلاحيات', 'user', UserActions.data.find(u=>u.id===id)?.name);
    Toast.show('تم حفظ الصلاحيات', 'success');
    UI.closeModal();
    await UserActions.load();
  }
};

// ============================================================
// SETTINGS
// ============================================================
Pages.settings = async function() {
  if (!H.isAdmin()) { Toast.show('غير مصرح', 'error'); return; }
  const s = State.settings || {};
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header"><div><div class="ph-title">إعدادات النظام</div></div></div>
    <div style="max-width:700px;">
      <div class="card mb-2">
        <div class="card-header"><span class="card-title">بيانات الشركة</span></div>
        <div class="card-body">
          <div class="form-grid">
            <div class="form-group col-full"><label>اسم الشركة</label><input type="text" class="form-control" id="sCompany" value="${H.escape(s.companyName||'')}"></div>
            <div class="form-group"><label>العملة</label>
              <select class="form-control" id="sCurrency">
                ${['AED','SAR','USD','EUR','GBP','KWD','QAR','BHD'].map(c=>`<option ${s.currency===c?'selected':''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="form-group"><label>نسبة الضريبة (%)</label><input type="number" class="form-control" id="sTax" min="0" max="100" value="${s.taxRate||0}"></div>
            <div class="form-group"><label>العنوان</label><input type="text" class="form-control" id="sAddress" value="${H.escape(s.address||'')}"></div>
            <div class="form-group"><label>الهاتف</label><input type="text" class="form-control" id="sPhone" value="${H.escape(s.phone||'')}"></div>
            <div class="form-group"><label>البريد الإلكتروني</label><input type="email" class="form-control" id="sEmail" value="${H.escape(s.email||'')}"></div>
            <div class="form-group"><label>الموقع الإلكتروني</label><input type="text" class="form-control" id="sWebsite" value="${H.escape(s.website||'')}"></div>
            <div class="form-group col-full"><label>ملاحظات</label><textarea class="form-control" id="sNotes">${H.escape(s.notes||'')}</textarea></div>
          </div>
          <button class="btn btn-primary mt-2" onclick="SettingsActions.save()">حفظ الإعدادات</button>
        </div>
      </div>
    </div>`;
};

const SettingsActions = {
  async save() {
    const data = {
      companyName: document.getElementById('sCompany')?.value || '',
      currency: document.getElementById('sCurrency')?.value || 'AED',
      taxRate: parseFloat(document.getElementById('sTax')?.value) || 0,
      address: document.getElementById('sAddress')?.value || '',
      phone: document.getElementById('sPhone')?.value || '',
      email: document.getElementById('sEmail')?.value || '',
      website: document.getElementById('sWebsite')?.value || '',
      notes: document.getElementById('sNotes')?.value || '',
      updatedAt: serverTimestamp()
    };
    try {
      await setDoc(doc(db, 'settings', 'company'), data, { merge: true });
      State.settings = { ...State.settings, ...data };
      await logAudit('تعديل إعدادات النظام', 'settings', 'تم تحديث الإعدادات');
      Toast.show('تم حفظ الإعدادات', 'success');
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  }
};

// ============================================================
// PROFILE
// ============================================================
Pages.profile = async function() {
  const u = State.profile;
  document.getElementById('pageContainer').innerHTML = `
    <div class="page-header"><div><div class="ph-title">الملف الشخصي</div></div></div>
    <div style="max-width:500px;">
      <div class="card mb-2">
        <div class="card-header"><span class="card-title">معلوماتي</span></div>
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;">
            <div class="uc-avatar" style="width:60px;height:60px;font-size:1.5rem;background:${H.avatarColor(u.name)};">${(u.name||'U').charAt(0)}</div>
            <div><div class="fw-7" style="font-size:1.1rem;">${H.escape(u.name)}</div><div class="text-muted">${u.email}</div></div>
          </div>
          <div class="form-group mb-2"><label>الاسم الكامل</label><input type="text" class="form-control" id="prName" value="${H.escape(u.name||'')}"></div>
          <div class="form-group mb-2"><label>رقم الهاتف</label><input type="text" class="form-control" id="prPhone" value="${H.escape(u.phone||'')}"></div>
          <button class="btn btn-primary" onclick="ProfileActions.updateInfo()">تحديث المعلومات</button>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">تغيير كلمة المرور</span></div>
        <div class="card-body">
          <div class="form-group mb-2"><label>كلمة المرور الحالية</label><div class="input-with-icon"><input type="password" class="form-control" id="prOldPass"><button class="input-toggle" onclick="UI.togglePassword('prOldPass',this)">👁</button></div></div>
          <div class="form-group mb-2"><label>كلمة المرور الجديدة</label><div class="input-with-icon"><input type="password" class="form-control" id="prNewPass"><button class="input-toggle" onclick="UI.togglePassword('prNewPass',this)">👁</button></div></div>
          <div class="form-group mb-2"><label>تأكيد كلمة المرور</label><div class="input-with-icon"><input type="password" class="form-control" id="prConfPass"><button class="input-toggle" onclick="UI.togglePassword('prConfPass',this)">👁</button></div></div>
          <div id="passAlert"></div>
          <button class="btn btn-primary" onclick="ProfileActions.changePassword()">تغيير كلمة المرور</button>
        </div>
      </div>
    </div>`;
};

const ProfileActions = {
  async updateInfo() {
    const name = document.getElementById('prName')?.value?.trim();
    const phone = document.getElementById('prPhone')?.value;
    if (!name) { Toast.show('أدخل الاسم', 'error'); return; }
    try {
      await updateDoc(doc(db, 'users', State.user.uid), { name, phone });
      State.profile = { ...State.profile, name, phone };
      document.getElementById('sucName').textContent = name;
      document.getElementById('sucAvatar').textContent = name.charAt(0);
      Toast.show('تم تحديث المعلومات', 'success');
    } catch (e) { Toast.show('خطأ: ' + e.message, 'error'); }
  },
  async changePassword() {
    const oldPass = document.getElementById('prOldPass')?.value;
    const newPass = document.getElementById('prNewPass')?.value;
    const confPass = document.getElementById('prConfPass')?.value;
    const alertEl = document.getElementById('passAlert');
    if (!oldPass || !newPass || !confPass) { alertEl.innerHTML = '<div class="alert alert-error">يرجى ملء كل الحقول</div>'; return; }
    if (newPass !== confPass) { alertEl.innerHTML = '<div class="alert alert-error">كلمتا المرور غير متطابقتين</div>'; return; }
    if (newPass.length < 8) { alertEl.innerHTML = '<div class="alert alert-error">كلمة المرور يجب أن تكون 8 أحرف على الأقل</div>'; return; }
    try {
      const cred = EmailAuthProvider.credential(State.user.email, oldPass);
      await reauthenticateWithCredential(State.user, cred);
      await updatePassword(State.user, newPass);
      await logAudit('تغيير كلمة المرور', 'auth', State.profile.name);
      alertEl.innerHTML = '<div class="alert alert-success">تم تغيير كلمة المرور</div>';
      Toast.show('تم تغيير كلمة المرور', 'success');
    } catch (e) {
      const msgs = { 'auth/wrong-password': 'كلمة المرور الحالية غير صحيحة', 'auth/invalid-credential': 'كلمة المرور الحالية غير صحيحة' };
      alertEl.innerHTML = `<div class="alert alert-error">${msgs[e.code] || e.message}</div>`;
    }
  }
};

// ===== KEYBOARD SHORTCUTS =====
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { UI.closeModal(); document.getElementById('confirmDialog').classList.add('hidden'); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('globalSearch').focus(); }
});

// Close notifications when clicking outside
document.addEventListener('click', e => {
  const notifBtn = document.getElementById('notifBtn');
  const notifPanel = document.getElementById('notifPanel');
  if (notifBtn && notifPanel && !notifBtn.contains(e.target) && !notifPanel.contains(e.target)) {
    notifPanel.classList.add('hidden');
  }
});