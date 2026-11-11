import { api, store } from '../api.js';
import {
  esc, num, rel, fmtTime, statusText, defaultAvatar, initial, debounce,
  paletteFor, museBadgeText, resolveMuseLiveAction,
} from '../ui.js';

const NW = 166;
const NH = 56;
const NARROW = 640;

const state = { win: '24h', inferred: true, data: null };
let ctxRef = null;

function displayNodeName(name, nodeMap) {
  if (!name) return '未知';
  if (name === 'relay') return '中继核心';
  if (name === 'console') return '控制台';
  const n = nodeMap?.get(name);
  return n?.display_name || n?.name || name;
}

export async function mount(root, ctx) {
  ctxRef = ctx;
  state.win = store.settings?.default_window || '24h';
  state.inferred = store.settings?.show_inferred !== false;

  root.innerHTML = `
    <div class="pg-overview">
      <div class="kpis" id="kpis">
        ${['信箱工位', '在线活跃', '窗口 / 累计报文', '数据去向链路', '精确配对率'].map((k) => `
          <div class="kpi"><div class="k">${k}</div><div class="v">—</div><div class="s">加载中</div></div>`).join('')}
      </div>

      <section class="graph-wrap">
        <div class="panel-head">
          <span class="dp-badge">FLOW TOPOLOGY</span>
          <h2>全局链路与数据去向拓扑</h2>
          <span class="chip" id="graphStat">—</span>
          <span class="spacer"></span>
          <div class="seg" id="winSeg">
            ${Object.entries({ '1h': '1 小时', '24h': '24 小时', '7d': '7 天' }).map(([v, label]) =>
              `<button data-win="${v}" class="${v === state.win ? 'on' : ''}">${label}</button>`).join('')}
          </div>
          <button class="btn ghost sm" id="inferBtn">推断边</button>
          <button class="btn ghost sm" id="go3dBtn" title="切换到 3D 指挥室观看工位实时动作">🏛️ 3D 工位</button>
        </div>
        <div class="graph-body" id="graphBody">
          <div class="empty-state"><span>正在计算链路与去向…</span></div>
        </div>
        <div class="legend" id="legend">
          <span><i></i>精确配对去向</span>
          <span><i class="dash"></i>时序推断去向</span>
          <span><i class="faint"></i>中继直达（弱化）</span>
          <span style="margin-left:auto;opacity:0.8">悬停节点高亮关联去向 · 点击节点进通信台</span>
        </div>
      </section>

      <div class="side-col">
        <div class="rank">
          <div class="panel-head">
            <h2>数据去向明细 (来源 → 去向)</h2>
            <span class="spacer"></span>
            <span class="chip" id="flowCntChip">0 条</span>
          </div>
          <div id="flowDestList" style="padding:6px 10px;max-height:175px;overflow-y:auto"></div>
        </div>

        <div class="feed">
          <div class="panel-head">
            <h2>实时收发事件</h2>
            <span class="spacer"></span>
            <span class="chip" id="feedState">连接中</span>
          </div>
          <div class="feed-list" id="feedList">
            <div class="empty-state"><span>暂无消息</span></div>
          </div>
        </div>

        <div class="rank">
          <div class="panel-head"><h2>工位往来量 & 实时动作</h2></div>
          <div id="rankList" style="padding:4px 0 8px;max-height:185px;overflow-y:auto"></div>
        </div>

        <div class="rank" id="noticeBox" hidden>
          <div class="panel-head"><h2>公告与规则</h2></div>
          <div id="noticeList" style="padding:8px 14px 10px;font-size:12px;line-height:1.65;max-height:130px;overflow-y:auto"></div>
        </div>
      </div>
    </div>`;

  const host = root.querySelector('#graphBody');
  const feedList = root.querySelector('#feedList');
  const inferBtn = root.querySelector('#inferBtn');
  const go3dBtn = root.querySelector('#go3dBtn');

  const syncInfer = () => { inferBtn.textContent = state.inferred ? '推断流向 · 显示' : '推断流向 · 隐藏'; };
  syncInfer();

  if (go3dBtn) {
    go3dBtn.onclick = () => ctx.go('office');
  }

  root.querySelector('#winSeg').onclick = (event) => {
    const btn = event.target.closest('button[data-win]');
    if (!btn || btn.dataset.win === state.win) return;
    state.win = btn.dataset.win;
    root.querySelectorAll('#winSeg button').forEach((b) => b.classList.toggle('on', b === btn));
    load(root, host, feedList);
  };

  inferBtn.onclick = () => {
    state.inferred = !state.inferred;
    syncInfer();
    load(root, host, feedList);
  };

  const refreshDelay = Math.max(400, Math.min(Number(store.settings?.refresh_ms) || 1200, 10000));
  const reload = debounce(() => load(root, host, feedList), refreshDelay);
  const offMessages = store.on('messages', (items) => {
    appendFeed(feedList, items);
    reload();
  });
  const offStream = store.on('stream-state', (s) => {
    const chip = root.querySelector('#feedState');
    if (!chip) return;
    chip.textContent = s === 'open' ? '实时' : '重连中';
    chip.className = `chip ${s === 'open' ? 'in' : 'warn'}`;
  });
  const offTheme = store.on('theme', () => {
    if (state.data) drawGraph(host, state.data, ctxRef);
  });

  const observer = new ResizeObserver(debounce(() => {
    if (state.data) drawGraph(host, state.data, ctxRef);
  }, 180));
  observer.observe(host);

  await load(root, host, feedList);

  return () => {
    offMessages();
    offStream();
    offTheme();
    observer.disconnect();
  };
}

async function load(root, host, feedList) {
  try {
    const [overview, lineage, events] = await Promise.all([
      api.overview(state.win),
      api.lineage(state.win, state.inferred),
      api.events(28),
    ]);
    store.setAgents(overview.agents || []);
    state.data = lineage;
    renderKpis(root, overview, lineage);
    drawGraph(host, lineage, ctxRef);
    renderFlowDestinations(root, lineage, overview.agents || []);
    renderFeed(feedList, events.events || []);
    renderRank(root, overview);
    renderNotices(root);
  } catch (err) {
    host.innerHTML = `<div class="empty-state"><b>链路加载失败</b><span>${esc(err.message)}</span></div>`;
  }
}

function renderNotices(root) {
  const box = root.querySelector('#noticeBox');
  const list = root.querySelector('#noticeList');
  if (!box || !list) return;
  const notices = Array.isArray(store.settings?.notices) ? store.settings.notices : [];
  const rules = Array.isArray(store.settings?.rules) ? store.settings.rules : [];
  if (!notices.length && !rules.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const levelMap = { g: ['out', '可信'], a: ['warn', '只观察'], v: ['in', '自有'], r: ['danger', '忽略'] };
  const parts = [];
  for (const n of notices) {
    const [cls, label] = levelMap[n.level] || ['', '提示'];
    parts.push(`<div style="margin-bottom:5px"><span class="chip ${cls}" style="margin-right:5px">${esc(label)}</span><b>${esc(n.title || '')}</b> <span class="muted">${esc(n.text || '')}</span></div>`);
  }
  for (const r of rules) {
    parts.push(`<div class="muted">• ${esc(r)}</div>`);
  }
  list.innerHTML = parts.join('');
}

function renderKpis(root, overview, lineage) {
  const k = overview.kpis;
  const allTotal = k.total_messages ?? (overview.agents || []).reduce((s, a) => s + (a.total || 0), 0);
  const allIn = k.total_inbound ?? (overview.agents || []).reduce((s, a) => s + (a.inbound || 0), 0);
  const allOut = k.total_outbound ?? (overview.agents || []).reduce((s, a) => s + (a.outbound || 0), 0);

  const cards = [
    { k: '信箱工位总数', v: k.inboxes, s: `${k.online} 个在线 · ${(overview.agents || []).filter((a) => a.total > 0).length} 个有报文` },
    { k: '实时在线', v: k.online, s: '5 分钟内有活跃报文' },
    { k: `${state.win.toUpperCase()} 窗口报文`, v: `${num(k.messages)} 条`, s: `↓收 ${num(k.inbound)} · ↑发 ${num(k.outbound)} (累计 ${num(allTotal)} 条)` },
    { k: '数据流向边', v: `${k.edges} 条`, s: `跨节点与中继去向 (${k.inferred} 条推断)` },
    { k: '累计收发总量', v: `${num(allTotal)} 条`, s: `累计 ↓收 ${num(allIn)} · ↑发 ${num(allOut)} · 配对率 ${Math.round((k.paired_ratio || 0) * 100)}%`, wide: true },
  ];
  root.querySelector('#kpis').innerHTML = cards.map((c) => `
    <div class="kpi${c.wide ? ' wide' : ''}"><div class="k">${esc(c.k)}</div>
      <div class="v">${esc(String(c.v))}</div><div class="s">${esc(c.s)}</div></div>`).join('');
  root.querySelector('#graphStat').textContent =
    `${lineage.nodes.filter((n) => !n.virtual).length} 工位节点 · ${lineage.edges.length} 条去向链路 · 窗口 ${num(k.messages)} 条`;
}

function renderFlowDestinations(root, lineage, agents) {
  const box = root.querySelector('#flowDestList');
  const chip = root.querySelector('#flowCntChip');
  if (!box) return;
  const nodeMap = new Map([
    ...agents.map((a) => [a.name, a]),
    ...(lineage.nodes || []).map((n) => [n.name, n]),
  ]);
  const edges = lineage.edges || [];
  if (chip) chip.textContent = `${edges.length} 条流向`;

  if (!edges.length) {
    box.innerHTML = '<div class="muted" style="padding:10px 4px;font-size:12px">当前窗口暂无流向边，可切换至 24H / 7D 查看</div>';
    return;
  }

  // 优先展示跨工位流向，再展示中继流向
  const sorted = [...edges].sort((a, b) => {
    const ca = (a.from !== 'relay' && a.to !== 'relay') ? 1 : 0;
    const cb = (b.from !== 'relay' && b.to !== 'relay') ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return (b.count || 0) - (a.count || 0);
  });

  box.innerHTML = sorted.map((e) => {
    const isCross = e.from !== 'relay' && e.to !== 'relay';
    const srcName = displayNodeName(e.from, nodeMap);
    const dstName = displayNodeName(e.to, nodeMap);
    const tagCls = isCross ? (e.inferred ? 'warn' : 'out') : 'in';
    const tagTxt = isCross ? (e.inferred ? '推断' : '精确') : '中继';
    return `
      <div class="ov-flow-row" data-from="${esc(e.from)}" data-to="${esc(e.to)}">
        <div class="ov-flow-path">
          <b class="src">${esc(srcName)}</b>
          <span class="arr">──▶</span>
          <b class="dst">${esc(dstName)}</b>
        </div>
        <div class="ov-flow-meta">
          <b>${num(e.count)} 条</b>
          <span class="chip ${tagCls}" style="font-size:9.5px;padding:0 5px">${tagTxt}</span>
        </div>
      </div>`;
  }).join('');

  box.querySelectorAll('.ov-flow-row').forEach((row) => {
    const from = row.dataset.from;
    const to = row.dataset.to;
    row.onclick = () => {
      const target = (to !== 'relay' && to !== 'console') ? to : ((from !== 'relay' && from !== 'console') ? from : null);
      if (target && ctxRef) ctxRef.go('chat', { agent: target });
    };
  });
}

function renderFeed(host, items) {
  if (!items.length) {
    host.innerHTML = '<div class="empty-state"><span>这段时间还没有消息</span></div>';
    return;
  }
  host.innerHTML = items.map(feedHtml).join('');
  host.scrollTop = host.scrollHeight;
}

function feedHtml(m) {
  const mine = m.via === 'console';
  const inbound = !mine && m.direction === 'inbound';
  const body = m.content
    ? esc(m.content.slice(0, 90))
    : (m.media_url ? `[${esc(m.type)}]` : '（空消息）');
  return `<div class="feed-item">
    <span class="t">${fmtTime(m.timestamp)}</span>
    <div class="body">
      <span class="who">${esc(m.name)}</span>
      <span class="chip ${inbound ? 'in' : 'out'}" style="margin-left:4px">${mine || !inbound ? '↑ 发出' : '↓ 收进'}</span>
      <div class="txt">${body}</div>
    </div>
  </div>`;
}

function appendFeed(host, items) {
  if (!items.length) return;
  const empty = host.querySelector('.empty-state');
  if (empty) host.innerHTML = '';
  const atBottom = host.scrollHeight - host.scrollTop - host.clientHeight < 60;
  host.insertAdjacentHTML('beforeend', items.map(feedHtml).join(''));
  while (host.children.length > 60) host.firstElementChild.remove();
  if (atBottom) host.scrollTop = host.scrollHeight;
}

function renderRank(root, overview) {
  const list = (overview.agents || []).slice(0, 8);
  const max = Math.max(1, ...list.map((a) => a.total || 0));
  const host = root.querySelector('#rankList');
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;

  if (!list.length) {
    host.innerHTML = '<div class="empty-state" style="height:auto;padding:12px"><span>还没有信箱</span></div>';
    return;
  }
  host.innerHTML = list.map((a) => {
    const liveAct = resolveMuseLiveAction(a, customMap, null, nowSec);
    return `
      <div class="rank-row" data-agent="${esc(a.name)}" style="cursor:pointer" title="点击打开 ${esc(a.display_name || a.name)} 通信台 · 当前动作: ${esc(liveAct.actionText)}">
        <span class="nm">
          ${liveAct.meta.icon} ${esc(a.display_name || a.name)}
        </span>
        <span class="bar" style="width:${Math.max(6, ((a.total || 0) / max) * 76)}px"></span>
        <span class="vl" style="min-width:86px;text-align:right">
          <em style="color:#45e6f5;font-style:normal">↓${a.inbound}</em>/<em style="color:#35e08a;font-style:normal">↑${a.outbound}</em> (<b>${a.total}</b>)
        </span>
      </div>`;
  }).join('');

  host.querySelectorAll('.rank-row[data-agent]').forEach((row) => {
    row.onclick = () => ctxRef?.go('chat', { agent: row.dataset.agent });
  });
}

/* ── 分层布局：宽屏横向、窄屏纵向 ── */
function layerize(nodes, edges) {
  const have = new Set();
  const dir = [];
  for (const e of edges) {
    const rev = `${e.to}|${e.from}`;
    if (have.has(rev)) continue;
    have.add(`${e.from}|${e.to}`);
    dir.push(e);
  }

  const layer = new Map(nodes.map((n) => [n.name, 0]));
  const indeg = new Map(nodes.map((n) => [n.name, 0]));
  const adj = new Map();
  for (const e of dir) {
    if (indeg.has(e.to)) indeg.set(e.to, indeg.get(e.to) + 1);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }

  let roots = nodes.filter((n) => indeg.get(n.name) === 0).map((n) => n.name);
  if (!roots.length && nodes.length) roots = [nodes[0].name];

  const queue = [...roots];
  let guard = 0;
  while (queue.length && guard < 800) {
    guard += 1;
    const cur = queue.shift();
    for (const next of adj.get(cur) || []) {
      const want = Math.min((layer.get(cur) || 0) + 1, 5);
      if (want > (layer.get(next) || 0)) {
        layer.set(next, want);
        queue.push(next);
      }
    }
  }

  const cols = new Map();
  for (const n of nodes) {
    const lv = layer.get(n.name) || 0;
    if (!cols.has(lv)) cols.set(lv, []);
    cols.get(lv).push(n);
  }
  const levels = [...cols.keys()].sort((a, b) => a - b);
  for (const lv of levels) cols.get(lv).sort((a, b) => (b.volume || 0) - (a.volume || 0));
  return { cols, levels };
}

function buildLayout(nodes, edges, W, H, vertical) {
  const pos = new Map();
  if (!nodes.length) return { pos, contentH: H };

  const { cols, levels } = layerize(nodes, edges);

  if (!vertical) {
    const padL = 48;
    const padR = 48;
    const padT = 32;
    const padB = 28;
    const usableW = Math.max(W - padL - padR - NW, 0);
    const colGap = levels.length > 1 ? usableW / (levels.length - 1) : 0;
    const usableH = Math.max(H - padT - padB - NH, 40);

    levels.forEach((lv, i) => {
      const list = cols.get(lv);
      const x = levels.length > 1 ? padL + i * colGap : (W - NW) / 2;
      const gap = list.length > 1 ? Math.min(usableH / (list.length - 1), 132) : 0;
      const total = gap * (list.length - 1);
      const startY = padT + (usableH - total) / 2;
      list.forEach((n, j) => pos.set(n.name, { x, y: startY + j * gap }));
    });
    return { pos, contentH: H };
  }

  const padX = 12;
  const padT = 14;
  const usableW = Math.max(W - padX * 2, NW);
  const perRow = Math.max(1, Math.floor(usableW / (NW + 10)));
  let y = padT;

  for (const lv of levels) {
    const list = cols.get(lv);
    for (let i = 0; i < list.length; i += perRow) {
      const chunk = list.slice(i, i + perRow);
      const free = Math.max(usableW - chunk.length * NW, 0);
      const gap = chunk.length > 1 ? free / (chunk.length + 1) : 0;
      chunk.forEach((n, j) => {
        pos.set(n.name, {
          x: padX + (chunk.length > 1 ? gap * (j + 1) + NW * j : (usableW - NW) / 2),
          y,
        });
      });
      y += NH + 26;
    }
    y += 12;
  }
  return { pos, contentH: y + 10 };
}

function edgeColor(edge, isLight, isAmber) {
  const isCross = edge.from !== 'relay' && edge.to !== 'relay';
  if (isCross && !edge.inferred) return '#ff3f8e';
  if (isCross && edge.inferred) return '#ffc21a';
  if (edge.confidence >= 0.85) return isAmber ? '#ffc46b' : (isLight ? '#2563eb' : '#45e6f5');
  if (edge.confidence >= 0.5) return isAmber ? '#d99b43' : (isLight ? '#16a34a' : '#35e08a');
  return isLight ? '#94a3b8' : '#52607a';
}

function spreadOffset(j, n) {
  if (n <= 1) return 0;
  const step = Math.min(13, 46 / (n - 1));
  return (j - (n - 1) / 2) * step;
}

function drawGraph(host, data, ctx) {
  const W = Math.max(host.clientWidth || 560, 280);
  const H = Math.max(host.clientHeight || 300, 200);
  const vertical = W < NARROW;
  const theme = document.documentElement.dataset.theme || 'cyber';
  const isLight = theme === 'ops';
  const isAmber = theme === 'amber';
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;

  if (!data.nodes.length) {
    host.innerHTML = `<div class="empty-state"><b>还没有可画的链路</b>
      <span>信箱有消息往来后，这里会自动出现拓扑</span></div>`;
    return;
  }

  const { pos, contentH } = buildLayout(data.nodes, data.edges, W, H, vertical);
  const viewH = Math.max(H, contentH);

  const neighbors = new Map();
  for (const e of data.edges) {
    if (!neighbors.has(e.from)) neighbors.set(e.from, new Set());
    if (!neighbors.has(e.to)) neighbors.set(e.to, new Set());
    neighbors.get(e.from).add(e.to);
    neighbors.get(e.to).add(e.from);
  }

  const seenPair = new Map();
  const renderEdges = [];
  for (const e of data.edges) {
    const key = [e.from, e.to].sort().join('\u0000');
    const prev = seenPair.get(key);
    if (prev) {
      prev.bidir = true;
      prev.count += e.count;
      prev.inferred = prev.inferred && e.inferred;
      continue;
    }
    const item = { ...e, bidir: false };
    seenPair.set(key, item);
    renderEdges.push(item);
  }

  const arriveGroups = new Map();
  const leaveGroups = new Map();
  renderEdges.forEach((e, i) => {
    if (!arriveGroups.has(e.to)) arriveGroups.set(e.to, []);
    arriveGroups.get(e.to).push(i);
    if (!leaveGroups.has(e.from)) leaveGroups.set(e.from, []);
    leaveGroups.get(e.from).push(i);
  });
  const arriveOff = new Map();
  const leaveOff = new Map();
  const sortKey = vertical ? (n) => pos.get(n)?.x || 0 : (n) => pos.get(n)?.y || 0;
  for (const list of arriveGroups.values()) {
    list.sort((i, j) => sortKey(renderEdges[i].from) - sortKey(renderEdges[j].from));
    list.forEach((idx, j) => arriveOff.set(idx, spreadOffset(j, list.length)));
  }
  for (const list of leaveGroups.values()) {
    list.sort((i, j) => sortKey(renderEdges[i].to) - sortKey(renderEdges[j].to));
    list.forEach((idx, j) => leaveOff.set(idx, spreadOffset(j, list.length)));
  }

  const parts = [];
  parts.push(`<svg viewBox="0 0 ${W} ${viewH}" preserveAspectRatio="xMidYMid meet" role="img"
    ${viewH > H ? `style="height:${viewH}px"` : ''}>
    <defs>
      <marker id="garrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </marker>
    </defs>`);

  renderEdges.forEach((e, idx) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return;

    let d = '';
    let mid;
    if (vertical) {
      if (Math.abs(a.y - b.y) < 2) {
        const leftSide = b.x >= a.x;
        const x1 = a.x + (leftSide ? NW : 0);
        const x2 = b.x + (leftSide ? NW : 0);
        const y1 = a.y + NH / 2;
        const y2 = b.y + NH / 2;
        const c1 = [x1 + (leftSide ? 24 : -24), y1];
        const c2 = [x2 + (leftSide ? 24 : -24), y2];
        d = `M${x1} ${y1} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`;
        mid = [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8];
      } else {
        const down = b.y > a.y;
        const x1 = a.x + NW / 2 + (leaveOff.get(idx) || 0);
        const x2 = b.x + NW / 2 + (arriveOff.get(idx) || 0);
        const y1 = a.y + (down ? NH : 0);
        const y2 = b.y + (down ? 0 : NH);
        const dy = Math.max(22, Math.abs(y2 - y1) / 2) * (down ? 1 : -1);
        const c1 = [x1, y1 + dy];
        const c2 = [x2, y2 - dy];
        d = `M${x1} ${y1} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`;
        mid = [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8];
      }
    } else if (a.x === b.x) {
      const x = a.x + NW;
      const ay = a.y + NH / 2 + (leaveOff.get(idx) || 0);
      const by = b.y + NH / 2 + (arriveOff.get(idx) || 0);
      const c1 = [x + 62, ay];
      const c2 = [x + 62, by];
      d = `M${x} ${ay} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x} ${by}`;
      mid = [(x + 3 * c1[0] + 3 * c2[0] + x) / 8, (ay + 3 * c1[1] + 3 * c2[1] + by) / 8];
    } else if (b.x > a.x) {
      const x1 = a.x + NW;
      const x2 = b.x - 7;
      const ay = a.y + NH / 2 + (leaveOff.get(idx) || 0);
      const by = b.y + NH / 2 + (arriveOff.get(idx) || 0);
      const dx = Math.max(34, (x2 - x1) / 2);
      const c1 = [x1 + dx, ay];
      const c2 = [x2 - dx, by];
      d = `M${x1} ${ay} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${by}`;
      mid = [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (ay + 3 * c1[1] + 3 * c2[1] + by) / 8];
    } else {
      const x1 = a.x + NW / 2 + (leaveOff.get(idx) || 0);
      const x2 = b.x + NW / 2 + (arriveOff.get(idx) || 0);
      const lift = Math.min(a.y, b.y) > 74 ? 54 : -54;
      const y1 = a.y + (lift > 0 ? 0 : NH);
      const y2 = b.y + (lift > 0 ? 0 : NH);
      const c1 = [x1, a.y + lift];
      const c2 = [x2, b.y + lift];
      d = `M${x1} ${y1} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`;
      mid = [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8];
    }

    const isRelayDirect = e.from === 'relay' || e.to === 'relay';
    const isConsoleEdge = e.from === 'console' || e.to === 'console';
    const width = (isRelayDirect ? 1.05 : 1.5) + Math.min(e.count, 9) * (isRelayDirect ? 0.22 : 0.35);
    const dash = e.inferred ? ' stroke-dasharray="5 4"' : '';
    const markers = e.bidir
      ? ' marker-start="url(#garrow)" marker-end="url(#garrow)"'
      : ' marker-end="url(#garrow)"';
    const strokeCol = edgeColor(e, isLight, isAmber);
    const edgeClass = `gedge ${e.inferred ? '' : 'gedge-flow'}${isRelayDirect ? ' gedge-relay' : ''}${isConsoleEdge ? ' gedge-console' : ''}`;
    parts.push(`<path class="${edgeClass}" data-from="${esc(e.from)}" data-to="${esc(e.to)}"
      d="${d}" fill="none" stroke="${strokeCol}" stroke-width="${width.toFixed(2)}"${dash}${markers}
      opacity="${e.inferred ? 0.7 : (isRelayDirect ? 0.34 : 0.95)}"/>`);

    // 所有 >= 1 条的流向边均展示清晰的数量胶囊标签
    // 中继直达的单条边数量太多时不逐条贴标签，避免总览被 1 条胶囊淹没；悬停仍可看路径。
    if ((e.count >= 2 || !isRelayDirect || e.bidir) && !vertical) {
      const labelBg = isLight ? '#ffffff' : '#0b0f19';
      const labelFg = isLight ? '#0f172a' : '#eef2ff';
      const txt = `${e.count}条${e.bidir ? '⇄' : ''}`;
      const pillW = Math.max(34, txt.length * 7.5 + 10);
      parts.push(`
        <g class="gedge-lbl" data-from="${esc(e.from)}" data-to="${esc(e.to)}">
          <rect x="${(mid[0] - pillW / 2).toFixed(1)}" y="${(mid[1] - 9).toFixed(1)}" width="${pillW}" height="17" rx="8.5"
            fill="${labelBg}" stroke="${strokeCol}" stroke-width="1.1" opacity="0.94"/>
          <text x="${mid[0].toFixed(1)}" y="${(mid[1] + 3).toFixed(1)}" text-anchor="middle"
            font-size="9.5" font-weight="700" fill="${labelFg}"
            font-family="JetBrains Mono,ui-monospace,monospace">${txt}</text>
        </g>`);
    }
  });

  for (const n of data.nodes) {
    const p = pos.get(n.name);
    if (!p) continue;
    const virtual = n.virtual;
    const label = (n.display_name || n.name);
    let shown = label;
    if (label.length > (vertical ? 9 : 8)) shown = `${label.slice(0, vertical ? 9 : 8).trimEnd()}…`;
    const fill = isLight
      ? (virtual ? '#f1f5f9' : '#ffffff')
      : (virtual ? '#0d1320' : '#111827');
    const liveAct = virtual ? null : resolveMuseLiveAction(n, customMap, null, nowSec);
    const stroke = isLight
      ? (virtual ? '#94a3b8' : '#cbd5e1')
      : (virtual ? '#38bdf8' : (liveAct?.meta?.color || (isAmber ? 'rgba(255,196,107,0.38)' : 'rgba(69,230,245,0.38)')));
    const textMain = isLight ? '#0f172a' : '#eef2ff';
    const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
    const av = n.avatar || defaultAvatar(n.name);
    const pal = paletteFor(n.name);
    const badge = museBadgeText(n.name);
    const cx = p.x + 25;
    const cy = p.y + NH / 2;

    parts.push(`<g class="gnode${virtual ? ' virtual' : ''}" data-name="${esc(n.name)}">
      <rect class="box" x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="9"
        fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`);

    if (av) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="15" fill="${isLight ? '#eef4ff' : '#1e293b'}"/>
        <clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="15"/></clipPath>
        <image href="${esc(av)}" x="${cx - 15}" y="${cy - 15}" width="30" height="30"
          clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice"/>`);
    } else {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="15" fill="${pal.bg}" stroke="${pal.border}" stroke-width="1"/>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11"
          font-weight="700" fill="${pal.fg}">${esc(initial(label))}</text>`);
    }

    if (badge) {
      parts.push(`<rect x="${cx - 18}" y="${cy - 18}" width="19" height="12" rx="4" fill="#2563eb"/>
        <text x="${cx - 8.5}" y="${cy - 9.5}" text-anchor="middle" font-size="8" font-weight="700" fill="#fff"
          font-family="JetBrains Mono,monospace">${esc(badge)}</text>`);
    }

    const dotColor = { online: '#35e08a', active: '#45e6f5', idle: '#ffc21a', silent: '#64748b', empty: '#475569' }[n.status] || '#64748b';
    parts.push(`<circle cx="${cx + 11}" cy="${cy - 11}" r="4" fill="${dotColor}" stroke="${fill}" stroke-width="1.5"/>`);

    const inCol = isLight ? '#2563eb' : '#45e6f5';
    const outCol = isLight ? '#16a34a' : '#35e08a';
    const actIcon = liveAct ? `${liveAct.meta.icon} ` : (virtual ? '💠 ' : '');
    parts.push(`<text x="${p.x + 48}" y="${p.y + 21}" font-size="12" font-weight="700" fill="${textMain}">${actIcon}${esc(shown)}</text>
      <text x="${p.x + 48}" y="${p.y + 39}" font-size="10" font-family="JetBrains Mono,ui-monospace,monospace">
        <tspan fill="${inCol}" font-weight="600">↓${n.inbound}</tspan>
        <tspan fill="#64748b">·</tspan>
        <tspan fill="${outCol}" font-weight="600">↑${n.outbound}</tspan>
        <tspan fill="#94a3b8"> (Σ${n.volume || (n.inbound + n.outbound)})</tspan>
      </text>
      <title>${esc(label)} · 收 ${n.inbound} / 发 ${n.outbound} / 共 ${n.volume || 0} 条${liveAct ? ` · 当前动作: ${liveAct.actionText}` : ''}</title>
    </g>`);
  }

  parts.push('</svg>');
  host.innerHTML = parts.join('');

  host.querySelectorAll('.gnode').forEach((g) => {
    const name = g.dataset.name;
    const related = neighbors.get(name) || new Set();

    g.addEventListener('mouseenter', () => {
      host.querySelectorAll('.gedge, .gedge-lbl').forEach((edge) => {
        const on = edge.dataset.from === name || edge.dataset.to === name;
        edge.style.opacity = on ? '1' : '0.08';
      });
      host.querySelectorAll('.gnode').forEach((other) => {
        const otherName = other.dataset.name;
        other.classList.toggle('dim', otherName !== name && !related.has(otherName));
      });
    });

    g.addEventListener('mouseleave', () => {
      host.querySelectorAll('.gedge, .gedge-lbl').forEach((edge) => { edge.style.opacity = ''; });
      host.querySelectorAll('.gnode').forEach((other) => other.classList.remove('dim'));
    });

    if (!g.classList.contains('virtual') && ctx) {
      g.addEventListener('click', () => ctx.go('chat', { agent: name }));
      g.style.cursor = 'pointer';
    }
  });
}
