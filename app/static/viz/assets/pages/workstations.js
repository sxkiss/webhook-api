import { api, store } from '../api.js';
import {
  esc, num, rel, defaultAvatar, initial, fmtTime, debounce, icon, toast,
  paletteFor, museBadgeText, MUSE_POSTURES, resolveMuseLiveAction, openMuseActionModal,
} from '../ui.js';
import {
  ZONE_META, createProjector, buildOfficePlan, findCorridorPath,
  buildArchitectureScene, buildDeskCmd, buildAgentCharacterCmd,
} from './workstation_3d.js?v=20261111-v8';

let ctxRef = null;
let dataRef = null;

// 记录每个工位实时触发或手动演练的动作状态
const liveBursts = new Map();

const state = {
  win: '24h',
  filter: 'all', // 'all' | 'active' | 'muse'
  zoneCam: 'all', // 'all' | 'center' | 'north' | 'west' | 'east' | 'south'
  sideTab: 'live', // 'live' | 'defs'
  selected: null,
  hovered: null,
  selectedMsgs: [],
  loadingMsgs: false,
  cam: {
    yaw: 0.24,
    pitch: 0.48,
    zoom: 1.02,
    tx: 0,
    tz: 5,
    autoOrbit: false,
    dragging: false,
    lastX: 0,
    lastY: 0,
  },
  camGoal: null,
};

const STATUS_META = {
  online: { color: '#35e08a', glow: 'rgba(53,224,138,0.45)', label: '在线' },
  active: { color: '#45e6f5', glow: 'rgba(69,230,245,0.45)', label: '活跃' },
  idle:   { color: '#ffc21a', glow: 'rgba(255,194,26,0.40)', label: '空闲' },
  silent: { color: '#7d89a8', glow: 'rgba(125,137,168,0.25)', label: '待命' },
  empty:  { color: '#5c6680', glow: 'rgba(92,102,128,0.20)', label: '空置' },
};

const AWAKE = ['online', 'active', 'idle'];

let officePlan = null;
let sceneDesks = [];
const actorMap = new Map(); // name -> animated 3D agent actor state
const walkArcs = []; // 实时走动/递送连线特效

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
  state.camGoal = { ...ZONE_META.all.cam };

  root.innerHTML = `
    <div class="pg-office">
      <div class="panel-head office-head">
        <div class="office-title-group">
          <span class="dp-badge">3D OFFICE SANDBOX</span>
          <h2>3D 五方位协同办公沙盘</h2>
          <span class="chip" id="wsStat">加载工位中…</span>
        </div>
        <div class="seg" id="wsCamSeg" title="切换五方位镜头 · 拖拽可 360° 自由旋转">
          ${Object.values(ZONE_META).map((z) => `
            <button data-zone="${z.id}" class="${state.zoneCam === z.id ? 'on' : ''}">${esc(z.label)}</button>`).join('')}
          <button data-zone="orbit" class="${state.cam.autoOrbit ? 'on' : ''}">360°环视</button>
        </div>
        <span class="spacer"></span>
        <div class="seg" id="wsChoreoSeg" title="触发全员走廊走动与跨区域协同行为">
          <button data-act="deliver">🔄 走动送件</button>
          <button data-act="meet">🤝 会议室对齐</button>
          <button data-act="lounge">☕ 茶水间小憩</button>
        </div>
        <div class="seg" id="wsFilterSeg" title="筛选工位">
          <button data-filter="all" class="${state.filter === 'all' ? 'on' : ''}">全部</button>
          <button data-filter="active" class="${state.filter === 'active' ? 'on' : ''}">活跃</button>
          <button data-filter="muse" class="${state.filter === 'muse' ? 'on' : ''}">Muse</button>
        </div>
        <button class="btn ghost sm" id="wsActionDefBtn">⚡ 动作定义</button>
        <button class="btn ghost sm" id="goTopologyBtn">🌐 节点拓扑 →</button>
      </div>

      <div class="office-main">
        <div class="office-body" id="wsBody">
          <canvas class="office-gl" id="wsGl"></canvas>
          <div class="office-ovl" id="wsOvl"></div>

          <div class="office-hud-tl">
            <div class="hud-eyebrow">5-ZONE 3D ARCHITECTURAL FLOOR · 中枢 / 北研发 / 西接入 / 东派发 / 南会议茶水</div>
            <div class="hud-title">MUSE <span>3D 实时工位沙盘</span></div>
            <div class="hud-hint">左键拖拽 360° 无死角旋转 · 滚轮缩放 · 点击工位或走动中的角色展开详情与触发走动</div>
          </div>

          <div class="office-hud-bl" id="wsHudBl"></div>
        </div>
        <aside class="office-side" id="wsSide"></aside>
      </div>

      <div class="office-foot">
        <div class="office-tag"><span class="live-dot"></span>走廊走动与实时事件</div>
        <div class="ticker-wrap"><div class="ticker-track" id="wsTicker"></div></div>
      </div>
    </div>`;

  const host = root.querySelector('#wsBody');
  const canvas = root.querySelector('#wsGl');
  const ovl = root.querySelector('#wsOvl');
  const side = root.querySelector('#wsSide');

  root.querySelector('#goTopologyBtn').onclick = () => ctx.go('office');
  root.querySelector('#wsActionDefBtn').onclick = () => {
    const targetName = state.selected || dataRef?.agents?.[0]?.name;
    const ag = dataRef?.agents?.find((x) => x.name === targetName);
    if (ag) {
      openMuseActionModal(ag, store, api, () => {
        rebuildScene(ovl, side, host, root);
        renderSide(side, ovl, dataRef, root);
      });
    }
  };

  // 五方位相机快捷视角 + 360°环视
  root.querySelector('#wsCamSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-zone]');
    if (!btn) return;
    const z = btn.dataset.zone;
    if (z === 'orbit') {
      state.cam.autoOrbit = !state.cam.autoOrbit;
      btn.classList.toggle('on', state.cam.autoOrbit);
      return;
    }
    state.zoneCam = z;
    state.cam.autoOrbit = false;
    state.camGoal = { ...ZONE_META[z].cam };
    root.querySelectorAll('#wsCamSeg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.zone === z);
    });
  };

  // 全员互动编排：送件走动 / 会议室聚集 / 茶水间小憩
  root.querySelector('#wsChoreoSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-act]');
    if (!btn || !sceneDesks.length) return;
    const act = btn.dataset.act;
    if (act === 'deliver') {
      triggerRandomHandoffWalk();
      toast('已触发跨工位走动送件');
    } else if (act === 'meet') {
      triggerMeetingGather();
      toast('已召集工位成员前往西南会议室对齐');
    } else if (act === 'lounge') {
      triggerCoffeeBreak();
      toast('已安排空闲成员前往东南茶水间小憩');
    }
  };

  root.querySelector('#wsFilterSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-filter]');
    if (!btn || btn.dataset.filter === state.filter) return;
    state.filter = btn.dataset.filter;
    root.querySelectorAll('#wsFilterSeg button').forEach((b) => b.classList.toggle('on', b === btn));
    rebuildScene(ovl, side, host, root);
    renderSide(side, ovl, dataRef, root);
  };

  // 真 360° 拖拽旋转 + 滚轮缩放
  canvas.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.ac3d')) return;
    state.cam.dragging = true;
    state.cam.autoOrbit = false;
    state.camGoal = null;
    state.cam.lastX = e.clientX;
    state.cam.lastY = e.clientY;
    root.querySelector('#wsCamSeg button[data-zone="orbit"]')?.classList.remove('on');
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!state.cam.dragging) return;
    const dx = e.clientX - state.cam.lastX;
    const dy = e.clientY - state.cam.lastY;
    state.cam.lastX = e.clientX;
    state.cam.lastY = e.clientY;
    // 完整 360° 自由旋转，不再锁死角度！
    state.cam.yaw = (state.cam.yaw + dx * 0.0065) % (Math.PI * 2);
    state.cam.pitch = Math.max(0.24, Math.min(1.18, state.cam.pitch + dy * 0.005));
  });
  const endDrag = () => { state.cam.dragging = false; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    state.camGoal = null;
    state.cam.zoom = Math.max(0.55, Math.min(2.0, state.cam.zoom - e.deltaY * 0.0009));
  }, { passive: false });

  host.addEventListener('click', (e) => {
    if (e.target.closest('.ac3d')) return;
    if (state.selected) {
      state.selected = null;
      syncSelection(ovl);
      renderSide(side, ovl, dataRef, root);
    }
  });

  // 实时消息到达：让工位动作 + 偶尔触发走廊走动汇报
  const offMessages = store.on('messages', (items) => {
    if (!items?.length || !dataRef) return;
    let changed = false;
    items.forEach((m) => {
      const ag = dataRef.agents.find((x) => x.name === m.name);
      if (!ag) return;
      changed = true;
      ag.last_ts = m.timestamp || Date.now() / 1000;
      ag.total = (ag.total || 0) + 1;
      if (m.direction === 'inbound') {
        ag.inbound = (ag.inbound || 0) + 1;
        triggerDeskAction(ag.name, 'receiving', false, ovl, side, root, m.content);
      } else {
        ag.outbound = (ag.outbound || 0) + 1;
        triggerDeskAction(ag.name, 'dispatching', false, ovl, side, root, m.content);
        if (Math.random() < 0.45) {
          walkAgentToPeer(ag.name, null, (m.content || '派发任务').slice(0, 14));
        }
      }
      dataRef.events.push(m);
    });
    if (changed) {
      while (dataRef.events.length > 36) dataRef.events.shift();
      renderTicker(root.querySelector('#wsTicker'), dataRef.events);
    }
  });

  const refreshDelay = Math.max(900, Math.min(Number(store.settings?.refresh_ms) || 1600, 12000));
  const reload = debounce(() => load(root, ovl, side, host), refreshDelay);
  const offMsgReload = store.on('messages', reload);

  const stopLoop = startOffice3DLoop(host, canvas, ovl, root);
  await load(root, ovl, side, host);

  // 初次进入后自动演练一位同事走动送件，立刻显现鲜活办公场景
  const initTimer = setTimeout(() => {
    if (sceneDesks.length >= 2) triggerRandomHandoffWalk();
  }, 900);

  // 定期自主生态走动（送件 / 去中枢汇报 / 喝咖啡）
  const roamTimer = setInterval(() => {
    if (!sceneDesks.length || document.hidden) return;
    const r = Math.random();
    if (r < 0.5) triggerRandomHandoffWalk();
    else if (r < 0.8) triggerCoffeeBreak();
    else {
      const candidate = sceneDesks.find((d) => d.zone !== 'center');
      if (candidate) walkAgentToHub(candidate.agent.name);
    }
  }, 6500);

  return () => {
    clearTimeout(initTimer);
    clearInterval(roamTimer);
    offMessages();
    offMsgReload();
    stopLoop();
  };
}

function triggerDeskAction(agentName, postureKey, manual = false, ovl = null, side = null, root = null, snippet = '') {
  const nowSec = Date.now() / 1000;
  liveBursts.set(agentName, { posture: postureKey, until: nowSec + (manual ? 16 : 9), snippet });
  const actor = actorMap.get(agentName);
  if (actor) {
    actor.action = postureKey;
    if (snippet) {
      actor.bubbleText = snippet.slice(0, 16);
      actor.bubbleOut = postureKey === 'dispatching';
      actor.bubbleUntil = nowSec + 5;
    }
  }
  if (postureKey === 'handoff') {
    walkAgentToPeer(agentName, null, snippet ? snippet.slice(0, 14) : '跨工位协同送件');
  }
  if (ovl) refreshDeskPills(ovl, root);
  if (side && dataRef) renderSide(side, ovl, dataRef, root);
}

// 让指定 Muse 从工位站起来，沿走廊走到目标 Muse 工位前面对面送件，然后返回座位
function walkAgentToPeer(fromName, targetName = null, label = '跨工位送件') {
  if (!officePlan || sceneDesks.length < 2) return;
  const srcDesk = sceneDesks.find((d) => d.agent.name === fromName);
  if (!srcDesk) return;
  const peers = sceneDesks.filter((d) => d.agent.name !== fromName);
  const dstDesk = targetName
    ? (peers.find((d) => d.agent.name === targetName) || peers[0])
    : peers[Math.floor(Math.random() * peers.length)];
  if (!dstDesk) return;

  const actor = actorMap.get(fromName);
  if (!actor) return;
  const nowSec = Date.now() / 1000;
  const goPath = findCorridorPath(officePlan, srcDesk.corridor, dstDesk.corridor, dstDesk.visitPos);
  const backPath = findCorridorPath(officePlan, dstDesk.corridor, srcDesk.corridor, [srcDesk.wx, srcDesk.wz]);

  actor.mode = 'walk';
  actor.task = 'deliver';
  actor.carrying = 'folder';
  actor.path = goPath;
  actor.returnPath = backPath;
  actor.homeDesk = srcDesk;
  actor.peerTarget = dstDesk;
  actor.bubbleText = `📦 ${label}`;
  actor.bubbleOut = true;
  actor.bubbleUntil = nowSec + 7;
  actor.stayDuration = 2.6;
  actor.arriveBubble = `交给 ${dstDesk.agent.display_name || dstDesk.agent.name}`;
  walkArcs.push({ from: [srcDesk.wx, srcDesk.wz], to: [dstDesk.wx, dstDesk.wz], until: nowSec + 5.5, color: '#ff3f8e' });
}

function walkAgentToHub(agentName) {
  if (!officePlan) return;
  const srcDesk = sceneDesks.find((d) => d.agent.name === agentName);
  const actor = actorMap.get(agentName);
  if (!srcDesk || !actor) return;

  const nowSec = Date.now() / 1000;
  actor.mode = 'walk';
  actor.task = 'hub';
  actor.carrying = 'folder';
  actor.path = findCorridorPath(officePlan, srcDesk.corridor, 'c_hub', [0, 28]);
  actor.returnPath = findCorridorPath(officePlan, 'c_hub', srcDesk.corridor, [srcDesk.wx, srcDesk.wz]);
  actor.homeDesk = srcDesk;
  actor.bubbleText = '💠 向中枢台汇报';
  actor.bubbleOut = false;
  actor.bubbleUntil = nowSec + 6;
  actor.stayDuration = 2.5;
  actor.arriveBubble = '同步最新状态';
}

function triggerRandomHandoffWalk() {
  const sitting = sceneDesks.filter((d) => actorMap.get(d.agent.name)?.mode === 'sit');
  if (sitting.length < 2) return;
  const pick = sitting[Math.floor(Math.random() * sitting.length)];
  const dst = sitting.find((d) => d !== pick) || sitting[0];
  walkAgentToPeer(pick.agent.name, dst.agent.name, '报文交接');
}

function triggerMeetingGather() {
  if (!officePlan || !sceneDesks.length) return;
  const sitting = sceneDesks.filter((d) => d.zone !== 'center' && actorMap.get(d.agent.name)?.mode === 'sit');
  const team = sitting.slice(0, officePlan.meetSeats.length);
  const nowSec = Date.now() / 1000;
  team.forEach((d, idx) => {
    const actor = actorMap.get(d.agent.name);
    const seat = officePlan.meetSeats[idx];
    if (!actor || !seat) return;
    actor.mode = 'walk';
    actor.task = 'meet';
    actor.carrying = null;
    actor.path = findCorridorPath(officePlan, d.corridor, 'meet_entry', [seat.wx, seat.wz]);
    actor.returnPath = findCorridorPath(officePlan, 'meet_entry', d.corridor, [d.wx, d.wz]);
    actor.homeDesk = d;
    actor.arriveYaw = seat.yaw;
    actor.arriveMode = 'sit';
    actor.stayDuration = 5.5;
    actor.bubbleText = '🤝 去会议室对齐';
    actor.bubbleUntil = nowSec + 5;
    actor.arriveBubble = idx === 0 ? '同步进度！' : '收到，确认方案';
  });
}

function triggerCoffeeBreak() {
  if (!officePlan || !sceneDesks.length) return;
  const sitting = sceneDesks.filter((d) => d.zone !== 'center' && actorMap.get(d.agent.name)?.mode === 'sit');
  if (!sitting.length) return;
  const pick = sitting[Math.floor(Math.random() * sitting.length)];
  const spot = officePlan.loungeSpots[Math.floor(Math.random() * officePlan.loungeSpots.length)];
  const actor = actorMap.get(pick.agent.name);
  if (!actor || !spot) return;

  const nowSec = Date.now() / 1000;
  actor.mode = 'walk';
  actor.task = 'lounge';
  actor.carrying = null;
  actor.path = findCorridorPath(officePlan, pick.corridor, 'lounge_entry', [spot.wx, spot.wz]);
  actor.returnPath = findCorridorPath(officePlan, 'lounge_entry', pick.corridor, [pick.wx, pick.wz]);
  actor.homeDesk = pick;
  actor.arriveYaw = spot.yaw;
  actor.arriveMode = spot.mode;
  actor.arriveCarry = 'coffee';
  actor.stayDuration = 4.5;
  actor.bubbleText = '☕ 喝杯咖啡歇歇';
  actor.bubbleUntil = nowSec + 5;
  actor.arriveBubble = '☕ 满血复活中';
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
    const enrichedAgents = (agentsData.agents || []).map((a) => {
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
      statEl.textContent = `${dataRef.agents.length} 个工位 · 5 方位沙盘`;
    }

    if (state.selected) {
      await loadSelectedMessages(state.selected);
    }

    rebuildScene(ovl, side, host, root);
    renderBottomPostureBar(root);
    renderSide(side, ovl, dataRef, root);
    renderTicker(root.querySelector('#wsTicker'), dataRef.events);
  } catch (err) {
    ovl.innerHTML = `<div class="empty-state"><b>3D 实时工位加载失败</b><span>${esc(err.message)}</span></div>`;
  }
}

function getFilteredAgents(agents) {
  if (state.filter === 'active') return agents.filter((a) => AWAKE.includes(a.status) || a.total > 0);
  if (state.filter === 'muse') return agents.filter((a) => /^muse/i.test(a.name) || a.registered);
  return agents;
}

function rebuildScene(ovl, side, host, root) {
  if (!dataRef) return;
  const agents = getFilteredAgents(dataRef.agents);
  if (!agents.length) {
    sceneDesks = [];
    ovl.innerHTML = `<div class="empty-state"><b>当前筛选下暂无工位</b><span>可切换顶部筛选按钮</span></div>`;
    return;
  }

  officePlan = buildOfficePlan(agents);
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;

  sceneDesks = officePlan.desks.map((d, idx) => {
    const liveAction = resolveMuseLiveAction(d.agent, customMap, liveBursts.get(d.agent.name), nowSec);
    // 初始化/保留行走角色状态，避免刷新数据时走一半的人瞬间瞬移回座位
    let actor = actorMap.get(d.agent.name);
    if (!actor) {
      actor = {
        name: d.agent.name,
        wx: d.wx,
        wz: d.wz,
        baseY: d.baseY || 0,
        yaw: d.yaw,
        mode: 'sit',
        task: 'work',
        action: liveAction.posture,
        color: liveAction.meta.color,
        seed: idx * 1.7,
        walkPhase: 0,
        path: [],
        returnPath: [],
        bubbleText: '',
        bubbleUntil: 0,
      };
      actorMap.set(d.agent.name, actor);
    } else {
      actor.homeDesk = d;
      actor.action = liveAction.posture;
      actor.color = liveAction.meta.color;
      if (actor.mode === 'sit' && actor.task === 'work') {
        actor.wx = d.wx;
        actor.wz = d.wz;
        actor.baseY = d.baseY || 0;
        actor.yaw = d.yaw;
      }
    }
    return { ...d, liveAction, domEl: null };
  });

  // 渲染精简胶囊 + 点击才展开的悬浮详情卡片
  ovl.innerHTML = sceneDesks.map((d, idx) => {
    const a = d.agent;
    const av = a.avatar || defaultAvatar(a.name);
    const label = a.display_name || a.name;
    const badge = museBadgeText(a.name) || `#${String(idx + 1).padStart(2, '0')}`;
    const pal = paletteFor(a.name);
    const act = d.liveAction;

    return `
      <div class="ac3d ws3d ${state.selected === a.name ? 'selected' : ''}" data-name="${esc(a.name)}" style="--c:${act.meta.color}">
        <div class="ac3d-pop">
          <div class="apop-hd">
            <b>${esc(label)}</b>
            <span class="chip" style="color:${act.meta.color};border-color:${act.meta.color};padding:0 5px;font-size:9.5px">
              ${act.meta.icon} ${esc(act.meta.short)}
            </span>
          </div>
          <div class="apop-duty">${esc(act.profile.duty)} · 方位: ${esc(ZONE_META[d.zone]?.label || d.zone)}</div>
          <div class="apop-act-box" style="--act-c:${act.meta.color}">
            <div class="apop-step">${esc(act.stepLabel)} · ${esc(act.targetLabel)}</div>
            <div class="apop-act-txt">${esc(act.actionText)}</div>
          </div>
          <div class="apop-nums">
            <span>共 <b>${num(a.total || 0)}</b> 条</span>
            <span class="in">↓${num(a.inbound || 0)}</span>
            <span class="out">↑${num(a.outbound || 0)}</span>
          </div>
          <div class="apop-drills">
            ${Object.values(MUSE_POSTURES).map((p) => `
              <button type="button" class="apop-drill-btn ${act.posture === p.key ? 'on' : ''}"
                      data-drill="${esc(p.key)}" data-agent="${esc(a.name)}">
                ${p.icon} ${esc(p.short)}
              </button>`).join('')}
          </div>
          <div class="apop-btns">
            <button type="button" class="btn ghost sm" data-pop-act="walk" data-agent="${esc(a.name)}">🚶 走动送件</button>
            <button type="button" class="btn sm" data-pop-act="chat" data-agent="${esc(a.name)}">💬 通信台</button>
          </div>
        </div>

        <div class="bb3d" style="display:none"></div>

        <div class="ac3d-pill">
          <div class="ac3d-av">
            ${av
              ? `<img src="${esc(av)}" alt="${esc(label)}" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
                 <span class="ac3d-fb" style="display:none;background:${pal.bg};color:${pal.fg}">${esc(initial(label))}</span>`
              : `<span class="ac3d-fb" style="background:${pal.bg};color:${pal.fg}">${esc(initial(label))}</span>`}
            <em class="ac3d-badge">${esc(badge)}</em>
          </div>
          <span class="ac3d-nm">${esc(label)}</span>
          <span class="ws-pill-act" style="color:${act.meta.color}">${act.meta.icon}</span>
        </div>
      </div>`;
  }).join('');

  ovl.querySelectorAll('[data-drill]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      triggerDeskAction(btn.dataset.agent, btn.dataset.drill, true, ovl, side, root);
      toast(`${btn.dataset.agent} 执行「${MUSE_POSTURES[btn.dataset.drill]?.short}」`);
    };
  });

  ovl.querySelectorAll('[data-pop-act]').forEach((btn) => {
    btn.onclick = (ev) => {
      ev.stopPropagation();
      const agName = btn.dataset.agent;
      if (btn.dataset.popAct === 'walk') {
        walkAgentToPeer(agName, null, '手动触发送件');
        toast(`${agName} 已起身沿走廊送件`);
      } else {
        ctxRef?.go('chat', { agent: agName });
      }
    };
  });

  const domNodes = ovl.querySelectorAll('.ac3d');
  sceneDesks.forEach((d, i) => {
    d.domEl = domNodes[i];
    const name = d.agent.name;
    d.domEl.addEventListener('mouseenter', () => { state.hovered = name; syncSelection(ovl); });
    d.domEl.addEventListener('mouseleave', () => { if (state.hovered === name) state.hovered = null; syncSelection(ovl); });
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

  syncSelection(ovl);
}

function refreshDeskPills(ovl, root) {
  if (!ovl || !sceneDesks.length) return;
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;
  sceneDesks.forEach((d) => {
    const act = resolveMuseLiveAction(d.agent, customMap, liveBursts.get(d.agent.name), nowSec);
    d.liveAction = act;
    const actor = actorMap.get(d.agent.name);
    if (actor) {
      actor.action = act.posture;
      actor.color = act.meta.color;
    }
    if (!d.domEl) return;
    d.domEl.style.setProperty('--c', act.meta.color);
    const pillAct = d.domEl.querySelector('.ws-pill-act');
    if (pillAct) {
      pillAct.style.color = act.meta.color;
      pillAct.textContent = actor?.mode === 'walk' ? '🚶' : act.meta.icon;
    }
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

// 更新角色走廊走动状态
function stepActors(dt, nowSec) {
  const speed = 78; // 走廊步行速度 px/s
  for (const actor of actorMap.values()) {
    if (actor.mode === 'walk' && actor.path && actor.path.length > 0) {
      const [tx, tz] = actor.path[0];
      const dx = tx - actor.wx;
      const dz = tz - actor.wz;
      const dist = Math.hypot(dx, dz);
      const step = speed * dt;

      if (dist <= step) {
        actor.wx = tx;
        actor.wz = tz;
        actor.path.shift();
        if (actor.path.length === 0) {
          // 到达目的地
          if (actor.task === 'returning') {
            actor.mode = 'sit';
            actor.task = 'work';
            actor.carrying = null;
            actor.yaw = actor.homeDesk?.yaw ?? 0;
            actor.baseY = actor.homeDesk?.baseY || 0;
          } else {
            actor.mode = actor.arriveMode || 'stand';
            if (actor.arriveYaw != null) actor.yaw = actor.arriveYaw;
            if (actor.arriveCarry) actor.carrying = actor.arriveCarry;
            actor.stayUntil = nowSec + (actor.stayDuration || 3.0);
            if (actor.arriveBubble) {
              actor.bubbleText = actor.arriveBubble;
              actor.bubbleUntil = nowSec + 3.2;
            }
          }
        }
      } else {
        actor.wx += (dx / dist) * step;
        actor.wz += (dz / dist) * step;
        // 面朝行走方向（-Z 为角色正面）
        actor.yaw = Math.atan2(-dx, -dz);
        actor.walkPhase += dt * 10.5;
        actor.baseY = 0;
      }
    } else if (actor.task !== 'work' && actor.stayUntil && nowSec >= actor.stayUntil) {
      // 停留结束，沿 returnPath 返回自己工位
      actor.stayUntil = 0;
      actor.mode = 'walk';
      actor.task = 'returning';
      actor.carrying = null;
      actor.arriveMode = null;
      actor.arriveYaw = null;
      actor.arriveCarry = null;
      actor.arriveBubble = null;
      actor.path = actor.returnPath && actor.returnPath.length
        ? [...actor.returnPath]
        : (actor.homeDesk ? [[actor.homeDesk.wx, actor.homeDesk.wz]] : []);
    }
  }
}

// ─── 60FPS 真 3D 五方位办公大厅渲染循环 ─────────────────────────────────────────────
function startOffice3DLoop(host, canvas, ovl, root) {
  let raf = 0;
  let lastTs = performance.now();
  let lastSync = 0;
  const ctx = canvas.getContext('2d');

  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
    lastTs = now;
    const t = now / 1000;

    if (t - lastSync > 1.1) {
      lastSync = t;
      refreshDeskPills(ovl, root);
    }

    // 平滑镜头插值（切换北/西/东/南/中枢/全景时顺滑飞过去）
    if (state.camGoal && !state.cam.dragging) {
      const k = 1 - Math.pow(0.002, dt);
      let dyaw = state.camGoal.yaw - state.cam.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      state.cam.yaw += dyaw * k;
      state.cam.pitch += (state.camGoal.pitch - state.cam.pitch) * k;
      state.cam.zoom += (state.camGoal.zoom - state.cam.zoom) * k;
      state.cam.tx += (state.camGoal.tx - state.cam.tx) * k;
      state.cam.tz += (state.camGoal.tz - state.cam.tz) * k;
      if (Math.abs(dyaw) < 0.003 && Math.abs(state.camGoal.tx - state.cam.tx) < 0.5) {
        state.camGoal = null;
      }
    } else if (state.cam.autoOrbit && !state.cam.dragging) {
      state.cam.yaw = (state.cam.yaw + dt * 0.24) % (Math.PI * 2);
    }

    stepActors(dt, t);

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
    const project = createProjector(state.cam, W, H);

    if (officePlan && sceneDesks.length) {
      const cmds = [];
      cmds.push(...buildArchitectureScene(project, officePlan, { isLight, isAmber, primaryHex }, t));

      // 工位 + 椅子 + 显示器
      sceneDesks.forEach((d) => {
        const isSel = state.selected === d.agent.name;
        const isHov = state.hovered === d.agent.name;
        const col = d.liveAction?.meta?.color || primaryHex;
        cmds.push(...buildDeskCmd(project, d, col, isSel, isHov, isLight, t));
      });

      // 会行走的 3D 智能体小人
      const headProjMap = new Map();
      sceneDesks.forEach((d) => {
        const actor = actorMap.get(d.agent.name);
        if (!actor) return;
        const charCmd = buildAgentCharacterCmd(project, actor, t);
        if (charCmd) {
          cmds.push(charCmd);
          headProjMap.set(d.agent.name, { proj: charCmd.headScreen, actor });
        }
      });

      // 送件飞线效果
      for (let i = walkArcs.length - 1; i >= 0; i -= 1) {
        const arc = walkArcs[i];
        if (t > arc.until) { walkArcs.splice(i, 1); continue; }
        cmds.push({
          z: -9999,
          draw(c) {
            const p1 = project(arc.from[0], 26, arc.from[1]);
            const p2 = project(arc.to[0], 26, arc.to[1]);
            const mid = project((arc.from[0] + arc.to[0]) * 0.5, 68, (arc.from[1] + arc.to[1]) * 0.5);
            if (!p1.visible || !p2.visible) return;
            c.save();
            c.strokeStyle = arc.color;
            c.setLineDash([5, 5]);
            c.lineWidth = 1.6;
            c.globalAlpha = Math.max(0.2, Math.min(1, (arc.until - t) / 2));
            c.beginPath();
            c.moveTo(p1.x, p1.y);
            c.quadraticCurveTo(mid.x, mid.y, p2.x, p2.y);
            c.stroke();
            c.restore();
          },
        });
      }

      // 严格按相机深度由远及近绘制所有 3D 图元
      cmds.sort((a, b) => b.z - a.z);
      for (const c of cmds) c.draw(ctx);

      // 同步悬浮 HTML 胶囊坐标到每个人头顶（跟随行走移动！）
      sceneDesks.forEach((d) => {
        if (!d.domEl) return;
        const info = headProjMap.get(d.agent.name);
        if (!info || !info.proj.visible) {
          d.domEl.style.display = 'none';
          return;
        }
        const { proj, actor } = info;
        d.domEl.style.display = '';
        d.domEl.style.transform = `translate3d(${proj.x.toFixed(1)}px, ${(proj.y - 12).toFixed(1)}px, 0) translate(-50%, -100%)`;
        d.domEl.style.zIndex = String(Math.max(10, Math.round(1500 - proj.z)));

        const bb = d.domEl.querySelector('.bb3d');
        if (bb) {
          if (actor.bubbleText && t < (actor.bubbleUntil || 0)) {
            bb.style.display = '';
            bb.textContent = actor.bubbleText;
            bb.className = `bb3d ${actor.bubbleOut ? 'out' : ''}`;
          } else {
            bb.style.display = 'none';
          }
        }
      });
    }

    ctx.restore();
  };

  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
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
  if (!side || !data) return;
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
          <button class="btn ghost sm" id="backToListBtn">← 返回列表</button>
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
              <div class="insp-kpi"><span>↓ 收进</span><b style="color:#45e6f5">${num(a.inbound)} 条</b></div>
              <div class="insp-kpi"><span>↑ 发出</span><b style="color:#35e08a">${num(a.outbound)} 条</b></div>
              <div class="insp-kpi"><span>Σ 总计</span><b>${num(a.total)} 条</b></div>
              <div class="insp-kpi"><span>最近活跃</span><b>${rel(a.last_ts)}</b></div>
            </div>
          </div>

          <div class="insp-section insp-live-act" style="--act-c:${liveAct.meta.color}">
            <div class="insp-sec-title">
              <span>工位动作演练 & 走廊走动</span>
              <span class="chip" style="color:${liveAct.meta.color};border:1px solid ${liveAct.meta.color};background:transparent">${liveAct.meta.icon} ${esc(liveAct.meta.short)}</span>
            </div>
            <div class="ila-now">
              <div class="ila-step">${esc(liveAct.stepLabel)} · ${esc(liveAct.targetLabel)}</div>
              <div class="ila-txt">${esc(liveAct.actionText)}</div>
            </div>
            <div class="ila-drills">
              <div class="ila-drill-btns">
                ${Object.values(MUSE_POSTURES).map((p) => `
                  <button type="button" class="ila-btn ${liveAct.posture === p.key ? 'on' : ''}" data-drill="${esc(p.key)}" style="--pc:${p.color}">
                    ${p.icon} ${esc(p.short)}
                  </button>`).join('')}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px">
                <button type="button" class="btn ghost sm" id="inspWalkPeerBtn">🚶 跨工位走动送件</button>
                <button type="button" class="btn ghost sm" id="inspWalkHubBtn">💠 去中枢台汇报</button>
              </div>
            </div>
          </div>

          <div class="insp-section">
            <div class="insp-sec-title">
              <span>5 阶段动作定义</span>
              <a href="#" id="editActionLink" style="color:var(--blue);font-size:11px">✎ 修改定义</a>
            </div>
            <div class="insp-sop-list">
              <div class="insp-sop-row"><span>📡 入站:</span><b>${esc(prof.on_inbound)}</b></div>
              <div class="insp-sop-row"><span>⌨️ 推演:</span><b>${esc(prof.on_process)}</b></div>
              <div class="insp-sop-row"><span>🚀 出站:</span><b>${esc(prof.on_outbound)}</b></div>
              <div class="insp-sop-row"><span>🔄 协同:</span><b>${esc(prof.on_collab)}</b></div>
              <div class="insp-sop-row"><span>🛰️ 待命:</span><b>${esc(prof.on_idle)}</b></div>
            </div>
          </div>

          <form class="insp-quick-send" id="quickSendForm">
            <input type="text" id="quickSendInput" placeholder="向 ${esc(a.display_name || a.name)} 派单触发动作…" required>
            <button type="submit" class="btn sm">${icon('send', 13)} 派单</button>
          </form>
        </div>`;

      side.querySelector('#backToListBtn').onclick = () => {
        state.selected = null;
        syncSelection(ovl);
        renderSide(side, ovl, data, root);
      };
      side.querySelector('#goChatBtn').onclick = () => ctxRef?.go('chat', { agent: a.name });
      side.querySelector('#inspWalkPeerBtn').onclick = () => {
        walkAgentToPeer(a.name, null, '送交工单');
        toast(`${a.display_name || a.name} 已起身跨工位走动送件`);
      };
      side.querySelector('#inspWalkHubBtn').onclick = () => {
        walkAgentToHub(a.name);
        toast(`${a.display_name || a.name} 正前往中枢指挥台`);
      };

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
          triggerDeskAction(a.name, btn.dataset.drill, true, ovl, side, root);
          toast(`${a.display_name || a.name} 执行「${MUSE_POSTURES[btn.dataset.drill]?.short}」`);
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
          triggerDeskAction(a.name, 'receiving', false, ovl, side, root, text);
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
        <button data-tab="live" class="${state.sideTab === 'live' ? 'on' : ''}">工位动态 (${sorted.length})</button>
        <button data-tab="defs" class="${state.sideTab === 'defs' ? 'on' : ''}">动作定义 (${sorted.length})</button>
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
                <button type="button" class="btn ghost sm mac-edit-btn" data-edit="${esc(a.name)}">⚙️ 编辑</button>
              </div>
              <div class="mac-duty">${esc(prof.duty)}</div>
              <div class="mac-sops">
                <div><span>📡 入站:</span> ${esc(prof.on_inbound)}</div>
                <div><span>⌨️ 推演:</span> ${esc(prof.on_process)}</div>
                <div><span>🚀 出站:</span> ${esc(prof.on_outbound)}</div>
                <div><span>🔄 协同:</span> ${esc(prof.on_collab)}</div>
                <div><span>🛰️ 待命:</span> ${esc(prof.on_idle)}</div>
              </div>
            </div>`;
        }).join('')}
      </div>
    ` : `
      <div class="office-seat-list" id="wsLiveList">
        ${sorted.map((a) => {
          const badge = museBadgeText(a.name);
          const liveAct = resolveMuseLiveAction(a, customMap, liveBursts.get(a.name), nowSec);
          const desk = sceneDesks.find((d) => d.agent.name === a.name);
          const zoneLabel = desk ? (ZONE_META[desk.zone]?.label || '') : '';
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
                  <div class="osr-act-desc">${zoneLabel ? `[${zoneLabel}] ` : ''}${esc(liveAct.actionText)}</div>
                </div>
              </div>
              <div class="osr-right">
                <div class="osr-total">${num(a.total || 0)} 条</div>
                <div class="osr-nums">
                  <span class="in">↓${num(a.inbound || 0)}</span>·<span class="out">↑${num(a.outbound || 0)}</span>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    `}`;

  side.querySelector('#wsSideSeg').onclick = (e) => {
    const btn = e.target.closest('button[data-tab]');
    if (!btn || btn.dataset.tab === state.sideTab) return;
    state.sideTab = btn.dataset.tab;
    renderSide(side, ovl, data, root);
  };

  side.querySelectorAll('.office-seat-row').forEach((row) => {
    const name = row.dataset.name;
    row.addEventListener('mouseenter', () => { state.hovered = name; syncSelection(ovl); });
    row.addEventListener('mouseleave', () => { if (state.hovered === name) state.hovered = null; syncSelection(ovl); });
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
}
