import { api, store } from '../api.js';
import {
  esc, icon, toast, modal, fmtDateTime,
  getMuseActionProfile, resolveMuseLiveAction, openMuseActionModal,
} from '../ui.js';

let rootRef = null;
let ctxRef = null;
let tab = 'basic';

const TABS = [
  ['basic', '基础与外观', '参数/主题'],
  ['actions', 'Muse 动作定义', 'SOP 矩阵'],
  ['content', '公告与规则', '信任/准则'],
  ['users', '账号与权限', 'RBAC 管控'],
  ['about', '接口与状态', 'API 诊断'],
];

export async function mount(root, ctx) {
  rootRef = root;
  ctxRef = ctx;
  tab = ctx.params?.tab || 'basic';

  root.innerHTML = `
    <div class="pg-settings">
      <div class="settings-nav" id="tabs">
        <div class="settings-nav-hd">控制中心导航</div>
        ${TABS.map(([id, label, sub]) => `
          <button data-tab="${id}" class="${id === tab ? 'on' : ''}">
            <span>${esc(label)}</span>
            <em class="snav-sub" style="font-style:normal">${esc(sub)}</em>
          </button>`).join('')}
      </div>
      <div class="settings-body" id="sbody"></div>
    </div>`;

  root.querySelector('#tabs').onclick = (event) => {
    const btn = event.target.closest('button[data-tab]');
    if (!btn) return;
    tab = btn.dataset.tab;
    root.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b === btn));
    render();
  };

  await render();
  return null;
}

function renderTopKpis() {
  const s = store.settings || {};
  const curTheme = document.documentElement.dataset.theme || 'cyber';
  const themeNames = { cyber: '赛博深色', amber: '黑金总部', ops: '纸面工程' };
  const customActionsCount = Object.keys(s.muse_actions || {}).length;
  const totalAgents = (store.agents || []).length;
  const noticesCount = Array.isArray(s.notices) ? s.notices.length : 0;
  const rulesCount = Array.isArray(s.rules) ? s.rules.length : 0;

  return `
    <div class="settings-kpis">
      <div class="card kpi">
        <div class="k"><span>当前站点与主题</span><span class="chip" style="padding:1px 6px;font-size:10px">${esc(themeNames[curTheme] || curTheme)}</span></div>
        <div class="v" style="font-size:18px;margin-top:4px">${esc(s.site_name || 'MUSE OPS')}</div>
        <div class="s">默认窗口 ${esc((s.default_window || '24h').toUpperCase())}</div>
      </div>
      <div class="card kpi">
        <div class="k"><span>实时刷新 / 链路配对窗</span></div>
        <div class="v" style="font-size:18px;margin-top:4px">${((s.refresh_ms || 4000) / 1000).toFixed(1)}s <small>/ ${Number(s.pair_window) || 60}s</small></div>
        <div class="s">推断链路：${s.show_inferred !== false ? '开启展示' : '仅精确 request_id'}</div>
      </div>
      <div class="card kpi">
        <div class="k"><span>Muse 工位动作定义</span><span class="chip g" style="padding:1px 6px;font-size:10px">6 姿态 SOP</span></div>
        <div class="v" style="font-size:18px;margin-top:4px">${totalAgents} <small>个单元 (${customActionsCount} 自定义)</small></div>
        <div class="s">驱动 3D 实时工位动作与推演</div>
      </div>
      <div class="card kpi">
        <div class="k"><span>安全权限与规则</span></div>
        <div class="v" style="font-size:18px;margin-top:4px">${esc(ctxRef.user?.role_label || ctxRef.user?.role || '管理员')}</div>
        <div class="s">${noticesCount} 条来源授权 · ${rulesCount} 条运行规则</div>
      </div>
    </div>`;
}

async function render() {
  const body = rootRef.querySelector('#sbody');
  body.innerHTML = '<div class="empty-state"><span>正在加载配置…</span></div>';
  if (tab === 'basic') return renderBasic(body);
  if (tab === 'actions') return renderMuseActions(body);
  if (tab === 'content') return renderContent(body);
  if (tab === 'users') return renderUsers(body);
  return renderAbout(body);
}

function guard() {
  const isAdmin = ctxRef.user?.role === 'admin';
  if (!isAdmin) {
    return `<div class="login-err" style="margin-bottom:4px">当前登录角色为「${esc(ctxRef.user?.role_label || ctxRef.user?.role)}」，处于只读浏览模式，修改需管理员权限。</div>`;
  }
  return '';
}

async function renderBasic(body) {
  const isAdmin = ctxRef.user?.role === 'admin';
  const s = store.settings || {};
  const curTheme = document.documentElement.dataset.theme || 'cyber';

  body.innerHTML = `
    ${renderTopKpis()}
    <div class="settings-head">
      <div>
        <h2>基础与外观设置</h2>
        <p class="hint">配置工作台全局名称、视觉主题、实时刷新频率与链路拓扑配对算法参数。</p>
      </div>
    </div>
    ${guard()}
    <div class="settings-grid">
      <div class="settings-panel">
        <h3><span>站点与链路参数</span><span class="chip" style="font-size:10px">实时生效</span></h3>
        <label class="field"><span>站点名称</span>
          <input type="text" id="siteName" value="${esc(s.site_name || '')}" ${isAdmin ? '' : 'disabled'}>
          <small>显示在左上角导航栏与浏览器标题栏</small>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <label class="field"><span>默认统计时间窗</span>
            <select id="defWin" ${isAdmin ? '' : 'disabled'}>
              ${[['1h', '最近 1 小时 (1H)'], ['24h', '最近 24 小时 (24H)'], ['7d', '最近 7 天 (7D)']].map(([v, l]) =>
                `<option value="${v}" ${s.default_window === v ? 'selected' : ''}>${l}</option>`).join('')}
            </select>
          </label>
          <label class="field"><span>链路配对时间窗（秒）</span>
            <input type="number" id="pairWin" min="5" max="600" step="5"
              value="${Number(s.pair_window) || 60}" ${isAdmin ? '' : 'disabled'}>
          </label>
        </div>
        <label class="field"><span>自动合并刷新间隔</span>
          <div class="range-row">
            <input type="range" id="refreshMs" min="1000" max="20000" step="500"
              value="${s.refresh_ms || 4000}" ${isAdmin ? '' : 'disabled'}>
            <b id="refreshVal" class="mono" style="font-size:12px;width:52px">${((s.refresh_ms || 4000) / 1000).toFixed(1)}s</b>
          </div>
          <small>收到 SSE 新消息脉冲时的合并刷新间隔，越小越实时</small>
        </label>
        <label class="field"><span>低置信度推断链路</span>
          <select id="showInferred" ${isAdmin ? '' : 'disabled'}>
            <option value="1" ${s.show_inferred !== false ? 'selected' : ''}>显示（虚线标出时间窗内自动推断的去向）</option>
            <option value="0" ${s.show_inferred === false ? 'selected' : ''}>隐藏（仅展示携带精确 request_id 的配对链路）</option>
          </select>
        </label>
        ${isAdmin ? `<div class="save-bar"><button class="btn" id="saveBasic">保存基础设置</button>
          <span class="muted" id="saveHint" style="font-size:12px"></span></div>` : ''}
      </div>

      <div class="settings-panel">
        <h3><span>工作台视觉主题</span><span class="muted mono" style="font-size:10.5px">快捷键 T 切换</span></h3>
        <div class="theme-cards" id="themeCards">
          <button type="button" class="theme-card ${curTheme === 'cyber' ? 'on' : ''}" data-pick-theme="cyber">
            <b>赛博深色</b>
            <span>CYBER TACTICAL · 电光青</span>
          </button>
          <button type="button" class="theme-card ${curTheme === 'amber' ? 'on' : ''}" data-pick-theme="amber">
            <b>黑金总部</b>
            <span>AMBER COMMAND · 琥珀金</span>
          </button>
          <button type="button" class="theme-card ${curTheme === 'ops' ? 'on' : ''}" data-pick-theme="ops">
            <b>纸面工程</b>
            <span>PAPER OPS · 浅色图纸</span>
          </button>
        </div>

        <h3 style="margin-top:16px"><span>快速视图跳转</span></h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button type="button" class="btn ghost" data-go-route="workstations">🪑 打开 3D 实时工位</button>
          <button type="button" class="btn ghost" data-go-route="office">🌐 打开 3D 节点拓扑</button>
          <button type="button" class="btn ghost" data-go-route="overview">📊 打开 总览与链路</button>
          <button type="button" class="btn ghost" data-go-route="registry">🧭 打开 注册与路由</button>
        </div>
      </div>
    </div>`;

  body.querySelectorAll('[data-pick-theme]').forEach((btn) => {
    btn.onclick = () => {
      if (ctxRef.applyTheme) ctxRef.applyTheme(btn.dataset.pickTheme);
      renderBasic(body);
    };
  });
  body.querySelectorAll('[data-go-route]').forEach((btn) => {
    btn.onclick = () => ctxRef.go(btn.dataset.goRoute);
  });

  const range = body.querySelector('#refreshMs');
  range.oninput = () => {
    body.querySelector('#refreshVal').textContent = `${(range.value / 1000).toFixed(1)}s`;
  };

  const saveBtn = body.querySelector('#saveBasic');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      try {
        const next = await ctxRef.saveSettings({
          site_name: body.querySelector('#siteName').value.trim() || 'Webhook 中继台',
          default_window: body.querySelector('#defWin').value,
          refresh_ms: Number(range.value),
          pair_window: Math.max(5, Math.min(600, Number(body.querySelector('#pairWin').value) || 60)),
          show_inferred: body.querySelector('#showInferred').value === '1',
        });
        store.settings = next;
        document.getElementById('brandName').textContent = next.site_name;
        document.title = `${next.site_name} · 战术工作台`;
        body.querySelector('#saveHint').textContent = '✓ 已保存并生效';
        toast('基础设置已保存');
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        saveBtn.disabled = false;
      }
    };
  }
}

async function renderMuseActions(body) {
  let agents = store.agents || [];
  try {
    const res = await api.agents();
    agents = res.agents || agents;
    store.setAgents(agents);
  } catch { /* ignore */ }

  body.innerHTML = `
    ${renderTopKpis()}
    <div class="settings-head">
      <div>
        <h2>⚡ Muse 工位动作定义矩阵</h2>
        <p class="hint">自定义每个 Muse / 信箱单元的岗位职责与 6 种实时工位动作 SOP（入站接收、拆解推演、出站派发、跨工位协同、审校核验、巡检待命），实时联动「3D 实时工位」。</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn ghost sm" id="goWsBtn">🪑 前往 3D 实时工位查看效果</button>
      </div>
    </div>
    <div class="settings-act-grid" id="actGrid">
      ${agents.map((a) => {
        const prof = getMuseActionProfile(a.name, store.settings);
        const liveAct = resolveMuseLiveAction(a, store.settings);
        return `
          <div class="settings-panel" style="border-top-color:${liveAct.color}">
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px">
              <div style="display:flex;align-items:center;gap:6px;min-width:0">
                ${a.muse_id ? `<span class="osr-badge">#${esc(a.muse_id)}</span>` : ''}
                <b style="font-size:14px">${esc(a.alias || a.name)}</b>
                <span class="ag-act-pill" style="color:${liveAct.color};border-color:${liveAct.color}">${esc(liveAct.icon)} ${esc(liveAct.label)}</span>
              </div>
              <button class="btn ghost sm" data-edit-muse="${esc(a.name)}">⚙ 编辑动作定义</button>
            </div>
            <div style="font-size:12px;color:var(--ink2);font-weight:600;margin-bottom:8px">${esc(prof.duty)}</div>
            <div class="insp-sop-list">
              <div class="insp-sop-row"><span>📡 入站接收</span><b>${esc(prof.receiving)}</b></div>
              <div class="insp-sop-row"><span>⌨️ 拆解推演</span><b>${esc(prof.coding)}</b></div>
              <div class="insp-sop-row"><span>🚀 出站派发</span><b>${esc(prof.dispatching)}</b></div>
              <div class="insp-sop-row"><span>🔄 跨工位协同</span><b>${esc(prof.handoff)}</b></div>
              <div class="insp-sop-row"><span>🔍 审校核验</span><b>${esc(prof.reviewing)}</b></div>
              <div class="insp-sop-row"><span>🛰️ 巡检待命</span><b>${esc(prof.patrol)}</b></div>
            </div>
          </div>`;
      }).join('')}
    </div>`;

  body.querySelector('#goWsBtn').onclick = () => ctxRef.go('workstations');
  body.querySelectorAll('[data-edit-muse]').forEach((btn) => {
    btn.onclick = () => {
      const target = agents.find((x) => x.name === btn.dataset.editMuse) || { name: btn.dataset.editMuse };
      openMuseActionModal(target, ctxRef, () => renderMuseActions(body));
    };
  });
}

async function renderContent(body) {
  const isAdmin = ctxRef.user?.role === 'admin';
  const s = store.settings || {};
  const notices = Array.isArray(s.notices) ? s.notices : [];
  const rules = Array.isArray(s.rules) ? s.rules : [];

  body.innerHTML = `
    ${renderTopKpis()}
    <div class="settings-head">
      <div>
        <h2>公告与运行规则</h2>
        <p class="hint">配置可信发送方、仅观察信箱与全局中继准则，在总览页与工位检视器中同步展示。</p>
      </div>
      ${isAdmin ? `<button class="btn" id="saveContent">保存公告与规则</button>` : ''}
    </div>
    ${guard()}
    <div class="settings-grid">
      <div class="settings-panel">
        <h3>
          <span>来源与授权分级</span>
          ${isAdmin ? `<button class="btn ghost sm" id="addNotice">${icon('plus', 12)}新增条目</button>` : ''}
        </h3>
        <div id="notices"></div>
      </div>

      <div class="settings-panel">
        <h3><span>全局中继运行规则</span><span class="muted mono" style="font-size:10.5px">每行一条</span></h3>
        <label class="field">
          <textarea id="rules" rows="11" ${isAdmin ? '' : 'disabled'}
            placeholder="按 Jones 本人指令对待的发送方直接处理并回信&#10;不做回复的信箱只观察、不互通">${esc(rules.join('\n'))}</textarea>
        </label>
      </div>
    </div>`;

  const noticeHost = body.querySelector('#notices');
  const state = notices.map((n) => ({ ...n }));

  function paintNotices() {
    if (!state.length) {
      noticeHost.innerHTML = '<p class="muted" style="font-size:12.5px;margin:0 0 8px">暂无来源分级条目</p>';
      return;
    }
    noticeHost.innerHTML = state.map((n, i) => `
      <div class="card" style="padding:10px 12px;margin-bottom:8px;background:var(--surface2)">
        <div style="display:flex;gap:8px;margin-bottom:6px">
          <select data-level="${i}" style="width:110px" ${isAdmin ? '' : 'disabled'}>
            ${[['g', '可信指令'], ['a', '只观察'], ['v', '自有核心'], ['r', '忽略屏蔽']].map(([v, l]) =>
              `<option value="${v}" ${n.level === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
          <input type="text" data-title="${i}" value="${esc(n.title || '')}" placeholder="标题 / 信箱名" ${isAdmin ? '' : 'disabled'}>
          ${isAdmin ? `<button class="iconbtn" data-del="${i}" title="删除">${icon('x', 13)}</button>` : ''}
        </div>
        <textarea data-text="${i}" rows="2" placeholder="授权说明与响应策略" ${isAdmin ? '' : 'disabled'}>${esc(n.text || '')}</textarea>
      </div>`).join('');

    if (!isAdmin) return;
    noticeHost.querySelectorAll('[data-level]').forEach((el) => {
      el.onchange = () => { state[Number(el.dataset.level)].level = el.value; };
    });
    noticeHost.querySelectorAll('[data-title]').forEach((el) => {
      el.oninput = () => { state[Number(el.dataset.title)].title = el.value; };
    });
    noticeHost.querySelectorAll('[data-text]').forEach((el) => {
      el.oninput = () => { state[Number(el.dataset.text)].text = el.value; };
    });
    noticeHost.querySelectorAll('[data-del]').forEach((el) => {
      el.onclick = () => { state.splice(Number(el.dataset.del), 1); paintNotices(); };
    });
  }
  paintNotices();

  const addBtn = body.querySelector('#addNotice');
  if (addBtn) {
    addBtn.onclick = () => {
      state.push({ level: 'g', title: '', text: '' });
      paintNotices();
    };
  }

  const saveBtn = body.querySelector('#saveContent');
  if (saveBtn) {
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      try {
        const next = await ctxRef.saveSettings({
          notices: state.filter((n) => n.title || n.text),
          rules: body.querySelector('#rules').value.split('\n').map((l) => l.trim()).filter(Boolean),
        });
        store.settings = next;
        toast('公告与运行规则已保存');
      } catch (err) {
        toast(err.message, 'err');
      } finally {
        saveBtn.disabled = false;
      }
    };
  }
}

async function renderUsers(body) {
  const isAdmin = ctxRef.user?.role === 'admin';
  const canChangeOwnPw = ctxRef.user?.via !== 'bearer';
  body.innerHTML = `
    ${renderTopKpis()}
    <div class="settings-head">
      <div>
        <h2>账号与权限控制 (RBAC)</h2>
        <p class="hint">三级权限体系：管理员可配置全局参数与账号；操作员可收发报文、标注形象、绑定路由与定义动作；只读仅可浏览。</p>
      </div>
      ${canChangeOwnPw ? `<button class="btn ghost sm" id="changeMyPwBtn">${icon('key', 13)}修改当前登录密码</button>` : ''}
    </div>
    ${guard()}
    <div class="settings-grid">
      <div class="settings-panel">
        <h3><span>已授权账号列表</span><span class="chip" style="font-size:10px">当前：${esc(ctxRef.user?.username || '')}</span></h3>
        <div id="userTable"><div class="muted" style="font-size:12.5px">正在加载账号列表…</div></div>
      </div>

      ${isAdmin ? `<div class="settings-panel">
        <h3><span>创建新工作台账号</span></h3>
        <label class="field"><span>登录用户名</span><input type="text" id="u-name" placeholder="例如 operator01"></label>
        <label class="field"><span>初始登录密码</span><input type="password" id="u-pw" placeholder="至少 8 位字符"></label>
        <label class="field"><span>分配角色权限</span>
          <select id="u-role">
            <option value="operator">操作员（收发消息 / 路由管理 / 动作定义）</option>
            <option value="viewer">只读观察员（仅浏览拓扑与日志）</option>
            <option value="admin">系统管理员（全部权限）</option>
          </select>
        </label>
        <div class="save-bar"><button class="btn" id="createUser">创建账号</button></div>
      </div>` : ''}
    </div>`;

  const pwBtn = body.querySelector('#changeMyPwBtn');
  if (pwBtn && ctxRef.openPasswordModal) {
    pwBtn.onclick = () => ctxRef.openPasswordModal();
  }

  if (!isAdmin) {
    body.querySelector('#userTable').innerHTML =
      '<p class="muted" style="font-size:12.5px">仅系统管理员可查看与管理全体账号列表。</p>';
    return;
  }

  try {
    const data = await api.users();
    const host = body.querySelector('#userTable');
    host.innerHTML = `<table class="tbl">
      <thead><tr><th>用户名</th><th>权限角色</th><th>最近登录时间</th><th></th></tr></thead>
      <tbody>${data.users.map((u) => `
        <tr>
          <td><b>${esc(u.username)}</b>${u.id === ctxRef.user.id ? ' <span class="chip" style="font-size:10px">当前会话</span>' : ''}</td>
          <td><span class="chip ${u.role === 'admin' ? 'g' : ''}" style="font-size:10.5px">${esc(u.role_label)}</span></td>
          <td class="muted mono" style="font-size:11.5px">${u.last_login ? fmtDateTime(u.last_login) : '从未登录'}</td>
          <td style="text-align:right">${u.id === ctxRef.user.id ? '' :
            `<button class="btn ghost sm" data-del="${esc(u.id)}" data-name="${esc(u.username)}">移除</button>`}</td>
        </tr>`).join('')}
      </tbody></table>`;

    host.querySelectorAll('[data-del]').forEach((btn) => {
      btn.onclick = () => {
        modal({
          title: `移除账号「${btn.dataset.name}」`,
          okText: '确认移除',
          danger: true,
          body: '<p style="margin:0">移除后该账号立即失去登录能力，其已登录会话将在下次请求时失效。</p>',
          onOk: async () => {
            try {
              await api.deleteUser(btn.dataset.del);
              toast('账号已移除');
              render();
              return true;
            } catch (err) {
              toast(err.message, 'err');
              return false;
            }
          },
        });
      };
    });

    body.querySelector('#createUser').onclick = async () => {
      const username = body.querySelector('#u-name').value.trim();
      const password = body.querySelector('#u-pw').value;
      const role = body.querySelector('#u-role').value;
      try {
        await api.createUser({ username, password, role });
        toast('新账号已创建');
        render();
      } catch (err) {
        toast(err.message, 'err');
      }
    };
  } catch (err) {
    body.querySelector('#userTable').innerHTML =
      `<div class="login-err">${esc(err.message)}</div>`;
  }
}

function renderAbout(body) {
  const endpoints = [
    ['POST', '/webhook/inbound/{name}', '向指定信箱推送入站消息'],
    ['POST', '/webhook/outbound/{name}', '向指定信箱写入出站消息'],
    ['GET', '/webhook/outbound?name=', '轮询拉取指定信箱出站消息'],
    ['GET', '/stream/{name}', '单信箱 SSE 实时事件流'],
    ['POST', '/v1/chat/completions', 'OpenAI 兼容同步对话中继接口'],
    ['POST', '/api/registry/muse/register', 'Muse 实例幂等注册与自动分配通道号'],
    ['POST', '/api/registry/routes/bind', '绑定外部微信会话至指定 Muse 通道'],
    ['POST', '/api/registry/resolve', '解析外部会话绑定的目标 Muse 通道'],
    ['GET', '/api/console/lineage', '24H/7D 链路拓扑、去向配对与信箱报文统计'],
    ['GET', '/api/console/stream', '工作台全局 SSE 实时遥测流'],
  ];
  body.innerHTML = `
    ${renderTopKpis()}
    <div class="settings-head">
      <div>
        <h2>接口矩阵与系统状态</h2>
        <p class="hint">同源无外部依赖架构，支持 Webhook 异步收发、SSE 实时流、OpenAI 兼容同步调用与 Muse 路由注册。</p>
      </div>
    </div>
    <div class="settings-grid">
      <div class="settings-panel">
        <h3><span>核心端点速查</span><span class="muted mono" style="font-size:10px">点击路径复制</span></h3>
        <table class="tbl">
          <thead><tr><th style="width:64px">方法</th><th>接口路径</th><th>功能说明</th></tr></thead>
          <tbody>${endpoints.map(([m, p, d]) =>
            `<tr data-copy-ep="${esc(p)}" style="cursor:pointer" title="点击复制路径">
              <td><span class="chip ${m === 'POST' ? 'g' : ''}" style="font-size:10px">${m}</span></td>
              <td class="mono" style="font-size:11.5px;color:var(--blue)">${esc(p)}</td>
              <td class="muted" style="font-size:12px">${esc(d)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="settings-panel">
        <h3><span>运行环境信息</span></h3>
        <div class="kv"><span>控制台版本</span><b>MUSE OPS v2.2 (3D 节点拓扑 + 3D 实时工位双引擎)</b></div>
        <div class="kv"><span>当前登录身份</span><b>${esc(ctxRef.user?.username || '')}（${esc(ctxRef.user?.role_label || '')}）</b></div>
        <div class="kv"><span>鉴权模式</span><b>${ctxRef.user?.via === 'bearer' ? 'Bearer API Token' : 'Session Cookie 会话'}</b></div>
        <div class="kv"><span>前端静态目录</span><b class="mono">app/static/viz</b></div>
        <div class="kv"><span>持久化表</span><b class="mono">messages / console_settings / console_users / muse_registry</b></div>
      </div>
    </div>`;

  body.querySelectorAll('[data-copy-ep]').forEach((row) => {
    row.onclick = async () => {
      try {
        await navigator.clipboard.writeText(row.dataset.copyEp);
        toast(`已复制接口路径：${row.dataset.copyEp}`);
      } catch { /* ignore */ }
    };
  });
}
