import { api, store } from '../api.js';
import { platformName } from '../platforms.js';
import { esc, num, rel, defaultAvatar, initial, fmtTime, debounce, icon, toast, paletteFor, museBadgeText } from '../ui.js';

let ctxRef = null;
let dataRef = null;

const state = {
  win: '24h',
  inferred: true,
  filter: 'all', // 'all' | 'active' | 'muse'
  sideTab: 'units', // 'units' | 'flows'
  selected: null,
  hovered: null,
  hoveredEdge: null, // 'from->to'
  selectedMsgs: [],
  loadingMsgs: false,
  cam: {
    yaw: -0.55,
    pitch: 0.62,
    zoom: 1.0,
    autoRotate: true,
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
  state.inferred = store.settings?.show_inferred !== false;
  state.selected = ctx.params?.agent || null;

  root.innerHTML = `
    <div class="pg-office">
      <div class="panel-head office-head">
        <div class="office-title-group">
          <span class="dp-badge">3D 拓扑</span>
          <h2>3D 节点链路沙盘</h2>
          <span class="chip" id="officeStat">同步中…</span>
        </div>
        <div class="office-legend">
          <span><i style="background:#35e08a;box-shadow:0 0 6px #35e08a"></i>在线</span>
          <span><i style="background:#45e6f5;box-shadow:0 0 6px #45e6f5"></i>活跃</span>
          <span><i style="background:#ffc21a;box-shadow:0 0 6px #ffc21a"></i>空闲</span>
          <span><i style="background:#ff3f8e;box-shadow:0 0 6px #ff3f8e"></i>跨节点流向</span>
        </div>
        <span class="spacer"></span>
        <div class="seg" id="officeCamSeg" title="3D 视角预设">
          <button data-cam="iso" class="on">3D 斜视</button>
          <button data-cam="top">俯瞰拓扑</button>
          <button data-cam="low">低角环视</button>
          <button data-cam="auto" class="${state.cam.autoRotate ? 'on' : ''}">自动旋转</button>
        </div>
        <div class="seg" id="officeFilterSeg" title="筛选节点">
          <button data-filter="all" class="${state.filter === 'all' ? 'on' : ''}">全部</button>
          <button data-filter="active" class="${state.filter === 'active' ? 'on' : ''}">活跃</button>
          <button data-filter="muse" class="${state.filter === 'muse' ? 'on' : ''}">Muse</button>
        </div>
        <div class="seg" id="officeWinSeg" title="统计窗口">
          ${Object.entries({ '1h': '1H', '24h': '24H', '7d': '7D' }).map(([v, label]) =>
            `<button data-win="${v}" class="${v === state.win ? 'on' : ''}">${label}</button>`).join('')}
        </div>
        <button class="btn ghost sm" id="officeInferBtn">${state.inferred ? '推断流向: ON' : '推断流向: OFF'}</button>
        <button class="btn sm" id="goWorkstationsBtn" title="切换到 3D 办公工位查看每个 Muse 实时动作">🏢 3D 实时工位 →</button>
      </div>

      <div class="office-main">
        <div class="office-body" id="officeBody">
          <canvas class="office-gl" id="officeGl"></canvas>
          <div class="office-ovl" id="officeOvl"></div>

          <div class="office-hud-tl">
            <div class="hud-eyebrow">3D RELAY TOPOLOGY · 节点链路沙盘</div>
            <div class="hud-title">MUSE <span>3D 节点拓扑</span></div>
            <div class="hud-hint">点击节点展开数量与去向浮窗 · 拖拽旋转 · 滚轮缩放</div>
          </div>

          <div class="office-hud-bl" id="officeHudBl"></div>
        </div>
        <aside class="office-side" id="officeSide"></aside>
      </div>

      <div class="office-foot">
        <div class="office-tag"><span class="live-dot"></span>实时报文脉冲</div>
        <div class="ticker-wrap"><div class="ticker-track" id="ticker"></div></div>
      </div>
    </div>`;

  const host = root.querySelector('#officeBody');
  const canvas = root.querySelector('#officeGl');
  const ovl = root.querySelector('#officeOvl');
  const side = root.querySelector('#officeSide');
  const inferBtn = root.querySelector('#officeInferBtn');

  root.querySelector('#goWorkstationsBtn').onclick = () => ctx.go('workstations');

  root.querySelector('#officeCamSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-cam]');
    if (!btn) return;
    const mode = btn.dataset.cam;
    if (mode === 'auto') {
      state.cam.autoRotate = !state.cam.autoRotate;
      btn.classList.toggle('on', state.cam.autoRotate);
      return;
    }
    root.querySelectorAll('#officeCamSeg button:not([data-cam="auto"])').forEach((b) => b.classList.toggle('on', b === btn));
    if (mode === 'iso') { state.cam.pitch = 0.62; state.cam.zoom = 1.0; }
    else if (mode === 'top') { state.cam.pitch = 1.18; state.cam.zoom = 0.96; }
    else if (mode === 'low') { state.cam.pitch = 0.36; state.cam.zoom = 1.08; }
  };

  root.querySelector('#officeFilterSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn || btn.dataset.filter === state.filter) return;
    state.filter = btn.dataset.filter;
    root.querySelectorAll('#officeFilterSeg button').forEach((b) => b.classList.toggle('on', b === btn));
    if (dataRef) {
      rebuildSceneNodes(ovl, side, host, root);
      renderSide(side, ovl, dataRef);
    }
  };

  root.querySelector('#officeWinSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-win]');
    if (!btn || btn.dataset.win === state.win) return;
    state.win = btn.dataset.win;
    root.querySelectorAll('#officeWinSeg button').forEach((b) => b.classList.toggle('on', b === btn));
    load(root, ovl, side, host);
  };

  inferBtn.onclick = () => {
    state.inferred = !state.inferred;
    inferBtn.textContent = state.inferred ? '推断流向: ON' : '推断流向: OFF';
    load(root, ovl, side, host);
  };

  const onPointerDown = (e) => {
    if (e.target.closest('.ac3d') || e.target.closest('.core3d-tag') || e.target.closest('.edge3d-tag')) return;
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
    state.cam.yaw += dx * 0.0065;
    state.cam.pitch = Math.max(0.28, Math.min(1.28, state.cam.pitch + dy * 0.005));
  };
  const onPointerUp = () => {
    state.cam.dragging = false;
    canvas.classList.remove('dragging');
  };
  const onWheel = (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    state.cam.zoom = Math.max(0.62, Math.min(1.75, state.cam.zoom * factor));
  };

  host.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  host.addEventListener('wheel', onWheel, { passive: false });

  host.addEventListener('click', (e) => {
    if (e.target.closest('.ac3d') || e.target.closest('.core3d-tag') || e.target.closest('.edge3d-tag')) return;
    if (state.selected || state.hoveredEdge) {
      state.selected = null;
      state.hoveredEdge = null;
      syncHudSelection(ovl);
      if (dataRef) renderSide(side, ovl, dataRef);
    }
  });

  const stopLoop = start3DLoop(host, canvas, ovl);

  const offMsg = store.on('messages', (items) => {
    if (Array.isArray(items)) {
      items.forEach((m) => spawnBurstPacket(m.name, m.direction));
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

let sceneSeats = [];
let sceneEdges = [];
let scenePackets = [];
let coreDomEl = null;

function spawnBurstPacket(agentName, direction) {
  const seat = sceneSeats.find((s) => s.item.name === agentName);
  if (!seat) return;
  const isIn = direction === 'inbound';
  for (let i = 0; i < 3; i++) {
    scenePackets.push({
      fromPos: isIn ? { x: seat.wx, z: seat.wz } : { x: 0, z: 0 },
      toPos: isIn ? { x: 0, z: 0 } : { x: seat.wx, z: seat.wz },
      t: -i * 0.14,
      speed: 0.014 + Math.random() * 0.005,
      color: isIn ? '#45e6f5' : '#35e08a',
      size: 4.4,
      arcH: 65 + Math.random() * 25,
    });
  }
}

async function load(root, ovl, side, host) {
  try {
    const [agentsData, lineage, events, overview, routesData] = await Promise.all([
      api.agents(),
      api.lineage(state.win, state.inferred),
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
    const agentNameMap = new Map(rawAgents.map((a) => [a.name, a]));

    const enrichedAgents = rawAgents.map((a) => {
      const ln = lineageNodeMap.get(a.name);
      return {
        ...a,
        win_in: ln ? ln.inbound : a.inbound,
        win_out: ln ? ln.outbound : a.outbound,
        win_vol: ln ? ln.volume : a.total,
        peers_out: ln?.peers_out || [],
        peers_in: ln?.peers_in || [],
        routes: routeMap.get(a.name) || [],
      };
    });

    const allTotal = enrichedAgents.reduce((acc, a) => acc + (a.total || 0), 0);
    const allIn = enrichedAgents.reduce((acc, a) => acc + (a.inbound || 0), 0);
    const allOut = enrichedAgents.reduce((acc, a) => acc + (a.outbound || 0), 0);

    dataRef = {
      agents: enrichedAgents,
      nodeMap: new Map([
        ...enrichedAgents.map((a) => [a.name, a]),
        ['relay', { name: 'relay', display_name: '中继核心' }],
        ['console', { name: 'console', display_name: '控制台' }],
      ]),
      edges: (lineage.edges || []).map((e) => ({
        ...e,
        key: `${e.from}->${e.to}`,
        fromLabel: displayNodeName(e.from, agentNameMap),
        toLabel: displayNodeName(e.to, agentNameMap),
      })),
      kpis: {
        ...(overview.kpis || { messages: 0, inbound: 0, outbound: 0, online: 0, edges: 0 }),
        total_messages: overview.kpis?.total_messages ?? allTotal,
        total_inbound: overview.kpis?.total_inbound ?? allIn,
        total_outbound: overview.kpis?.total_outbound ?? allOut,
      },
      events: events.events || [],
    };

    const statEl = root.querySelector('#officeStat');
    if (statEl) {
      statEl.textContent =
        `${dataRef.agents.length} 节点 · 窗口 ${num(dataRef.kpis.messages)} 条 / 累计 ${num(dataRef.kpis.total_messages)} 条 · ${dataRef.edges.length} 条去向`;
    }

    renderBottomHud(root);

    if (state.selected) {
      await loadSelectedMessages(state.selected);
    }

    rebuildSceneNodes(ovl, side, host, root);
    renderSide(side, ovl, dataRef);
    renderTicker(root.querySelector('#ticker'), dataRef.events);
  } catch (err) {
    ovl.innerHTML = `<div class="empty-state"><b>3D 节点拓扑加载失败</b><span>${esc(err.message)}</span></div>`;
  }
}

function renderBottomHud(root) {
  const hudBl = root.querySelector('#officeHudBl');
  if (!hudBl || !dataRef) return;
  const k = dataRef.kpis;
  const activeCnt = dataRef.agents.filter((a) => AWAKE.includes(a.status)).length;
  hudBl.innerHTML = `
    <div class="hbl-item"><span>拓扑节点</span><b>${num(dataRef.agents.length)} <small>(${activeCnt} 活跃)</small></b></div>
    <div class="hbl-item"><span>${esc(state.win.toUpperCase())} 窗口量</span><b style="color:var(--blue)">${num(k.messages)} 条</b></div>
    <div class="hbl-item"><span>累计总量</span><b>${num(k.total_messages)} 条</b></div>
    <div class="hbl-item"><span>收 / 发</span><b><em style="color:#45e6f5;font-style:normal">↓${num(k.inbound)}</em> / <em style="color:#35e08a;font-style:normal">↑${num(k.outbound)}</em></b></div>
    <div class="hbl-item"><span>去向链路</span><b style="color:#ffc21a">${num(dataRef.edges.length)} 条</b></div>`;
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

function buildFlowSummaryForAgent(a, nodeMap) {
  const parts = [];
  const outs = (a.peers_out || []).filter((p) => p.to !== a.name);
  const ins = (a.peers_in || []).filter((p) => p.from !== a.name);

  outs.slice(0, 2).forEach((p) => {
    parts.push(`<span class="fl-out">→ ${esc(displayNodeName(p.to, nodeMap))} (${p.count}条)</span>`);
  });
  if (parts.length < 2) {
    ins.slice(0, 2 - parts.length).forEach((p) => {
      parts.push(`<span class="fl-in">← ${esc(displayNodeName(p.from, nodeMap))} (${p.count}条)</span>`);
    });
  }
  if (!parts.length && (a.routes || []).length) {
    const r = a.routes[0];
    parts.push(`<span class="fl-rt">⇄ ${esc(platformName(r.platform))}:${esc((r.conversation_id || r.account_id || r.wx_account_id || '').slice(0, 10))}</span>`);
  }
  if (!parts.length) {
    if ((a.total || 0) > 0) {
      parts.push(`<span class="fl-idle">⇄ 中继核心 (${a.total}条)</span>`);
    } else {
      parts.push('<span class="fl-idle">暂无活跃去向</span>');
    }
  }
  return parts.join(' ');
}

function rebuildSceneNodes(ovl, side, host, root) {
  if (!dataRef) return;
  const agents = getFilteredAgents(dataRef.agents);
  sceneEdges = (dataRef.edges || []).map((e) => ({ ...e, domEl: null }));

  if (!agents.length) {
    sceneSeats = [];
    coreDomEl = null;
    ovl.innerHTML = `<div class="empty-state"><b>当前筛选下暂无节点</b><span>可切换顶部筛选或发送消息激活信箱</span></div>`;
    return;
  }

  let innerList = agents.filter((a) => AWAKE.includes(a.status));
  let outerList = agents.filter((a) => !AWAKE.includes(a.status));
  if (agents.length >= 5 && (innerList.length === 0 || innerList.length === agents.length)) {
    const sorted = [...agents].sort((a, b) => (b.total - a.total) || ((b.last_ts || 0) - (a.last_ts || 0)));
    const splitIdx = Math.max(3, Math.min(6, Math.ceil(sorted.length * 0.42)));
    innerList = sorted.slice(0, splitIdx);
    const innerSet = new Set(innerList.map((a) => a.name));
    outerList = agents.filter((a) => !innerSet.has(a.name));
  }

  const R_INNER = 195;
  const R_OUTER = 330;
  const seats = [];

  if (agents.length >= 5 && outerList.length > 0 && innerList.length > 0) {
    innerList.forEach((item, i) => {
      const ang = (-Math.PI / 2) + (Math.PI * 2 * i) / innerList.length;
      seats.push({ item, wx: Math.cos(ang) * R_INNER, wz: Math.sin(ang) * R_INNER, ring: 'inner', ang });
    });
    outerList.forEach((item, i) => {
      const offset = Math.PI / Math.max(outerList.length, 1);
      const ang = (-Math.PI / 2) + offset + (Math.PI * 2 * i) / outerList.length;
      seats.push({ item, wx: Math.cos(ang) * R_OUTER, wz: Math.sin(ang) * R_OUTER, ring: 'outer', ang });
    });
  } else {
    const R = agents.length <= 4 ? 210 : 265;
    agents.forEach((item, i) => {
      const ang = (-Math.PI / 2) + (Math.PI * 2 * i) / agents.length;
      seats.push({ item, wx: Math.cos(ang) * R, wz: Math.sin(ang) * R, ring: 'single', ang });
    });
  }

  const k = dataRef.kpis;

  // 1. 中央中继核精简胶囊铭牌（不遮挡视线）
  const coreHtml = `
    <div class="core3d-tag" id="core3dTag" title="点击查看全量流向矩阵">
      <div class="c3d-top">中继核心</div>
      <div class="c3d-num">${num(k.messages)} <small>条</small></div>
      <div class="c3d-sub">
        <span class="in">↓${num(k.inbound)}</span>
        <i>/</i>
        <span class="out">↑${num(k.outbound)}</span>
      </div>
    </div>`;

  // 2. 链路流向徽章（默认隐藏，仅在点击/悬停节点或悬停流向时显示！）
  const edgeBadgesHtml = sceneEdges.map((e, idx) => {
    const isCross = e.from !== 'relay' && e.to !== 'relay';
    return `
      <div class="edge3d-tag ${isCross ? 'cross' : 'relay'} ${e.inferred ? 'inferred' : ''}"
           data-edge-idx="${idx}" data-edge-key="${esc(e.key)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}">
        <span class="e3d-path">${esc(e.fromLabel)} → ${esc(e.toLabel)}</span>
        <b class="e3d-cnt">${num(e.count)}条</b>
      </div>`;
  }).join('');

  // 3. 节点标签：默认只显示清爽紧凑的「小胶囊 (头像 + 名称 + 数量)」，点击/选中时才在上方展开详情浮窗 (.ac3d-pop)！
  const seatsHtml = seats.map((s) => {
    const a = s.item;
    const st = STATUS_META[a.status] || STATUS_META.silent;
    const av = a.avatar || defaultAvatar(a.name);
    const label = a.display_name || a.name;
    const badge = museBadgeText(a.name);
    const pal = paletteFor(a.name);
    const flowSummaryHtml = buildFlowSummaryForAgent(a, dataRef.nodeMap);

    return `
      <div class="ac3d ${state.selected === a.name ? 'selected' : ''}" data-name="${esc(a.name)}" style="--c:${st.color}">
        <!-- 点击节点后才展开的顶部浮窗详情 -->
        <div class="ac3d-pop">
          <div class="apop-hd">
            <b>${esc(label)}</b>
            <span class="chip" style="color:${st.color};border-color:${st.color};padding:0 5px;font-size:9.5px">${st.label}</span>
          </div>
          <div class="apop-nums">
            <span>共 <b>${num(a.total || 0)}</b> 条</span>
            <span class="in">↓收 ${num(a.inbound || 0)}</span>
            <span class="out">↑发 ${num(a.outbound || 0)}</span>
          </div>
          <div class="apop-flow">${flowSummaryHtml}</div>
          ${a.last_preview ? `<div class="apop-msg">${esc(a.last_preview.slice(0, 42))}</div>` : ''}
          <div class="apop-btns">
            <button type="button" class="btn ghost sm" data-pop-act="desk" data-agent="${esc(a.name)}">🏢 3D工位</button>
            <button type="button" class="btn sm" data-pop-act="chat" data-agent="${esc(a.name)}">💬 通信台</button>
          </div>
        </div>

        <!-- 默认常驻的轻量级节点胶囊 -->
        <div class="ac3d-pill">
          <div class="ac3d-av">
            ${av
              ? `<img src="${esc(av)}" alt="${esc(label)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
                 <span class="ac3d-fb" style="display:none;background:${pal.bg};color:${pal.fg}">${esc(initial(label))}</span>`
              : `<span class="ac3d-fb" style="background:${pal.bg};color:${pal.fg}">${esc(initial(label))}</span>`}
            ${badge ? `<em class="ac3d-badge">${esc(badge)}</em>` : ''}
            <i class="ac3d-dot" style="background:${st.color}"></i>
          </div>
          <span class="ac3d-nm">${esc(label)}</span>
          <span class="ac3d-cnt ${(a.total || 0) > 0 ? 'has' : ''}">${num(a.total || 0)}条</span>
        </div>
      </div>`;
  }).join('');

  ovl.innerHTML = coreHtml + edgeBadgesHtml + seatsHtml;

  coreDomEl = ovl.querySelector('#core3dTag');
  if (coreDomEl) {
    coreDomEl.onclick = (e) => {
      e.stopPropagation();
      state.selected = null;
      state.sideTab = 'flows';
      syncHudSelection(ovl);
      renderSide(side, ovl, dataRef);
    };
  }

  const edgeNodes = ovl.querySelectorAll('.edge3d-tag');
  sceneEdges.forEach((e, i) => {
    e.domEl = edgeNodes[i] || null;
  });

  ovl.querySelectorAll('[data-pop-act]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const ag = btn.dataset.agent;
      if (btn.dataset.popAct === 'desk') ctxRef?.go('workstations', { agent: ag });
      else ctxRef?.go('chat', { agent: ag });
    };
  });

  const domNodes = ovl.querySelectorAll('.ac3d');
  seats.forEach((s, i) => {
    s.domEl = domNodes[i];
    const name = s.item.name;
    s.domEl.addEventListener('mouseenter', () => {
      state.hovered = name;
      syncHudSelection(ovl);
    });
    s.domEl.addEventListener('mouseleave', () => {
      if (state.hovered === name) state.hovered = null;
      syncHudSelection(ovl);
    });
    s.domEl.addEventListener('click', async (e) => {
      if (e.target.closest('[data-pop-act]')) return;
      e.stopPropagation();
      state.selected = state.selected === name ? null : name;
      syncHudSelection(ovl);
      renderSide(side, ovl, dataRef);
      if (state.selected) {
        await loadSelectedMessages(name);
        renderSide(side, ovl, dataRef);
      }
    });
    s.domEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      ctxRef?.go('chat', { agent: name });
    });
  });

  sceneSeats = seats;
  seedAmbientPackets();
  syncHudSelection(ovl);
}

function syncHudSelection(ovl) {
  const focusName = state.selected || state.hovered;
  const focusEdge = state.hoveredEdge;

  let edgeEndpoints = null;
  if (focusEdge) {
    edgeEndpoints = new Set(focusEdge.split('->'));
  } else if (focusName && dataRef) {
    const peers = new Set([focusName]);
    (dataRef.edges || []).forEach((e) => {
      if (e.from === focusName) peers.add(e.to);
      if (e.to === focusName) peers.add(e.from);
    });
    edgeEndpoints = peers;
  }

  ovl.querySelectorAll('.ac3d').forEach((el) => {
    const nm = el.dataset.name;
    el.classList.toggle('selected', nm === state.selected);
    const shouldDim = edgeEndpoints ? !edgeEndpoints.has(nm) : Boolean(focusName && nm !== focusName);
    el.classList.toggle('dim', shouldDim);
  });

  // 流向数量标签仅在选中/悬停相关节点或悬停该流向边时展示，平时保持画面干净！
  ovl.querySelectorAll('.edge3d-tag').forEach((el) => {
    const ek = el.dataset.edgeKey;
    const from = el.dataset.from;
    const to = el.dataset.to;
    const isMatched = Boolean((focusEdge && ek === focusEdge) || (focusName && (from === focusName || to === focusName)));
    el.classList.toggle('on', isMatched);
    el.style.opacity = isMatched ? '1' : '0';
    el.style.pointerEvents = isMatched ? 'auto' : 'none';
  });
}

function get3DAnchor(name, seatMap) {
  if (name === 'relay' || name === 'console') {
    return { wx: 0, wz: 0, isCore: true };
  }
  return seatMap.get(name) || null;
}

function seedAmbientPackets() {
  scenePackets = [];
  const seatMap = new Map(sceneSeats.map((s) => [s.item.name, s]));

  sceneEdges.forEach((e) => {
    const a = get3DAnchor(e.from, seatMap);
    const b = get3DAnchor(e.to, seatMap);
    if (!a || !b) return;
    const isCross = !a.isCore && !b.isCore;
    const color = isCross ? (e.inferred ? '#ffc21a' : '#ff3f8e') : (a.isCore ? '#35e08a' : '#45e6f5');
    const copies = Math.min(3, Math.max(1, Math.ceil((e.count || 1) / 4)));
    for (let c = 0; c < copies; c++) {
      scenePackets.push({
        fromPos: { x: a.wx, z: a.wz },
        toPos: { x: b.wx, z: b.wz },
        t: (c / copies + Math.random() * 0.2) % 1,
        speed: 0.0055 + Math.random() * 0.0035,
        color,
        size: isCross ? 3.8 : 3.2,
        arcH: isCross ? 76 : 48,
        loop: true,
      });
    }
  });

  sceneSeats.forEach((s) => {
    const hasEdge = sceneEdges.some((e) => e.from === s.item.name || e.to === s.item.name);
    if (!hasEdge && ((s.item.total || 0) > 0 || AWAKE.includes(s.item.status))) {
      const isIn = (s.item.inbound || 0) >= (s.item.outbound || 0);
      scenePackets.push({
        fromPos: isIn ? { x: s.wx, z: s.wz } : { x: 0, z: 0 },
        toPos: isIn ? { x: 0, z: 0 } : { x: s.wx, z: s.wz },
        t: Math.random(),
        speed: 0.0045 + Math.random() * 0.003,
        color: isIn ? '#45e6f5' : '#35e08a',
        size: 3.0,
        arcH: 46,
        loop: true,
      });
    }
  });
}

function start3DLoop(host, canvas, ovl) {
  let raf = 0;
  let tick = 0;
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
      y: H * 0.54 - y2 * scale,
      scale,
      depth: z2,
    };
  };

  const frame = () => {
    raf = requestAnimationFrame(frame);
    tick += 0.016;

    if (state.cam.autoRotate && !state.cam.dragging && !state.hovered && !state.selected && !state.hoveredEdge) {
      state.cam.yaw += 0.0018;
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
    const gridStroke = isLight ? 'rgba(15,23,42,0.08)' : (isAmber ? 'rgba(255,196,107,0.11)' : 'rgba(69,230,245,0.11)');

    const rings = [95, 195, 260, 330, 390];
    rings.forEach((r, idx) => {
      ctx.beginPath();
      const segs = 72;
      for (let i = 0; i <= segs; i++) {
        const a = (Math.PI * 2 * i) / segs;
        const p = project(Math.cos(a) * r, 0, Math.sin(a) * r, W, H);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = (idx === 1 || idx === 3)
        ? (isLight ? 'rgba(37,99,235,0.26)' : (isAmber ? 'rgba(255,196,107,0.28)' : 'rgba(69,230,245,0.28)'))
        : gridStroke;
      ctx.lineWidth = (idx === 1 || idx === 3) ? 1.5 : 1;
      if (idx === 1 || idx === 3) ctx.setLineDash([6, 6]);
      else ctx.setLineDash([]);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    for (let i = 0; i < 12; i++) {
      const a = (Math.PI * 2 * i) / 12;
      const p1 = project(Math.cos(a) * 55, 0, Math.sin(a) * 55, W, H);
      const p2 = project(Math.cos(a) * 390, 0, Math.sin(a) * 390, W, H);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = gridStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const seatMap = new Map(sceneSeats.map((s) => [s.item.name, s]));
    const focusName = state.selected || state.hovered;
    const focusEdge = state.hoveredEdge;

    // 中心辐射底座弧线
    sceneSeats.forEach((s) => {
      const isFocused = !focusName || focusName === s.item.name;
      const st = STATUS_META[s.item.status] || STATUS_META.silent;
      const steps = 20;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const wx = s.wx * u;
        const wz = s.wz * u;
        const wy = Math.sin(u * Math.PI) * 26;
        const p = project(wx, wy, wz, W, H);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = st.color;
      ctx.globalAlpha = isFocused && !focusEdge ? (AWAKE.includes(s.item.status) ? 0.32 : 0.14) : 0.05;
      ctx.lineWidth = focusName === s.item.name ? 2.0 : 1.1;
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // 真实流向 3D 抛物线
    sceneEdges.forEach((e) => {
      const a = get3DAnchor(e.from, seatMap);
      const b = get3DAnchor(e.to, seatMap);
      if (!a || !b) {
        if (e.domEl) e.domEl.style.opacity = '0';
        return;
      }
      const isCross = !a.isCore && !b.isCore;
      const arcPeak = isCross ? 76 : 48;
      const isEdgeMatch = focusEdge ? e.key === focusEdge : (!focusName || e.from === focusName || e.to === focusName);
      const steps = 24;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const wx = a.wx + (b.wx - a.wx) * u;
        const wz = a.wz + (b.wz - a.wz) * u;
        const wy = Math.sin(u * Math.PI) * arcPeak;
        const p = project(wx, wy, wz, W, H);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      const strokeColor = isCross
        ? (e.inferred ? '#ffc21a' : '#ff3f8e')
        : (a.isCore ? '#35e08a' : '#45e6f5');
      ctx.strokeStyle = strokeColor;
      ctx.globalAlpha = isEdgeMatch ? (isCross ? 0.88 : 0.58) : 0.06;
      ctx.lineWidth = (focusEdge === e.key ? 3.0 : 1.6) + Math.min(e.count || 1, 8) * 0.25;
      if (e.inferred) ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (e.domEl) {
        const midWx = (a.wx + b.wx) * 0.5;
        const midWz = (a.wz + b.wz) * 0.5;
        const pMid = project(midWx, arcPeak + 8, midWz, W, H);
        e.domEl.style.transform = `translate3d(${pMid.x.toFixed(1)}px, ${pMid.y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${Math.max(0.76, Math.min(1.08, pMid.scale)).toFixed(3)})`;
        e.domEl.style.zIndex = String(Math.round(1050 - pMid.depth));
      }
    });
    ctx.globalAlpha = 1;

    // 3D 飞行粒子
    for (let i = scenePackets.length - 1; i >= 0; i--) {
      const pk = scenePackets[i];
      pk.t += pk.speed;
      if (pk.t > 1) {
        if (pk.loop) pk.t = 0;
        else { scenePackets.splice(i, 1); continue; }
      }
      if (pk.t < 0) continue;
      const u = pk.t;
      const wx = pk.fromPos.x + (pk.toPos.x - pk.fromPos.x) * u;
      const wz = pk.fromPos.z + (pk.toPos.z - pk.fromPos.z) * u;
      const wy = Math.sin(u * Math.PI) * (pk.arcH || 52);
      const p = project(wx, wy, wz, W, H);

      ctx.beginPath();
      ctx.arc(p.x, p.y, pk.size * p.scale, 0, Math.PI * 2);
      ctx.fillStyle = pk.color;
      ctx.shadowColor = pk.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    drawRelayCore3D(ctx, project, W, H, tick, primaryHex, isLight);
    if (coreDomEl) {
      const pCore = project(0, 72, 0, W, H);
      coreDomEl.style.transform = `translate3d(${pCore.x.toFixed(1)}px, ${pCore.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${Math.max(0.82, Math.min(1.08, pCore.scale)).toFixed(3)})`;
      coreDomEl.style.zIndex = String(Math.round(1010 - pCore.depth));
    }

    const sortedSeats = [...sceneSeats].map((s) => {
      const pFloor = project(s.wx, 0, s.wz, W, H);
      const pTop = project(s.wx, 32, s.wz, W, H);
      return { s, pFloor, pTop };
    }).sort((a, b) => b.pFloor.depth - a.pFloor.depth);

    sortedSeats.forEach(({ s, pFloor, pTop }) => {
      const st = STATUS_META[s.item.status] || STATUS_META.silent;
      const isSelected = state.selected === s.item.name;
      const isHovered = state.hovered === s.item.name;
      drawTopologyNode3D(ctx, project, s, W, H, tick, st, isSelected || isHovered, isLight);

      if (s.domEl) {
        const zBoost = isSelected ? 2000 : (isHovered ? 1800 : Math.round(1000 - pFloor.depth));
        s.domEl.style.transform = `translate3d(${pTop.x.toFixed(1)}px, ${pTop.y.toFixed(1)}px, 0) translate(-50%, -100%) scale(${Math.max(0.82, Math.min(1.08, pTop.scale)).toFixed(3)})`;
        s.domEl.style.zIndex = String(zBoost);
      }
    });

    ctx.restore();
  };

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

function drawRelayCore3D(ctx, project, W, H, tick, primaryHex, isLight) {
  const c0 = project(0, 0, 0, W, H);
  const cTop = project(0, 52 + Math.sin(tick * 2.2) * 4, 0, W, H);

  const grad = ctx.createLinearGradient(c0.x, c0.y, cTop.x, cTop.y - 45);
  grad.addColorStop(0, isLight ? 'rgba(37,99,235,0.38)' : 'rgba(69,230,245,0.45)');
  grad.addColorStop(1, 'rgba(69,230,245,0)');
  ctx.beginPath();
  ctx.moveTo(c0.x - 18 * c0.scale, c0.y);
  ctx.lineTo(cTop.x - 28 * cTop.scale, cTop.y - 36);
  ctx.lineTo(cTop.x + 28 * cTop.scale, cTop.y - 36);
  ctx.lineTo(c0.x + 18 * c0.scale, c0.y);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  for (const h of [0, 14]) {
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const a = (Math.PI * 2 * i) / 8 + tick * 0.4;
      const p = project(Math.cos(a) * 44, h, Math.sin(a) * 44, W, H);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = h === 14 ? 2 : 1.2;
    ctx.fillStyle = isLight ? 'rgba(37,99,235,0.12)' : 'rgba(14,28,54,0.78)';
    ctx.fill();
    ctx.stroke();
  }

  for (const [ry, r, spd] of [[32, 34, 1.4], [46, 24, -1.9]]) {
    ctx.beginPath();
    for (let i = 0; i <= 36; i++) {
      const a = (Math.PI * 2 * i) / 36 + tick * spd;
      const p = project(Math.cos(a) * r, ry + Math.sin(a * 2) * 4, Math.sin(a) * r, W, H);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = primaryHex;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cTop.x, cTop.y, 11 * cTop.scale, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = primaryHex;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawTopologyNode3D(ctx, project, seat, W, H, tick, st, activeHighlight, isLight) {
  const { wx, wz } = seat;
  const R = activeHighlight ? 26 : 20;

  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (Math.PI * 2 * i) / 24;
    const p = project(wx + Math.cos(a) * R, 0, wz + Math.sin(a) * R, W, H);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.fillStyle = activeHighlight ? st.glow : (isLight ? 'rgba(255,255,255,0.85)' : 'rgba(13,19,33,0.85)');
  ctx.strokeStyle = st.color;
  ctx.lineWidth = activeHighlight ? 2.4 : 1.5;
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  for (let i = 0; i <= 6; i++) {
    const a = (Math.PI * 2 * i) / 6 + Math.PI / 6;
    const p = project(wx + Math.cos(a) * 14, 9, wz + Math.sin(a) * 14, W, H);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.fillStyle = isLight ? '#e2e8f0' : '#162032';
  ctx.strokeStyle = st.color;
  ctx.lineWidth = 1.2;
  ctx.fill();
  ctx.stroke();

  const bob = Math.sin(tick * 2.5 + seat.ang) * 2.8;
  const pBeacon = project(wx, 20 + bob, wz, W, H);
  ctx.beginPath();
  ctx.arc(pBeacon.x, pBeacon.y, 4.2 * pBeacon.scale, 0, Math.PI * 2);
  ctx.fillStyle = st.color;
  ctx.shadowColor = st.color;
  ctx.shadowBlur = activeHighlight ? 14 : 6;
  ctx.fill();
  ctx.shadowBlur = 0;
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

function renderSide(side, ovl, data) {
  if (!side) return;
  const agents = getFilteredAgents(data.agents);

  if (state.selected) {
    const a = data.agents.find((x) => x.name === state.selected);
    if (a) {
      const st = STATUS_META[a.status] || STATUS_META.silent;
      const peersOut = a.peers_out || [];
      const peersIn = a.peers_in || [];
      const routes = a.routes || [];

      side.innerHTML = `
        <div class="office-side-head">
          <button class="btn ghost sm" id="backToListBtn">← 返回列表</button>
          <span class="spacer"></span>
          <button class="btn ghost sm" id="go3dDeskBtn">🏢 3D 工位</button>
          <button class="btn sm" id="goChatBtn">${icon('chat', 13)} 进通信台</button>
        </div>
        <div class="office-inspector">
          <div class="insp-card" style="border-left:3px solid ${st.color}">
            <div class="insp-top">
              <div class="insp-title">
                <h3>${esc(a.display_name || a.name)}</h3>
                <div class="insp-sub">信箱标识: <code>${esc(a.name)}</code></div>
              </div>
              <span class="chip" style="color:${st.color};border:1px solid ${st.color};background:transparent">${st.label}</span>
            </div>
            <div class="insp-kpis">
              <div class="insp-kpi"><span>↓ 累计收进</span><b style="color:#45e6f5">${num(a.inbound)} 条</b></div>
              <div class="insp-kpi"><span>↑ 累计发出</span><b style="color:#35e08a">${num(a.outbound)} 条</b></div>
              <div class="insp-kpi"><span>Σ 报文总计</span><b>${num(a.total)} 条</b></div>
              <div class="insp-kpi"><span>最近活跃</span><b>${rel(a.last_ts)}</b></div>
            </div>
            ${a.role || a.note ? `<div class="insp-meta">${esc(a.role || '')}${a.role && a.note ? ' · ' : ''}${esc(a.note || '')}</div>` : ''}
          </div>

          <div class="insp-section">
            <div class="insp-sec-title">出站数据去向 (${peersOut.length})</div>
            ${peersOut.length ? peersOut.map((p) => `
              <div class="insp-edge-item" data-peer="${esc(p.to)}">
                <span><b>${esc(a.display_name || a.name)}</b> <span class="muted">──▶</span> <b style="color:var(--green)">${esc(displayNodeName(p.to, data.nodeMap))}</b></span>
                <span class="chip ${p.inferred ? 'warn' : 'out'}">${num(p.count)} 条 · ${p.inferred ? '推断' : '精确'}</span>
              </div>`).join('') : '<div class="muted" style="font-size:11.5px">当前时间窗内暂无出站去向记录</div>'}
          </div>

          <div class="insp-section">
            <div class="insp-sec-title">入站数据来源 (${peersIn.length})</div>
            ${peersIn.length ? peersIn.map((p) => `
              <div class="insp-edge-item" data-peer="${esc(p.from)}">
                <span><b style="color:var(--blue)">${esc(displayNodeName(p.from, data.nodeMap))}</b> <span class="muted">──▶</span> <b>${esc(a.display_name || a.name)}</b></span>
                <span class="chip ${p.inferred ? 'warn' : 'in'}">${num(p.count)} 条 · ${p.inferred ? '推断' : '精确'}</span>
              </div>`).join('') : '<div class="muted" style="font-size:11.5px">当前时间窗内暂无入站来源记录</div>'}
          </div>

          <div class="insp-section">
            <div class="insp-sec-title">会话绑定路由 (${routes.length})</div>
            ${routes.length ? routes.map((r) => `
              <div class="insp-route-item">
                <span class="chip">${esc(platformName(r.platform))}</span>
                <code>${esc(r.account_id || r.wx_account_id)}</code>
                <span class="muted">→</span>
                <code>${esc(r.conversation_id)}</code>
                <span class="chip out" style="margin-left:auto;font-size:10px">${r.conversation_type === 'group' ? '群聊' : '私聊'}</span>
              </div>`).join('') : '<div class="muted" style="font-size:11.5px">未绑定固定会话路由（可在「注册与路由」配置）</div>'}
          </div>

          <div class="insp-section" style="flex:1;min-height:0;display:flex;flex-direction:column">
            <div class="insp-sec-title">最近报文记录</div>
            <div class="insp-msgs">
              ${state.loadingMsgs ? '<div class="muted" style="font-size:12px">加载中…</div>' : (
                state.selectedMsgs.length ? state.selectedMsgs.map((m) => `
                  <div class="insp-msg ${m.direction === 'inbound' ? 'in' : 'out'}">
                    <div class="insp-msg-hd">
                      <span class="chip ${m.direction === 'inbound' ? 'in' : 'out'}">${m.direction === 'inbound' ? '↓ 收进' : '↑ 发出'}</span>
                      <span class="muted">${fmtTime(m.timestamp)}</span>
                    </div>
                    <div class="insp-msg-bd">${esc((m.content || `[${m.type}]`).slice(0, 120))}</div>
                  </div>`).join('') : '<div class="muted" style="font-size:12px">暂无报文记录</div>'
              )}
            </div>
          </div>

          <form class="insp-quick-send" id="quickSendForm">
            <input type="text" id="quickSendInput" placeholder="向 ${esc(a.display_name || a.name)} 发送测试指令…" required>
            <button type="submit" class="btn sm">${icon('send', 13)} 派单</button>
          </form>
        </div>`;

      side.querySelector('#backToListBtn').onclick = () => {
        state.selected = null;
        syncHudSelection(ovl);
        renderSide(side, ovl, data);
      };
      side.querySelector('#go3dDeskBtn').onclick = () => ctxRef?.go('workstations', { agent: a.name });
      side.querySelector('#goChatBtn').onclick = () => ctxRef?.go('chat', { agent: a.name });

      side.querySelectorAll('.insp-edge-item[data-peer]').forEach((item) => {
        const peer = item.dataset.peer;
        if (peer && peer !== 'relay' && peer !== 'console' && data.agents.some((x) => x.name === peer)) {
          item.style.cursor = 'pointer';
          item.title = `点击切换到 ${peer}`;
          item.onclick = async () => {
            state.selected = peer;
            syncHudSelection(ovl);
            renderSide(side, ovl, data);
            await loadSelectedMessages(peer);
            renderSide(side, ovl, data);
          };
        }
      });

      side.querySelector('#quickSendForm').onsubmit = async (ev) => {
        ev.preventDefault();
        const inp = side.querySelector('#quickSendInput');
        const text = inp.value.trim();
        if (!text) return;
        inp.disabled = true;
        try {
          await api.send({ name: a.name, direction: 'inbound', type: 'text', content: text });
          spawnBurstPacket(a.name, 'inbound');
          inp.value = '';
          toast(`指令已派发至 ${a.display_name || a.name}`);
          await loadSelectedMessages(a.name);
          renderSide(side, ovl, data);
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

  const allEdges = data.edges || [];

  side.innerHTML = `
    <div class="panel-head" style="gap:6px">
      <div class="seg" id="sideModeSeg" style="width:100%;display:grid;grid-template-columns:1fr 1fr">
        <button data-tab="units" class="${state.sideTab === 'units' ? 'on' : ''}">节点数量与去向 (${sorted.length})</button>
        <button data-tab="flows" class="${state.sideTab === 'flows' ? 'on' : ''}">全量流向矩阵 (${allEdges.length})</button>
      </div>
    </div>
    ${state.sideTab === 'flows' ? `
      <div class="office-seat-list" id="officeFlowList">
        ${allEdges.length ? allEdges.map((e) => {
          const isCross = e.from !== 'relay' && e.to !== 'relay';
          return `
            <div class="office-flow-card" data-edge="${esc(e.key)}" data-from="${esc(e.from)}" data-to="${esc(e.to)}">
              <div class="ofc-top">
                <span class="ofc-node">${esc(e.fromLabel)}</span>
                <span class="ofc-arrow">──▶</span>
                <span class="ofc-node dst">${esc(e.toLabel)}</span>
                <span class="chip ${isCross ? (e.inferred ? 'warn' : 'out') : 'in'}" style="margin-left:auto">${num(e.count)} 条</span>
              </div>
              <div class="ofc-sub">
                <span>类型: ${isCross ? (e.inferred ? '时序推断配对' : 'request_id 精确配对') : '中继核心直达'}</span>
                <span>最近: ${rel(e.last_ts)}</span>
              </div>
            </div>`;
        }).join('') : '<div class="empty-state"><b>暂无流向记录</b><span>发送或接收报文后自动生成流向矩阵</span></div>'}
      </div>
    ` : `
      <div class="office-seat-list" id="officeSeatList">
        ${sorted.map((a) => {
          const st = STATUS_META[a.status] || STATUS_META.silent;
          const badge = museBadgeText(a.name);
          const routeCount = (a.routes || []).length;
          const flowHtml = buildFlowSummaryForAgent(a, data.nodeMap);
          return `
            <div class="office-seat-row" data-name="${esc(a.name)}">
              <div class="osr-left">
                <span class="osr-dot" style="background:${st.color};box-shadow:0 0 6px ${st.color}"></span>
                <div style="min-width:0;flex:1">
                  <div class="osr-name">
                    ${badge ? `<span class="osr-badge">${esc(badge)}</span>` : ''}
                    <b>${esc(a.display_name || a.name)}</b>
                    ${routeCount ? `<span class="chip in" style="font-size:10px;padding:1px 5px">${routeCount}路由</span>` : ''}
                  </div>
                  <div class="osr-flow">${flowHtml}</div>
                  <div class="osr-preview">${esc(a.last_preview || a.role || '待命 · 等待报文')}</div>
                </div>
              </div>
              <div class="osr-right">
                <div class="osr-total">共 ${num(a.total || 0)} 条</div>
                <div class="osr-nums">
                  <span class="in">↓${num(a.inbound || 0)}</span>
                  <span class="muted">·</span>
                  <span class="out">↑${num(a.outbound || 0)}</span>
                </div>
                <div class="osr-time">${rel(a.last_ts)}</div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `}
  `;

  side.querySelector('#sideModeSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn || btn.dataset.tab === state.sideTab) return;
    state.sideTab = btn.dataset.tab;
    renderSide(side, ovl, data);
  };

  side.querySelectorAll('.office-seat-row').forEach((row) => {
    const name = row.dataset.name;
    row.addEventListener('mouseenter', () => {
      state.hovered = name;
      syncHudSelection(ovl);
    });
    row.addEventListener('mouseleave', () => {
      if (state.hovered === name) state.hovered = null;
      syncHudSelection(ovl);
    });
    row.addEventListener('click', async () => {
      state.selected = name;
      syncHudSelection(ovl);
      renderSide(side, ovl, data);
      await loadSelectedMessages(name);
      renderSide(side, ovl, data);
    });
    row.addEventListener('dblclick', () => ctxRef?.go('chat', { agent: name }));
  });

  side.querySelectorAll('.office-flow-card').forEach((card) => {
    const edgeKey = card.dataset.edge;
    const from = card.dataset.from;
    const to = card.dataset.to;
    card.addEventListener('mouseenter', () => {
      state.hoveredEdge = edgeKey;
      syncHudSelection(ovl);
    });
    card.addEventListener('mouseleave', () => {
      if (state.hoveredEdge === edgeKey) state.hoveredEdge = null;
      syncHudSelection(ovl);
    });
    card.addEventListener('click', async () => {
      const target = (to !== 'relay' && to !== 'console') ? to : ((from !== 'relay' && from !== 'console') ? from : null);
      if (target) {
        state.selected = target;
        syncHudSelection(ovl);
        renderSide(side, ovl, data);
        await loadSelectedMessages(target);
        renderSide(side, ovl, data);
      }
    });
  });
}
