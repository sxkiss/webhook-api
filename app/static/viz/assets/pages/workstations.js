import { api, store } from '../api.js';
import {
  esc, num, rel, defaultAvatar, initial, fmtTime, debounce, icon, toast,
  paletteFor, museBadgeText, MUSE_POSTURES, resolveMuseLiveAction, openMuseActionModal,
} from '../ui.js';

let ctxRef = null;
let dataRef = null;

// 记录每个工位实时触发或手动演练的动作状态
const liveBursts = new Map();

const state = {
  win: '24h',
  filter: 'all', // 'all' | 'active' | 'muse'
  sideTab: 'live', // 'live' | 'defs'
  selected: null,
  hovered: null,
  selectedMsgs: [],
  loadingMsgs: false,
  cam: {
    yaw: 0.38,
    pitch: 0.56,
    zoom: 1.04,
    autoSway: true,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
};

const STATUS_META = {
  online: { color: '#35e08a', glow: 'rgba(53,224,138,0.45)', label: '在线' },
  active: { color: '#45e6f5', glow: 'rgba(69,230,245,0.45)', label: '活跃' },
  idle:   { color: '#ffc21a', glow: 'rgba(255,194,26,0.40)',  label: '空闲' },
  silent: { color: '#7d89a8', glow: 'rgba(125,137,168,0.25)', label: '待命' },
  empty:  { color: '#5c6680', glow: 'rgba(92,102,128,0.20)',  label: '空置' },
};

const AWAKE = ['online', 'active', 'idle'];

function displayNodeName(name, nodeMap) {
  if (!name) return '未知';
  if (name === 'relay') return '中继核心';
  if (name === 'console') return '控制台';
  const found = nodeMap?.get(name);
  return found?.display_name || found?.name || name;
}

export async function mount(root, ctx) {
  ctxRef = ctx;
  state.win = store.settings?.default_window || '24h';
  state.selected = ctx.params?.agent || null;

  root.innerHTML = `
    <div class="pg-office">
      <div class="panel-head office-head">
        <div class="office-title-group">
          <span class="dp-badge">3D WORKSTATIONS</span>
          <h2>3D 实时办公工位与动作中心</h2>
          <span class="chip" id="wsStat">加载工位中…</span>
        </div>
        <div class="office-legend">
          <span><i style="background:#45e6f5;box-shadow:0 0 6px #45e6f5"></i>📡入站接收</span>
          <span><i style="background:#35e08a;box-shadow:0 0 6px #35e08a"></i>⌨️拆解推演</span>
          <span><i style="background:#22c55e;box-shadow:0 0 6px #22c55e"></i>🚀出站派发</span>
          <span><i style="background:#ff3f8e;box-shadow:0 0 6px #ff3f8e"></i>🔄跨工位协同</span>
          <span><i style="background:#ffc21a;box-shadow:0 0 6px #ffc21a"></i>🔍审校/待命</span>
        </div>
        <span class="spacer"></span>
        <div class="seg" id="wsCamSeg" title="3D 办公大厅视角">
          <button data-cam="iso" class="on">工位斜视</button>
          <button data-cam="front">正视大屏</button>
          <button data-cam="close">近景特写</button>
          <button data-cam="sway" class="${state.cam.autoSway ? 'on' : ''}">微动巡航</button>
        </div>
        <div class="seg" id="wsFilterSeg" title="筛选工位">
          <button data-filter="all" class="${state.filter === 'all' ? 'on' : ''}">全部工位</button>
          <button data-filter="active" class="${state.filter === 'active' ? 'on' : ''}">活跃</button>
          <button data-filter="muse" class="${state.filter === 'muse' ? 'on' : ''}">Muse</button>
        </div>
        <button class="btn ghost sm" id="wsActionDefBtn">⚡ 动作定义总表</button>
        <button class="btn ghost sm" id="goTopologyBtn">🌐 切换 3D 节点拓扑 →</button>
      </div>

      <div class="office-main">
        <div class="office-body" id="wsBody">
          <canvas class="office-gl" id="wsGl"></canvas>
          <div class="office-ovl" id="wsOvl"></div>

          <div class="office-hud-tl">
            <div class="hud-eyebrow">3D COMMAND OFFICE · 实时工位动作与行为沙盘</div>
            <div class="hud-title">MUSE <span>3D 实时工位大厅</span></div>
            <div class="hud-hint">默认仅展示精简工位铭牌 · 点击任一 3D 工位展开「正在干嘛」详情与动作演练</div>
          </div>

          <div class="office-hud-bl" id="wsHudBl"></div>
        </div>
        <aside class="office-side" id="wsSide"></aside>
      </div>

      <div class="office-foot">
        <div class="office-tag"><span class="live-dot"></span>工位动作与报文流</div>
        <div class="ticker-wrap"><div class="ticker-track" id="wsTicker"></div></div>
      </div>
    </div>`;

  const host = root.querySelector('#wsBody');
  const canvas = root.querySelector('#wsGl');
  const ovl = root.querySelector('#wsOvl');
  const side = root.querySelector('#wsSide');

  root.querySelector('#goTopologyBtn').onclick = () => ctx.go('office');
  root.querySelector('#wsActionDefBtn').onclick = () => {
    if (state.selected && dataRef) {
      const ag = dataRef.agents.find((x) => x.name === state.selected);
      if (ag) {
        openMuseActionModal(ag, store, api, () => {
          rebuildDesks(ovl, side, host, root);
          renderSide(side, ovl, dataRef, root);
        });
        return;
      }
    }
    state.selected = null;
    state.sideTab = 'defs';
    syncSelection(ovl);
    if (dataRef) renderSide(side, ovl, dataRef, root);
    toast('已在右侧展开「Muse 动作定义」列表，可点击任一工位编辑定义或演练动作');
  };

  root.querySelector('#wsCamSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-cam]');
    if (!btn) return;
    const mode = btn.dataset.cam;
    if (mode === 'sway') {
      state.cam.autoSway = !state.cam.autoSway;
      btn.classList.toggle('on', state.cam.autoSway);
      return;
    }
    root.querySelectorAll('#wsCamSeg button:not([data-cam="sway"])').forEach((b) => b.classList.toggle('on', b === btn));
    if (mode === 'iso') { state.cam.yaw = 0.38; state.cam.pitch = 0.56; state.cam.zoom = 1.04; }
    else if (mode === 'front') { state.cam.yaw = 0.0; state.cam.pitch = 0.44; state.cam.zoom = 1.08; }
    else if (mode === 'close') { state.cam.yaw = -0.28; state.cam.pitch = 0.42; state.cam.zoom = 1.28; }
  };

  root.querySelector('#wsFilterSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn || btn.dataset.filter === state.filter) return;
    state.filter = btn.dataset.filter;
    root.querySelectorAll('#wsFilterSeg button').forEach((b) => b.classList.toggle('on', b === btn));
    if (dataRef) {
      rebuildDesks(ovl, side, host, root);
      renderSide(side, ovl, dataRef, root);
    }
  };

  const onPointerDown = (e) => {
    if (e.target.closest('.ac3d')) return;
    state.cam.dragging = true;
    state.cam.lastX = e.clientX;
    state.cam.lastY = e.clientY;
    canvas.classList.add('dragging');
  };
  const onPointerMove = (e) => {
    if (!state.cam.dragging) return;
    const dx = e.clientX - state.cam.lastX;
    const dy = e.clientY - state.cam.lastY;
    state.cam.lastX = e.clientX;
    state.cam.lastY = e.clientY;
    state.cam.yaw = Math.max(-1.25, Math.min(1.25, state.cam.yaw + dx * 0.006));
    state.cam.pitch = Math.max(0.26, Math.min(1.15, state.cam.pitch + dy * 0.005));
  };
  const onPointerUp = () => {
    state.cam.dragging = false;
    canvas.classList.remove('dragging');
  };
  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    state.cam.zoom = Math.max(0.65, Math.min(1.8, state.cam.zoom * factor));
  };

  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  host.addEventListener('wheel', onWheel, { passive: false });

  host.addEventListener('click', (e) => {
    if (e.target.closest('.ac3d')) return;
    if (state.selected) {
      state.selected = null;
      syncSelection(ovl);
      if (dataRef) renderSide(side, ovl, dataRef, root);
    }
  });

  const stopLoop = startOffice3DLoop(host, canvas, ovl, root);

  const offMsg = store.on('messages', (items) => {
    if (Array.isArray(items)) {
      items.forEach((m) => {
        const posture = m.direction === 'inbound' ? 'receiving' : 'dispatching';
        triggerDeskAction(m.name, posture, false, ovl, side, root);
      });
    }
    debounce(() => load(root, ovl, side, host), 1200)();
  });

  await load(root, ovl, side, host);

  return () => {
    stopLoop();
    offMsg();
    host.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    host.removeEventListener('wheel', onWheel);
  };
}

// ─── 3D 办公工位状态 ─────────────────────────────────────────────────────────
let sceneDesks = []; // [{ item, wx, wz, deskIdx, row, col, domEl, liveAction }]
let sceneBeams = []; // [{ fromPos, toPos, t, speed, color }]

function triggerDeskAction(agentName, posture, isManual = true, ovl = null, side = null, root = null) {
  const nowSec = Date.now() / 1000;
  const duration = isManual ? 14 : 8;
  liveBursts.set(agentName, {
    posture,
    until: nowSec + duration,
    duration,
    isManual,
  });

  const desk = sceneDesks.find((d) => d.item.name === agentName);
  if (desk) {
    // 发射一道全息协同或汇报光束（发往前方中央指挥大屏或相邻工位）
    const meta = MUSE_POSTURES[posture] || MUSE_POSTURES.coding;
    let targetPos = { x: 0, z: -210 }; // 默认指向前方中央大屏墙
    if (posture === 'handoff' && sceneDesks.length > 1) {
      const peer = sceneDesks.find((d) => d.item.name !== agentName);
      if (peer) targetPos = { x: peer.wx, z: peer.wz };
    }
    for (let i = 0; i < 3; i++) {
      sceneBeams.push({
        fromPos: posture === 'receiving' ? targetPos : { x: desk.wx, z: desk.wz },
        toPos: posture === 'receiving' ? { x: desk.wx, z: desk.wz } : targetPos,
        t: -i * 0.15,
        speed: 0.016,
        color: meta.color,
      });
    }
  }

  if (ovl) refreshDeskPills(ovl, root);
  if (side && dataRef) renderSide(side, ovl, dataRef, root);
}

async function load(root, ovl, side, host) {
  try {
    const [agentsData, lineage, events, overview, routesData] = await Promise.all([
      api.agents(),
      api.lineage(state.win, true),
      api.events(24),
      api.overview(state.win),
      api.routes().catch(() => ({ routes: [] })),
    ]);
    store.setAgents(agentsData.agents || []);

    const routeMap = new Map();
    for (const r of (routesData.routes || [])) {
      const targetChannel = r.channel_id || r.inbox_name;
      const isEnabled = (r.enabled !== undefined ? Boolean(r.enabled) : r.status === 'active') && r.muse_status !== 'disabled';
      if (isEnabled && targetChannel) {
        const list = routeMap.get(targetChannel) || [];
        list.push(r);
        routeMap.set(targetChannel, list);
      }
    }

    const lineageNodeMap = new Map((lineage.nodes || []).map((n) => [n.name, n]));
    const rawAgents = agentsData.agents || [];

    const enrichedAgents = rawAgents.map((a) => {
      const ln = lineageNodeMap.get(a.name);
      return {
        ...a,
        peers_out: ln?.peers_out || [],
        peers_in: ln?.peers_in || [],
        routes: routeMap.get(a.name) || [],
      };
    });

    dataRef = {
      agents: enrichedAgents,
      nodeMap: new Map([
        ...enrichedAgents.map((a) => [a.name, a]),
        ['relay', { name: 'relay', display_name: '中继核心' }],
        ['console', { name: 'console', display_name: '控制台' }],
      ]),
      kpis: overview.kpis || { messages: 0, inbound: 0, outbound: 0, online: 0 },
      events: events.events || [],
    };

    const statEl = root.querySelector('#wsStat');
    if (statEl) {
      statEl.textContent = `${dataRef.agents.length} 个 3D 工位 · ${dataRef.kpis.online} 在线`;
    }

    if (state.selected) {
      await loadSelectedMessages(state.selected);
    }

    rebuildDesks(ovl, side, host, root);
    renderBottomPostureBar(root);
    renderSide(side, ovl, dataRef, root);
    renderTicker(root.querySelector('#wsTicker'), dataRef.events);
  } catch (err) {
    ovl.innerHTML = `<div class="empty-state"><b>3D 实时工位加载失败</b><span>${esc(err.message)}</span></div>`;
  }
}

function renderBottomPostureBar(root) {
  const hudBl = root.querySelector('#wsHudBl');
  if (!hudBl || !dataRef) return;
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;
  const counts = {};
  dataRef.agents.forEach((a) => {
    const act = resolveMuseLiveAction(a, customMap, liveBursts.get(a.name), nowSec);
    counts[act.posture] = (counts[act.posture] || 0) + 1;
  });

  hudBl.innerHTML = Object.values(MUSE_POSTURES).map((p) => {
    const c = counts[p.key] || 0;
    return `<div class="hbl-item">
      <span>${p.icon} ${esc(p.short)}</span>
      <b style="color:${c > 0 ? p.color : 'var(--ink3)'}">${c} <small>工位</small></b>
    </div>`;
  }).join('');
}

async function loadSelectedMessages(agentName) {
  state.loadingMsgs = true;
  try {
    const res = await api.messages(agentName, { limit: 8 });
    state.selectedMsgs = (res.messages || []).slice(-6);
  } catch {
    state.selectedMsgs = [];
  } finally {
    state.loadingMsgs = false;
  }
}

function getFilteredAgents(agents) {
  if (state.filter === 'active') {
    return agents.filter((a) => AWAKE.includes(a.status) || a.total > 0);
  }
  if (state.filter === 'muse') {
    return agents.filter((a) => /^muse/i.test(a.name) || a.registered);
  }
  return agents;
}

function rebuildDesks(ovl, side, host, root) {
  if (!dataRef) return;
  const agents = getFilteredAgents(dataRef.agents);
  if (!agents.length) {
    sceneDesks = [];
    ovl.innerHTML = `<div class="empty-state"><b>当前筛选下暂无工位</b><span>可切换顶部筛选按钮</span></div>`;
    return;
  }

  // 按网格矩阵排列 3D 办公桌（每排 3~4 张工位桌，留出中央过道）
  const cols = agents.length <= 4 ? 2 : (agents.length <= 9 ? 3 : 4);
  const rows = Math.ceil(agents.length / cols);
  const spacingX = cols === 2 ? 175 : (cols === 3 ? 148 : 126);
  const spacingZ = 128;

  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;
  const desks = [];

  agents.forEach((item, idx) => {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const rowItems = r === rows - 1 ? (agents.length - r * cols) : cols;
    const wx = (c - (rowItems - 1) / 2) * spacingX;
    const wz = -55 + (r - (rows - 1) / 2) * spacingZ;
    const liveAction = resolveMuseLiveAction(item, customMap, liveBursts.get(item.name), nowSec);
    desks.push({ item, wx, wz, deskIdx: idx + 1, row: r, col: c, liveAction, domEl: null });
  });

  // 生成每个 3D 工位的 DOM：默认只有「精简小铭牌 (名字 + 当前动作短语)」，点击后才在上方展开详情浮窗！
  ovl.innerHTML = desks.map((d) => {
    const a = d.item;
    const av = a.avatar || defaultAvatar(a.name);
    const label = a.display_name || a.name;
    const badge = museBadgeText(a.name) || `#${d.deskIdx}`;
    const pal = paletteFor(a.name);
    const act = d.liveAction;
    const outs = (a.peers_out || []).slice(0, 2).map((p) => `→ ${esc(displayNodeName(p.to, dataRef.nodeMap))}(${p.count})`).join(' ');

    return `
      <div class="ac3d ws3d ${state.selected === a.name ? 'selected' : ''}" data-name="${esc(a.name)}" style="--c:${act.meta.color}">
        <!-- 仅在点击该 3D 工位后才展开的浮窗详情 -->
        <div class="ac3d-pop">
          <div class="apop-hd">
            <b>${esc(label)}</b>
            <span class="chip" style="color:${act.meta.color};border-color:${act.meta.color};padding:0 5px;font-size:9.5px">
              ${act.meta.icon} ${esc(act.meta.short)}
            </span>
          </div>
          <div class="apop-duty">${esc(act.profile.duty)}</div>
          <div class="apop-act-box" style="--act-c:${act.meta.color}">
            <div class="apop-step">${esc(act.stepLabel)} · ${esc(act.targetLabel)}</div>
            <div class="apop-act-txt">${esc(act.actionText)}</div>
          </div>
          <div class="apop-nums">
            <span>共 <b>${num(a.total || 0)}</b> 条</span>
            <span class="in">↓收 ${num(a.inbound || 0)}</span>
            <span class="out">↑发 ${num(a.outbound || 0)}</span>
            ${outs ? `<span class="out">${outs}</span>` : ''}
          </div>
          <div class="apop-drills">
            ${Object.values(MUSE_POSTURES).map((p) => `
              <button type="button" class="apop-drill-btn ${act.posture === p.key ? 'on' : ''}"
                      data-drill="${esc(p.key)}" data-agent="${esc(a.name)}" title="切换 3D 工位动作：${esc(p.short)}">
                ${p.icon} ${esc(p.short)}
              </button>`).join('')}
          </div>
          <div class="apop-btns">
            <button type="button" class="btn ghost sm" data-pop-act="def" data-agent="${esc(a.name)}">⚙️ 定义动作</button>
            <button type="button" class="btn sm" data-pop-act="chat" data-agent="${esc(a.name)}">💬 通信台</button>
          </div>
        </div>

        <!-- 默认常驻的轻量级工位铭牌（绝不遮挡 3D 办公桌与小人！） -->
        <div class="ac3d-pill">
          <div class="ac3d-av">
            ${av
              ? `<img src="${esc(av)}" alt="${esc(label)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
                 <span class="ac3d-fb" style="display:none;background:${pal.bg};color:${pal.fg}">${esc(initial(label))}</span>`
              : `<span class="ac3d-fb" style="background:${pal.bg};color:${pal.fg}">${esc(initial(label))}</span>`}
            <em class="ac3d-badge">${esc(badge)}</em>
          </div>
          <span class="ac3d-nm">${esc(label)}</span>
          <span class="ws-pill-act" style="color:${act.meta.color}">${act.meta.icon} ${esc(act.meta.short)}</span>
        </div>
      </div>`;
  }).join('');

  ovl.querySelectorAll('[data-drill]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const agName = btn.dataset.agent;
      const pKey = btn.dataset.drill;
      triggerDeskAction(agName, pKey, true, ovl, side, root);
      toast(`${agName} 3D 工位开始执行「${MUSE_POSTURES[pKey]?.short}」`);
    };
  });

  ovl.querySelectorAll('[data-pop-act]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const agName = btn.dataset.agent;
      const ag = dataRef.agents.find((x) => x.name === agName);
      if (btn.dataset.popAct === 'def' && ag) {
        openMuseActionModal(ag, store, api, () => {
          rebuildDesks(ovl, side, host, root);
          renderSide(side, ovl, dataRef, root);
        });
      } else {
        ctxRef?.go('chat', { agent: agName });
      }
    };
  });

  const domNodes = ovl.querySelectorAll('.ac3d');
  desks.forEach((d, i) => {
    d.domEl = domNodes[i];
    const name = d.item.name;
    d.domEl.addEventListener('mouseenter', () => {
      state.hovered = name;
      syncSelection(ovl);
    });
    d.domEl.addEventListener('mouseleave', () => {
      if (state.hovered === name) state.hovered = null;
      syncSelection(ovl);
    });
    d.domEl.addEventListener('click', async (e) => {
      if (e.target.closest('[data-drill]') || e.target.closest('[data-pop-act]')) return;
      e.stopPropagation();
      state.selected = state.selected === name ? null : name;
      syncSelection(ovl);
      renderSide(side, ovl, dataRef, root);
      if (state.selected) {
        await loadSelectedMessages(name);
        renderSide(side, ovl, dataRef, root);
      }
    });
    d.domEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      ctxRef?.go('chat', { agent: name });
    });
  });

  sceneDesks = desks;
  syncSelection(ovl);
}

function refreshDeskPills(ovl, root) {
  if (!ovl || !sceneDesks.length) return;
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;
  sceneDesks.forEach((d) => {
    const act = resolveMuseLiveAction(d.item, customMap, liveBursts.get(d.item.name), nowSec);
    d.liveAction = act;
    if (!d.domEl) return;
    d.domEl.style.setProperty('--c', act.meta.color);
    const pillAct = d.domEl.querySelector('.ws-pill-act');
    if (pillAct) {
      pillAct.style.color = act.meta.color;
      pillAct.textContent = `${act.meta.icon} ${act.meta.short}`;
    }
    const stepEl = d.domEl.querySelector('.apop-step');
    const txtEl = d.domEl.querySelector('.apop-act-txt');
    if (stepEl) stepEl.textContent = `${act.stepLabel} · ${act.targetLabel}`;
    if (txtEl) txtEl.textContent = act.actionText;
  });
  if (root) renderBottomPostureBar(root);
}

function syncSelection(ovl) {
  const focusName = state.selected || state.hovered;
  ovl.querySelectorAll('.ac3d').forEach((el) => {
    const nm = el.dataset.name;
    el.classList.toggle('selected', nm === state.selected);
    el.classList.toggle('dim', Boolean(focusName && nm !== focusName));
  });
}

// ─── 60FPS 3D 赛博办公大厅渲染引擎（办公地板 + 中央全息大屏墙 + 机柜 + 3D 独立工位与动作小人） ───
function startOffice3DLoop(host, canvas, ovl, root) {
  let raf = 0;
  let tick = 0;
  let lastSync = 0;
  const ctx = canvas.getContext('2d');

  const project = (wx, wy, wz, W, H) => {
    const cosY = Math.cos(state.cam.yaw);
    const sinY = Math.sin(state.cam.yaw);
    const cosP = Math.cos(state.cam.pitch);
    const sinP = Math.sin(state.cam.pitch);

    const x1 = wx * cosY - wz * sinY;
    const z1 = wx * sinY + wz * cosY;
    const y2 = wy * cosP - z1 * sinP;
    const z2 = wy * sinP + z1 * cosP;

    const fov = 760 * state.cam.zoom;
    const dist = 680 + z2;
    const scale = fov / Math.max(120, dist);
    return {
      x: W * 0.50 + x1 * scale,
      y: H * 0.57 - y2 * scale,
      scale,
      depth: z2,
    };
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    tick += 0.016;

    if (tick - lastSync > 1.2) {
      lastSync = tick;
      refreshDeskPills(ovl, root);
    }

    if (state.cam.autoSway && !state.cam.dragging && !state.hovered && !state.selected) {
      state.cam.yaw = 0.25 + Math.sin(tick * 0.35) * 0.22;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = host.clientWidth || 720;
    const H = host.clientHeight || 480;
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    const isLight = document.documentElement.dataset.theme === 'ops';
    const isAmber = document.documentElement.dataset.theme === 'amber';
    const primaryHex = isAmber ? '#ffc46b' : (isLight ? '#2563eb' : '#45e6f5');
    const gridStroke = isLight ? 'rgba(15,23,42,0.08)' : (isAmber ? 'rgba(255,196,107,0.10)' : 'rgba(69,230,245,0.10)');

    // 1. 绘制 3D 矩形办公大厅地板与网格 (x: -310..310, z: -220..220)
    const FW = 310;
    const FZ_BACK = -215;
    const FZ_FRONT = 215;

    const flBL = project(-FW, 0, FZ_BACK, W, H);
    const flBR = project(FW, 0, FZ_BACK, W, H);
    const flFR = project(FW, 0, FZ_FRONT, W, H);
    const flFL = project(-FW, 0, FZ_FRONT, W, H);

    ctx.beginPath();
    ctx.moveTo(flBL.x, flBL.y);
    ctx.lineTo(flBR.x, flBR.y);
    ctx.lineTo(flFR.x, flFR.y);
    ctx.lineTo(flFL.x, flFL.y);
    ctx.closePath();
    ctx.fillStyle = isLight ? 'rgba(241,245,249,0.55)' : 'rgba(10,16,28,0.65)';
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = 1.4;
    ctx.fill();
    ctx.stroke();

    for (let gx = -250; gx <= 250; gx += 50) {
      const p1 = project(gx, 0, FZ_BACK, W, H);
      const p2 = project(gx, 0, FZ_FRONT, W, H);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    for (let gz = -180; gz <= 180; gz += 45) {
      const p1 = project(-FW, 0, gz, W, H);
      const p2 = project(FW, 0, gz, W, H);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 2. 绘制后方 3D 巨幅全息指挥大屏墙 (Command Wall Screen at z = -215)
    drawCommandWall3D(ctx, project, W, H, tick, primaryHex, isLight);

    // 3. 绘制左侧 3D 核心服务器机柜阵列 (Server Racks at x = -280)
    drawServerRacks3D(ctx, project, W, H, tick, primaryHex, isLight);

    // 4. 绘制工位间全息协同光束粒子
    for (let i = sceneBeams.length - 1; i >= 0; i--) {
      const bm = sceneBeams[i];
      bm.t += bm.speed;
      if (bm.t > 1) {
        sceneBeams.splice(i, 1);
        continue;
      }
      if (bm.t < 0) continue;
      const u = bm.t;
      const wx = bm.fromPos.x + (bm.toPos.x - bm.fromPos.x) * u;
      const wz = bm.fromPos.z + (bm.toPos.z - bm.fromPos.z) * u;
      const wy = 24 + Math.sin(u * Math.PI) * 52;
      const p = project(wx, wy, wz, W, H);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.2 * p.scale, 0, Math.PI * 2);
      ctx.fillStyle = bm.color;
      ctx.shadowColor = bm.color;
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 5. 按深度排序渲染每一个 3D 独立办公工位 + 3D Muse 动作小人
    const sortedDesks = [...sceneDesks].map((d) => {
      const pFloor = project(d.wx, 0, d.wz, W, H);
      const pTop = project(d.wx, 54, d.wz, W, H);
      return { d, pFloor, pTop };
    }).sort((a, b) => b.pFloor.depth - a.pFloor.depth);

    sortedDesks.forEach(({ d, pFloor, pTop }) => {
      const st = STATUS_META[d.item.status] || STATUS_META.silent;
      const isSelected = state.selected === d.item.name;
      const isHovered = state.hovered === d.item.name;
      drawOfficeDeskUnit3D(ctx, project, d, pFloor, W, H, tick, st, isSelected || isHovered, isLight);

      if (d.domEl) {
        const zBoost = isSelected ? 2200 : (isHovered ? 1900 : Math.round(1000 - pFloor.depth));
        d.domEl.style.transform = `translate3d(${pTop.x.toFixed(1)}px, ${pTop.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${Math.max(0.80, Math.min(1.08, pTop.scale)).toFixed(3)})`;
        d.domEl.style.zIndex = String(zBoost);
      }
    });

    ctx.restore();
  };

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

function drawCommandWall3D(ctx, project, W, H, tick, primaryHex, isLight) {
  const wBL = project(-175, 18, -212, W, H);
  const wBR = project(175, 18, -212, W, H);
  const wTR = project(175, 86, -212, W, H);
  const wTL = project(-175, 86, -212, W, H);

  ctx.beginPath();
  ctx.moveTo(wBL.x, wBL.y);
  ctx.lineTo(wBR.x, wBR.y);
  ctx.lineTo(wTR.x, wTR.y);
  ctx.lineTo(wTL.x, wTL.y);
  ctx.closePath();
  ctx.fillStyle = isLight ? 'rgba(15,23,42,0.88)' : 'rgba(6,18,38,0.92)';
  ctx.strokeStyle = primaryHex;
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  // 大屏实时动态心电波形线
  ctx.beginPath();
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const wx = -155 + u * 310;
    const wy = 46 + Math.sin(u * 10 + tick * 4) * 10 + Math.cos(u * 23 - tick * 6) * 5;
    const p = project(wx, wy, -210, W, H);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.strokeStyle = '#35e08a';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // 大屏标题文字
  const pTxt = project(0, 72, -210, W, H);
  ctx.fillStyle = primaryHex;
  ctx.font = `700 ${Math.round(11 * pTxt.scale)}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText('MUSE COMMAND WALL · 实时工位遥测中心', pTxt.x, pTxt.y);
}

function drawServerRacks3D(ctx, project, W, H, tick, primaryHex, isLight) {
  for (const rz of [-120, -45, 30]) {
    const b1 = project(-285, 0, rz - 20, W, H);
    const b2 = project(-255, 0, rz - 20, W, H);
    const t2 = project(-255, 58, rz - 20, W, H);
    const t1 = project(-285, 58, rz - 20, W, H);

    ctx.beginPath();
    ctx.moveTo(b1.x, b1.y);
    ctx.lineTo(b2.x, b2.y);
    ctx.lineTo(t2.x, t2.y);
    ctx.lineTo(t1.x, t1.y);
    ctx.closePath();
    ctx.fillStyle = isLight ? '#334155' : '#0f172a';
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = 1.1;
    ctx.fill();
    ctx.stroke();

    // 机柜闪烁指示灯
    for (let ly = 14; ly <= 48; ly += 11) {
      const lp = project(-265, ly, rz - 19, W, H);
      const on = Math.sin(tick * 5 + ly + rz) > 0;
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, 2.0 * lp.scale, 0, Math.PI * 2);
      ctx.fillStyle = on ? '#35e08a' : '#45e6f5';
      ctx.fill();
    }
  }
}

// ─── 绘制单个 3D 办公工位（办公桌 + 双联屏 + 安灯塔 + 办公椅 + 3D Muse 动作小人） ─────
function drawOfficeDeskUnit3D(ctx, project, desk, pFloor, W, H, tick, st, activeHighlight, isLight) {
  const { wx, wz, deskIdx } = desk;
  const liveAct = desk.liveAction || { posture: 'patrol', meta: MUSE_POSTURES.patrol };
  const posture = liveAct.posture;
  const actColor = liveAct.meta?.color || st.color;

  // 所有工位统一朝向后方大屏墙（北向 -Z），小人坐在桌后（+Z 侧）面朝双联屏，玩家从前方斜向下即可清晰看到桌面、双屏与小人全身动作！
  const toWorld = (lx, ly, lz) => project(wx + lx, ly, wz + lz, W, H);

  // 1. 3D 独立工位地垫 (Carpet Pad: lx -44..44, lz -34..36)
  const padBL = toWorld(-44, 0, -34);
  const padBR = toWorld(44, 0, -34);
  const padFR = toWorld(44, 0, 36);
  const padFL = toWorld(-44, 0, 36);

  ctx.beginPath();
  ctx.moveTo(padBL.x, padBL.y);
  ctx.lineTo(padBR.x, padBR.y);
  ctx.lineTo(padFR.x, padFR.y);
  ctx.lineTo(padFL.x, padFL.y);
  ctx.closePath();
  ctx.fillStyle = activeHighlight
    ? st.glow
    : (isLight ? 'rgba(226,232,240,0.82)' : 'rgba(13,22,40,0.88)');
  ctx.strokeStyle = actColor;
  ctx.lineWidth = activeHighlight ? 2.4 : 1.3;
  ctx.fill();
  ctx.stroke();

  // 地垫前缘工位编号
  const numPos = toWorld(-32, 0.5, 29);
  ctx.fillStyle = actColor;
  ctx.font = `700 ${Math.max(8, Math.round(9.5 * numPos.scale))}px "JetBrains Mono", monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`DESK #0${deskIdx}`, numPos.x, numPos.y);

  // 2. 3D 指挥办公桌 (位于工位北侧 lz = -22..+2, 桌面高度 y = 16)
  for (const [lx, lz] of [[-32, -20], [32, -20], [-32, 0], [32, 0]]) {
    const legT = toWorld(lx, 16, lz);
    const legB = toWorld(lx, 0, lz);
    ctx.beginPath();
    ctx.moveTo(legT.x, legT.y);
    ctx.lineTo(legB.x, legB.y);
    ctx.strokeStyle = isLight ? '#64748b' : '#334155';
    ctx.lineWidth = 2.0 * pFloor.scale;
    ctx.stroke();
  }

  const dBL = toWorld(-35, 16, -22);
  const dBR = toWorld(35, 16, -22);
  const dFR = toWorld(35, 16, 3);
  const dFL = toWorld(-35, 16, 3);
  ctx.beginPath();
  ctx.moveTo(dBL.x, dBL.y);
  ctx.lineTo(dBR.x, dBR.y);
  ctx.lineTo(dFR.x, dFR.y);
  ctx.lineTo(dFL.x, dFL.y);
  ctx.closePath();
  ctx.fillStyle = isLight ? '#ffffff' : '#131f35';
  ctx.strokeStyle = actColor;
  ctx.lineWidth = 1.6;
  ctx.fill();
  ctx.stroke();

  // 桌面发光机械键盘与咖啡杯
  const kbL = toWorld(-11, 16.8, -4);
  const kbR = toWorld(11, 16.8, -4);
  ctx.beginPath();
  ctx.moveTo(kbL.x, kbL.y);
  ctx.lineTo(kbR.x, kbR.y);
  ctx.strokeStyle = posture === 'coding' ? '#35e08a' : actColor;
  ctx.lineWidth = 3.2 * pFloor.scale;
  ctx.stroke();

  const mug = toWorld(22, 18.5, -5);
  ctx.beginPath();
  ctx.arc(mug.x, mug.y, 2.8 * mug.scale, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();

  // 3. 3D 双联全息显示屏 (立于桌北侧 lz = -18, 高度 y = 18..33)
  for (const sideSign of [-1, 1]) {
    const xIn = sideSign * 2;
    const xOut = sideSign * 26;
    const sBL = toWorld(xIn, 18, -18);
    const sBR = toWorld(xOut, 18, -14);
    const sTR = toWorld(xOut, 33, -14);
    const sTL = toWorld(xIn, 33, -18);

    ctx.beginPath();
    ctx.moveTo(sBL.x, sBL.y);
    ctx.lineTo(sBR.x, sBR.y);
    ctx.lineTo(sTR.x, sTR.y);
    ctx.lineTo(sTL.x, sTL.y);
    ctx.closePath();
    ctx.fillStyle = isLight ? 'rgba(15,23,42,0.86)' : 'rgba(6,24,48,0.90)';
    ctx.strokeStyle = actColor;
    ctx.lineWidth = 1.3;
    ctx.fill();
    ctx.stroke();

    // 屏幕实时动态代码行/波形
    for (let ln = 0; ln < 4; ln++) {
      const ly = 20.5 + ln * 3.0 + (posture === 'coding' ? (tick * 7) % 2.4 : 0);
      if (ly > 31.5) continue;
      const ratio = posture === 'coding'
        ? (0.4 + ((ln * 29 + Math.floor(tick * 9)) % 55) / 100)
        : 0.78;
      const l1 = toWorld(sideSign * 4, ly, -17.5);
      const l2 = toWorld(sideSign * (4 + 19 * ratio), ly, -15);
      ctx.beginPath();
      ctx.moveTo(l1.x, l1.y);
      ctx.lineTo(l2.x, l2.y);
      ctx.strokeStyle = ln === 0 ? '#ffffff' : actColor;
      ctx.lineWidth = 1.4 * pFloor.scale;
      ctx.stroke();
    }
  }

  // 4. 3D 安灯状态塔 (立于办公桌右上角 lx = 31, lz = -18, y = 16..40)
  const andonB = toWorld(31, 16, -18);
  const andonT = toWorld(31, 40, -18);
  ctx.beginPath();
  ctx.moveTo(andonB.x, andonB.y);
  ctx.lineTo(andonT.x, andonT.y);
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1.8 * pFloor.scale;
  ctx.stroke();

  const lampCols = ['#35e08a', '#ffc21a', actColor];
  [29, 34, 39.5].forEach((ly, idx) => {
    const lp = toWorld(31, ly, -18);
    ctx.beginPath();
    ctx.arc(lp.x, lp.y, (idx === 2 ? 3.8 : 2.5) * lp.scale, 0, Math.PI * 2);
    ctx.fillStyle = lampCols[idx];
    if (idx === 2) {
      ctx.shadowColor = actColor;
      ctx.shadowBlur = 12;
    }
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // 5. 3D Muse 角色小人（坐在桌前 lz = +11，执行实时动作动画！）
  const pal = paletteFor(desk.item.name);
  const breath = Math.sin(tick * 3.2 + deskIdx) * 1.2;
  const leanZ = (posture === 'coding' || posture === 'reviewing') ? -3.0 : 0;

  // 躯干 (Torso)
  const hip = toWorld(0, 11, 11);
  const shoulder = toWorld(0, 26 + breath * 0.5, 11 + leanZ);
  ctx.beginPath();
  ctx.moveTo(hip.x, hip.y);
  ctx.lineTo(shoulder.x, shoulder.y);
  ctx.strokeStyle = actColor;
  ctx.lineWidth = 9.5 * pFloor.scale;
  ctx.lineCap = 'round';
  ctx.stroke();

  // 左右手臂实时动作 (Left & Right Arms)
  const shL = toWorld(-6, 25 + breath * 0.5, 11 + leanZ);
  const shR = toWorld(6, 25 + breath * 0.5, 11 + leanZ);
  let handL;
  let handR;

  if (posture === 'coding') {
    const tapL = Math.sin(tick * 18 + deskIdx) * 3.0;
    const tapR = Math.cos(tick * 18 + deskIdx) * 3.0;
    handL = toWorld(-6, 17.5 + Math.max(0, tapL), -2);
    handR = toWorld(6, 17.5 + Math.max(0, tapR), -2);
  } else if (posture === 'receiving') {
    handL = toWorld(-7, 17.5, -1);
    handR = toWorld(10, 35 + Math.sin(tick * 8) * 2.0, 8);
  } else if (posture === 'dispatching') {
    handL = toWorld(-7, 18.0, -1);
    handR = toWorld(11, 41 + Math.sin(tick * 10) * 3.0, 2);
  } else if (posture === 'handoff') {
    handL = toWorld(-7, 18.0, 0);
    handR = toWorld(18 + Math.sin(tick * 9) * 4.0, 30, 8);
  } else if (posture === 'reviewing') {
    handL = toWorld(-7, 17.5, -1);
    handR = toWorld(3.5, 29, 5);
  } else {
    handL = toWorld(-7, 17.5, 1);
    handR = toWorld(19, 19.5 + Math.sin(tick * 2.5) * 2.0, -3);
  }

  for (const [sh, hd] of [[shL, handL], [shR, handR]]) {
    ctx.beginPath();
    ctx.moveTo(sh.x, sh.y);
    ctx.lineTo(hd.x, hd.y);
    ctx.strokeStyle = isLight ? pal.fg : '#e2e8f0';
    ctx.lineWidth = 3.8 * pFloor.scale;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hd.x, hd.y, 2.6 * hd.scale, 0, Math.PI * 2);
    ctx.fillStyle = actColor;
    ctx.fill();
  }

  // 3D 人体工学椅背 (位于小人后侧 lz = +16，营造包裹立体感)
  const chB1 = toWorld(-8, 9, 16);
  const chB2 = toWorld(8, 9, 16);
  const chT2 = toWorld(7, 24, 17);
  const chT1 = toWorld(-7, 24, 17);
  ctx.beginPath();
  ctx.moveTo(chB1.x, chB1.y);
  ctx.lineTo(chB2.x, chB2.y);
  ctx.lineTo(chT2.x, chT2.y);
  ctx.lineTo(chT1.x, chT1.y);
  ctx.closePath();
  ctx.fillStyle = isLight ? '#94a3b8' : '#1e293b';
  ctx.strokeStyle = actColor;
  ctx.lineWidth = 1.1;
  ctx.fill();
  ctx.stroke();

  // 3D Muse 头部 + 头顶光环 (Head + Halo)
  const headPos = toWorld(0, 34 + breath, 11 + leanZ);
  ctx.beginPath();
  ctx.arc(headPos.x, headPos.y, 7.2 * headPos.scale, 0, Math.PI * 2);
  ctx.fillStyle = '#f8fafc';
  ctx.strokeStyle = actColor;
  ctx.lineWidth = 2.0;
  ctx.shadowColor = actColor;
  ctx.shadowBlur = activeHighlight ? 14 : 6;
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 头顶战术光环
  ctx.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (Math.PI * 2 * i) / 20 + tick * 2.2;
    const hp = toWorld(Math.cos(a) * 8.5, 43 + breath, 11 + leanZ + Math.sin(a) * 8.5);
    if (i === 0) ctx.moveTo(hp.x, hp.y);
    else ctx.lineTo(hp.x, hp.y);
  }
  ctx.strokeStyle = actColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 动作专属 3D 视觉特效
  if (posture === 'receiving') {
    const waveR = 8 + ((tick * 18) % 18);
    ctx.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (Math.PI * 2 * i) / 20;
      const wp = toWorld(Math.cos(a) * waveR, 44 + breath, 11 + Math.sin(a) * waveR);
      if (i === 0) ctx.moveTo(wp.x, wp.y);
      else ctx.lineTo(wp.x, wp.y);
    }
    ctx.strokeStyle = '#45e6f5';
    ctx.globalAlpha = Math.max(0.15, 1 - waveR / 26);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (posture === 'dispatching') {
    ctx.beginPath();
    ctx.arc(handR.x, handR.y - 5 * handR.scale, 4.8 * handR.scale, 0, Math.PI * 2);
    ctx.fillStyle = '#35e08a';
    ctx.shadowColor = '#35e08a';
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (posture === 'reviewing') {
    const scrMid = toWorld(0, 25 + Math.sin(tick * 6) * 4, -16);
    ctx.beginPath();
    ctx.moveTo(headPos.x, headPos.y);
    ctx.lineTo(scrMid.x, scrMid.y);
    ctx.strokeStyle = 'rgba(255,194,26,0.65)';
    ctx.lineWidth = 1.8 * headPos.scale;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function renderTicker(host, items) {
  if (!host) return;
  if (!items.length) {
    host.innerHTML = '<span class="muted">暂无实时事件</span>';
    return;
  }
  const line = items.slice(-14).map((m) => {
    const isIn = m.direction === 'inbound';
    const badge = isIn
      ? '<span class="tk-dir in">↓ 收进</span>'
      : '<span class="tk-dir out">↑ 发出</span>';
    return `<span class="tk-item"><b>${esc(m.name)}</b> ${badge} <span class="muted">${fmtTime(m.timestamp)}</span> ${esc((m.content || `[${m.type}]`).slice(0, 36))}</span>`;
  }).join('');
  host.innerHTML = line + line;
}

function renderSide(side, ovl, data, root) {
  if (!side) return;
  const agents = getFilteredAgents(data.agents);
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;

  if (state.selected) {
    const a = data.agents.find((x) => x.name === state.selected);
    if (a) {
      const st = STATUS_META[a.status] || STATUS_META.silent;
      const liveAct = resolveMuseLiveAction(a, customMap, liveBursts.get(a.name), nowSec);
      const prof = liveAct.profile;

      side.innerHTML = `
        <div class="office-side-head">
          <button class="btn ghost sm" id="backToListBtn">← 返回工位列表</button>
          <span class="spacer"></span>
          <button class="btn ghost sm" id="editActionDefBtn">⚙️ 定义动作</button>
          <button class="btn sm" id="goChatBtn">${icon('chat', 13)} 进通信台</button>
        </div>
        <div class="office-inspector">
          <div class="insp-card" style="border-left:3px solid ${liveAct.meta.color}">
            <div class="insp-top">
              <div class="insp-title">
                <h3>${esc(a.display_name || a.name)}</h3>
                <div class="insp-sub">工位信箱: <code>${esc(a.name)}</code></div>
              </div>
              <span class="chip" style="color:${st.color};border:1px solid ${st.color};background:transparent">${st.label}</span>
            </div>
            <div class="insp-duty">${esc(prof.duty)}</div>
            <div class="insp-kpis">
              <div class="insp-kpi"><span>↓ 累计收进</span><b style="color:#45e6f5">${num(a.inbound)} 条</b></div>
              <div class="insp-kpi"><span>↑ 累计发出</span><b style="color:#35e08a">${num(a.outbound)} 条</b></div>
              <div class="insp-kpi"><span>Σ 报文总计</span><b>${num(a.total)} 条</b></div>
              <div class="insp-kpi"><span>最近活跃</span><b>${rel(a.last_ts)}</b></div>
            </div>
          </div>

          <div class="insp-section insp-live-act" style="--act-c:${liveAct.meta.color}">
            <div class="insp-sec-title">
              <span>实时工位正在干嘛</span>
              <span class="chip" style="color:${liveAct.meta.color};border:1px solid ${liveAct.meta.color};background:transparent">${liveAct.meta.icon} ${esc(liveAct.meta.short)}</span>
            </div>
            <div class="ila-now">
              <div class="ila-step">${esc(liveAct.stepLabel)} · 对端 ${esc(liveAct.targetLabel)}</div>
              <div class="ila-txt">${esc(liveAct.actionText)}</div>
              <div class="ila-bar"><i style="width:${liveAct.progress}%;background:${liveAct.meta.color}"></i></div>
            </div>
            <div class="ila-drills">
              <span class="ila-drill-lbl">▶ 点击实时切换 3D 工位小人动作演练：</span>
              <div class="ila-drill-btns">
                ${Object.values(MUSE_POSTURES).map((p) => `
                  <button type="button" class="ila-btn ${liveAct.posture === p.key ? 'on' : ''}" data-drill="${esc(p.key)}" style="--pc:${p.color}" title="${esc(p.desc)}">
                    ${p.icon} ${esc(p.short)}
                  </button>`).join('')}
              </div>
            </div>
          </div>

          <div class="insp-section">
            <div class="insp-sec-title">
              <span>该 Muse 的 5 阶段动作定义</span>
              <a href="#" id="editActionLink" style="color:var(--blue);font-size:11px">✎ 修改定义</a>
            </div>
            <div class="insp-sop-list">
              <div class="insp-sop-row"><span>📡 收到入站</span><b>${esc(prof.on_inbound)}</b></div>
              <div class="insp-sop-row"><span>⌨️ 拆解推演</span><b>${esc(prof.on_process)}</b></div>
              <div class="insp-sop-row"><span>🚀 发送出站</span><b>${esc(prof.on_outbound)}</b></div>
              <div class="insp-sop-row"><span>🔄 跨工位协同</span><b>${esc(prof.on_collab)}</b></div>
              <div class="insp-sop-row"><span>🛰️ 待命巡检</span><b>${esc(prof.on_idle)}</b></div>
            </div>
          </div>

          <form class="insp-quick-send" id="quickSendForm">
            <input type="text" id="quickSendInput" placeholder="向 ${esc(a.display_name || a.name)} 派发指令触发工位动作…" required>
            <button type="submit" class="btn sm">${icon('send', 13)} 派单</button>
          </form>
        </div>`;

      side.querySelector('#backToListBtn').onclick = () => {
        state.selected = null;
        syncSelection(ovl);
        renderSide(side, ovl, data, root);
      };
      side.querySelector('#goChatBtn').onclick = () => ctxRef?.go('chat', { agent: a.name });

      const openEdit = (ev) => {
        ev?.preventDefault();
        openMuseActionModal(a, store, api, () => {
          refreshDeskPills(ovl, root);
          renderSide(side, ovl, data, root);
        });
      };
      side.querySelector('#editActionDefBtn').onclick = openEdit;
      side.querySelector('#editActionLink').onclick = openEdit;

      side.querySelectorAll('.ila-btn[data-drill]').forEach((btn) => {
        btn.onclick = () => {
          const pKey = btn.dataset.drill;
          triggerDeskAction(a.name, pKey, true, ovl, side, root);
          toast(`${a.display_name || a.name} 3D 工位开始执行「${MUSE_POSTURES[pKey]?.short}」`);
        };
      });

      side.querySelector('#quickSendForm').onsubmit = async (ev) => {
        ev.preventDefault();
        const inp = side.querySelector('#quickSendInput');
        const text = inp.value.trim();
        if (!text) return;
        inp.disabled = true;
        try {
          await api.send({ name: a.name, direction: 'inbound', type: 'text', content: text });
          triggerDeskAction(a.name, 'receiving', false, ovl, side, root);
          inp.value = '';
          toast(`指令已派发至 ${a.display_name || a.name}`);
        } catch (err) {
          toast(err.message, 'err');
        } finally {
          inp.disabled = false;
          inp.focus();
        }
      };
      return;
    }
  }

  const sorted = [...agents].sort((a, b) => {
    const sa = AWAKE.includes(a.status) ? 1 : 0;
    const sb = AWAKE.includes(b.status) ? 1 : 0;
    if (sa !== sb) return sb - sa;
    return (b.total - a.total) || ((b.last_ts || 0) - (a.last_ts || 0));
  });

  side.innerHTML = `
    <div class="panel-head" style="gap:6px">
      <div class="seg" id="wsSideSeg" style="width:100%;display:grid;grid-template-columns:1fr 1fr">
        <button data-tab="live" class="${state.sideTab === 'live' ? 'on' : ''}">工位实时状态 (${sorted.length})</button>
        <button data-tab="defs" class="${state.sideTab === 'defs' ? 'on' : ''}">Muse 动作定义 (${sorted.length})</button>
      </div>
    </div>
    ${state.sideTab === 'defs' ? `
      <div class="office-seat-list" id="wsDefList">
        ${sorted.map((a) => {
          const badge = museBadgeText(a.name);
          const liveAct = resolveMuseLiveAction(a, customMap, liveBursts.get(a.name), nowSec);
          const prof = liveAct.profile;
          return `
            <div class="muse-act-card" data-name="${esc(a.name)}" style="--mc:${liveAct.meta.color}">
              <div class="mac-head">
                <div class="mac-title">
                  ${badge ? `<span class="osr-badge">${esc(badge)}</span>` : ''}
                  <b>${esc(a.display_name || a.name)}</b>
                  <span class="mac-live-pill" style="color:${liveAct.meta.color};border-color:${liveAct.meta.color}">
                    ${liveAct.meta.icon} ${esc(liveAct.meta.short)}
                  </span>
                </div>
                <button type="button" class="btn ghost sm mac-edit-btn" data-edit="${esc(a.name)}">⚙️ 编辑定义</button>
              </div>
              <div class="mac-duty">${esc(prof.duty)}</div>
              <div class="mac-sops">
                <div><span>📡 入站:</span> ${esc(prof.on_inbound)}</div>
                <div><span>⌨️ 推演:</span> ${esc(prof.on_process)}</div>
                <div><span>🚀 出站:</span> ${esc(prof.on_outbound)}</div>
                <div><span>🔄 协同:</span> ${esc(prof.on_collab)}</div>
                <div><span>🛰️ 待命:</span> ${esc(prof.on_idle)}</div>
              </div>
              <div class="mac-drills">
                <span>演练:</span>
                ${Object.values(MUSE_POSTURES).map((p) => `
                  <button type="button" class="mac-drill-btn ${liveAct.posture === p.key ? 'on' : ''}"
                          data-agent="${esc(a.name)}" data-drill="${esc(p.key)}">
                    ${p.icon} ${esc(p.short)}
                  </button>`).join('')}
              </div>
            </div>`;
        }).join('')}
      </div>
    ` : `
      <div class="office-seat-list" id="wsLiveList">
        ${sorted.map((a) => {
          const badge = museBadgeText(a.name);
          const liveAct = resolveMuseLiveAction(a, customMap, liveBursts.get(a.name), nowSec);
          return `
            <div class="office-seat-row" data-name="${esc(a.name)}">
              <div class="osr-left">
                <span class="osr-dot" style="background:${liveAct.meta.color};box-shadow:0 0 6px ${liveAct.meta.color}"></span>
                <div style="min-width:0;flex:1">
                  <div class="osr-name">
                    ${badge ? `<span class="osr-badge">${esc(badge)}</span>` : ''}
                    <b>${esc(a.display_name || a.name)}</b>
                    <span class="osr-act-tag" style="--act-c:${liveAct.meta.color}">${liveAct.meta.icon} ${esc(liveAct.meta.short)}</span>
                  </div>
                  <div class="osr-act-desc">${esc(liveAct.actionText)}</div>
                </div>
              </div>
              <div class="osr-right">
                <div class="osr-total">共 ${num(a.total || 0)} 条</div>
                <div class="osr-nums">
                  <span class="in">↓${num(a.inbound || 0)}</span>
                  <span class="muted">·</span>
                  <span class="out">↑${num(a.outbound || 0)}</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `}
  `;

  side.querySelector('#wsSideSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn || btn.dataset.tab === state.sideTab) return;
    state.sideTab = btn.dataset.tab;
    renderSide(side, ovl, data, root);
  };

  side.querySelectorAll('.office-seat-row').forEach((row) => {
    const name = row.dataset.name;
    row.addEventListener('mouseenter', () => {
      state.hovered = name;
      syncSelection(ovl);
    });
    row.addEventListener('mouseleave', () => {
      if (state.hovered === name) state.hovered = null;
      syncSelection(ovl);
    });
    row.addEventListener('click', async () => {
      state.selected = name;
      syncSelection(ovl);
      renderSide(side, ovl, data, root);
      await loadSelectedMessages(name);
      renderSide(side, ovl, data, root);
    });
  });

  side.querySelectorAll('.mac-edit-btn[data-edit]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const ag = data.agents.find((x) => x.name === btn.dataset.edit);
      if (!ag) return;
      openMuseActionModal(ag, store, api, () => {
        refreshDeskPills(ovl, root);
        renderSide(side, ovl, data, root);
      });
    };
  });

  side.querySelectorAll('.mac-drill-btn[data-drill]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const agName = btn.dataset.agent;
      const pKey = btn.dataset.drill;
      triggerDeskAction(agName, pKey, true, ovl, side, root);
      toast(`${agName} 3D 工位开始执行「${MUSE_POSTURES[pKey]?.short}」`);
    };
  });
}
