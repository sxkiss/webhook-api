import { api, store, startStream, stopStream, onUnauthorized, ApiError } from './api.js';
import { icon, esc, initial, toast, modal } from './ui.js';
import * as loginPage from './pages/login.js?v=20261110-v5';
import * as overviewPage from './pages/overview.js?v=20261110-v5';
import * as chatPage from './pages/chat.js?v=20261111-platforms';
import * as officePage from './pages/office.js?v=20261111-platforms';
import * as tacticalPage from './pages/tactical.js?v=20261110-v1';
import * as workstationsPage from './pages/workstations.js?v=20261110-v5';
import * as agentsPage from './pages/agents.js?v=20261110-v5';
import * as registryPage from './pages/registry.js?v=20261111-platforms';
import * as settingsPage from './pages/settings.js?v=20261110-v5';

const ROUTES = [
  { id: 'overview',     code: '总览看板', label: '总览 · 链路', icon: 'overview',    title: '总览与链路态势',     sub: '实时中继报文统计 · 节点拓扑与数据去向配对' },
  { id: 'chat',         code: '双向终端', label: '通信台',     icon: 'chat',        title: '全媒体双向通信台',   sub: '信箱实时收发 · 动作定义与去向透视' },
  { id: 'office',       code: '3D 拓扑',  label: '3D 节点拓扑', icon: 'office',      title: '3D 节点链路拓扑',   sub: '中继核心与信箱环形沙盘 · 点击节点上方展示详情' },
  { id: 'tactical',     code: 'HQ 大屏',  label: '战术大屏',     icon: 'overview',    title: 'HQ 战术大屏',         sub: '嵌入式 HQ 主题 · 与 3D 拓扑共用同一套实时数据' },
  { id: 'workstations', code: '3D 工位',  label: '3D 实时工位', icon: 'workstation', title: '3D 实时办公工位',   sub: '独立 3D 工位阵列 · 实时观看每个 Muse 动作姿态与定义' },
  { id: 'agents',       code: '成员单元', label: '信箱与成员', icon: 'agents',      title: '信箱成员与动作',     sub: '自动发现信箱 · 形象标注 · 收发数量与去向' },
  { id: 'registry',     code: '路由矩阵', label: '注册与路由', icon: 'route',       title: 'Muse 注册与路由矩阵', sub: 'Muse 通道分配 · 外部会话绑定与解析测试' },
  { id: 'settings',     code: '系统控制', label: '设置与权限', icon: 'settings',    title: '系统设置与权限控制', sub: '基础外观 · Muse 动作定义矩阵 · 规则与账号权限' },
];

const THEMES = ['cyber', 'amber', 'ops'];
const THEME_NAMES = { cyber: '赛博深色', amber: '黑金总部', ops: '纸面工程' };

const MODULES = {
  login: loginPage,
  overview: overviewPage,
  chat: chatPage,
  office: officePage,
  tactical: tacticalPage,
  workstations: workstationsPage,
  agents: agentsPage,
  registry: registryPage,
  settings: settingsPage,
};

const $ = (id) => document.getElementById(id);
let cleanup = null;
let currentRoute = '';
let booted = false;

export function applyTheme(theme, silent = false) {
  const t = THEMES.includes(theme) ? theme : 'cyber';
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('muse_viz_theme', t); } catch { /* ignore */ }
  document.querySelectorAll('#themeSwitch button').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.themeOpt === t);
  });
  store.theme = t;
  store.emit('theme', t);
  if (!silent) toast(`主题已切换：${THEME_NAMES[t] || t}`);
}

export const ctx = {
  get user() { return store.user; },
  get settings() { return store.settings; },
  go: (route, params) => navigate(route, params),
  toast,
  modal,
  applyTheme,
  async reloadUser() {
    const data = await api.me();
    store.user = data.user;
    store.settings = data.settings;
    paintUser();
    return data.user;
  },
  async onLoginSuccess() {
    const data = await api.me();
    store.user = data.user;
    store.settings = data.settings;
    paintUser();
    startStream();
    location.hash = '#/overview';
    render('overview');
    if (store.user.must_change && store.user.via !== 'bearer') {
      setTimeout(forcePasswordChange, 300);
    }
  },
  openPasswordModal,
  async saveSettings(patch) {
    const data = await api.saveSettings(patch);
    store.settings = data.settings;
    return data.settings;
  },
};

/* ── 导航 ── */
function buildNav() {
  $('nav').innerHTML = ROUTES.map(
    (r, idx) => `<a href="#/${r.id}" data-route="${r.id}">
      ${icon(r.icon)}
      <span>${esc(r.label)}</span>
      <em class="nav-idx">0${idx + 1}</em>
    </a>`,
  ).join('');
}

function markNav(route) {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('on', a.dataset.route === route);
  });
}

function paintUser() {
  const user = store.user;
  if (!user) return;
  const badge = user.role === 'admin' ? '' : `<span class="chip" style="font-size:10px;padding:0 5px">${esc(user.role_label || user.role)}</span>`;
  $('sideUser').innerHTML = `
    <div class="av">${esc(initial(user.username))}</div>
    <div class="meta"><b>${esc(user.username)}</b><span>${esc(user.role_label || user.role)}</span></div>
    ${badge}
    ${user.via === 'bearer' ? '' : `<button class="iconbtn" id="pwBtn" title="修改密码">${icon('key', 14)}</button>`}
    <button class="iconbtn" id="logoutBtn" title="退出登录">${icon('logout', 14)}</button>`;
  if ($('pwBtn')) {
    $('pwBtn').onclick = () => openPasswordModal();
  }
  $('logoutBtn').onclick = async () => {
    try { await api.logout(); } catch { /* 忽略 */ }
    store.user = null;
    stopStream();
    location.hash = '#/login';
    navigate('login');
  };

  const name = store.settings?.site_name || 'MUSE OPS';
  $('brandName').textContent = name;
  document.title = `${name} · 战术工作台`;
}

function paintLive(state) {
  const map = {
    open: ['online', '实时流在线'],
    reconnecting: ['idle', '正在重连…'],
  };
  const [dot, text] = map[state] || ['online', '实时流在线'];
  $('liveState').innerHTML = `<span class="dot ${dot}"></span>${esc(text)}`;
}

function startClock() {
  const update = () => {
    const el = $('sysClock');
    if (!el) return;
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    el.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  update();
  setInterval(update, 1000);
}

function closeDrawer() {
  $('sidebar').classList.remove('open');
  document.querySelector('.scrim')?.remove();
}

function openDrawer() {
  $('sidebar').classList.add('open');
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.onclick = closeDrawer;
  document.body.appendChild(scrim);
}

/* ── 路由 ── */
function parseHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  return raw.split('?')[0] || '';
}

async function render(route, params = null) {
  const mod = MODULES[route];
  if (!mod) { navigate('overview'); return; }

  if (route === 'login') {
    $('app').classList.add('login-mode');
    $('pageTitle').textContent = '登录';
    $('pageSub').textContent = '';
    if ($('pageTag')) $('pageTag').textContent = '身份验证';
    $('liveState').innerHTML = '';
  } else {
    $('app').classList.remove('login-mode');
    const meta = ROUTES.find((r) => r.id === route);
    if ($('pageTag')) $('pageTag').textContent = meta?.code || '总览看板';
    $('pageTitle').textContent = meta?.title || '';
    $('pageSub').textContent = meta?.sub || '';
    paintLive('open');
  }

  if (booted) {
    $('boot').hidden = true;
    $('app').hidden = false;
  }

  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (err) { console.error(err); }
  }
  cleanup = null;

  const view = $('view');
  view.innerHTML = '';
  view.dataset.page = route;
  currentRoute = route;
  markNav(route);
  closeDrawer();

  try {
    const result = await mod.mount(view, { ...ctx, params });
    if (typeof result === 'function') cleanup = result;
  } catch (err) {
    console.error(err);
    if (err instanceof ApiError && err.status === 401) return;
    view.innerHTML = `<div class="empty-state"><b>页面加载失败</b><span>${esc(err.message || err)}</span>
      <button class="btn ghost sm" id="retryBtn">重试</button></div>`;
    view.querySelector('#retryBtn').onclick = () => render(route, params);
  }
}

function navigate(route, params = null) {
  if (!store.user && route !== 'login') route = 'login';
  const target = `#/${route}`;
  if (location.hash === target) render(route, params);
  else {
    if (params) store.pending = params;
    location.hash = target;
  }
}

function onHashChange() {
  const route = parseHash() || 'overview';
  if (!store.user && route !== 'login') {
    location.hash = '#/login';
    return;
  }
  if (store.user && route === 'login') {
    location.hash = '#/overview';
    return;
  }
  const params = store.pending;
  store.pending = null;
  render(route, params);
}

/* ── 改密与强制改密 ── */
function openPasswordModal() {
  const must = Boolean(store.user?.must_change);
  modal({
    title: must ? '先设置一个新密码' : '修改登录密码',
    okText: '保存密码',
    body: `
      ${must ? '<p style="margin:0 0 12px;color:var(--ink2)">当前账号仍在用初始密码（即 API Key），继续使用有风险。</p>' : ''}
      ${must ? '' : '<label class="field"><span>当前密码</span><input type="password" id="opw" autocomplete="current-password"></label>'}
      <label class="field"><span>新密码（至少 8 位）</span><input type="password" id="np1" autocomplete="new-password"></label>
      <label class="field"><span>再输一次新密码</span><input type="password" id="np2" autocomplete="new-password"></label>
      <div id="npErr" style="color:var(--red);font-size:12px"></div>`,
    onOk: async (wrap) => {
      const oldPw = must ? '' : (wrap.querySelector('#opw')?.value || '');
      const a = wrap.querySelector('#np1').value;
      const b = wrap.querySelector('#np2').value;
      const err = wrap.querySelector('#npErr');
      if (!must && !oldPw) { err.textContent = '请输入当前密码'; return false; }
      if (a.length < 8) { err.textContent = '新密码至少 8 位'; return false; }
      if (a !== b) { err.textContent = '两次输入不一致'; return false; }
      try {
        await api.changePassword(oldPw, a);
        store.user.must_change = false;
        toast('密码已更新');
        render(currentRoute || 'overview');
        return true;
      } catch (e) {
        err.textContent = e.message;
        return false;
      }
    },
  });
}

function forcePasswordChange() {
  openPasswordModal();
}

/* ── 启动 ── */
async function boot() {
  let savedTheme = 'cyber';
  try { savedTheme = localStorage.getItem('muse_viz_theme') || 'cyber'; } catch { /* ignore */ }
  applyTheme(savedTheme, true);

  buildNav();
  startClock();

  if ($('themeSwitch')) {
    $('themeSwitch').onclick = (e) => {
      const btn = e.target.closest('button[data-theme-opt]');
      if (!btn) return;
      applyTheme(btn.dataset.themeOpt);
    };
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 't' || e.key === 'T') {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cur = document.documentElement.dataset.theme || 'cyber';
      const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
      applyTheme(next);
    }
  });

  $('menuBtn').innerHTML = icon('menu', 16);
  $('menuBtn').onclick = () => ($('sidebar').classList.contains('open') ? closeDrawer() : openDrawer());

  onUnauthorized(() => {
    if (!store.user) return;
    store.user = null;
    stopStream();
    toast('会话已过期，请重新登录', 'err');
    location.hash = '#/login';
  });

  store.on('stream-state', paintLive);

  let data = null;
  try {
    data = await api.me();
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401) {
      $('boot').innerHTML = `<div class="empty-state"><b>连不上服务</b><span>${esc(err.message)}</span>
        <button class="btn ghost sm" onclick="location.reload()">重新加载</button></div>`;
      return;
    }
  }

  if (data) {
    store.user = data.user;
    store.settings = data.settings;
    store.setAgents(data.agents || []);
    paintUser();
    startStream();

    booted = true;
    $('boot').hidden = true;
    $('app').hidden = false;

    const startRoute = parseHash() || 'overview';
    const route = startRoute === 'login' ? 'overview' : startRoute;
    if (location.hash !== `#/${route}`) history.replaceState(null, '', `#/${route}`);
    render(route);

    if (store.user.must_change && store.user.via !== 'bearer') {
      setTimeout(forcePasswordChange, 400);
    }
  } else {
    booted = true;
    $('boot').hidden = true;
    $('app').hidden = false;
    if (location.hash !== '#/login') history.replaceState(null, '', '#/login');
    render('login');
  }

  window.addEventListener('hashchange', onHashChange);
}

boot();
