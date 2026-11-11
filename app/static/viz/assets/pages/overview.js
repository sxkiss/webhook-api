import { api, store } from '../api.js';
import {
  esc, num, fmtTime, defaultAvatar, initial, debounce,
  paletteFor, museBadgeText, resolveMuseLiveAction,
} from '../ui.js';

const NW = 186;
const NH = 56;
const NARROW = 680;

const state = {
  win: '24h',
  inferred: true,
  layoutMode: 'wing', // 'wing' (对称双翼总线) | 'layer' (分层流向)
  hideWeak: false,    // 是否精简弱连线 (<2条的非跨工位连线)
  pinnedNode: null,   // 点击枢纽节点可锁定高亮
  data: null,
};
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
  state.pinnedNode = null;

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
          <div class="seg" id="layoutSeg" title="切换拓扑布局算法">
            <button data-layout="wing" class="${state.layoutMode === 'wing' ? 'on' : ''}">双翼总线</button>
            <button data-layout="layer" class="${state.layoutMode === 'layer' ? 'on' : ''}">分层流向</button>
          </div>
          <div class="seg" id="winSeg">
            ${Object.entries({ '1h': '1H', '24h': '24H', '7d': '7D' }).map(([v, label]) =>
              `<button data-win="${v}" class="${v === state.win ? 'on' : ''}">${label}</button>`).join('')}
          </div>
          <button class="btn ghost sm" id="weakBtn" title="隐藏仅有 1 条流量的弱连接，专注主力信道">精简弱边</button>
          <button class="btn ghost sm" id="inferBtn">推断边</button>
          <button class="btn ghost sm" id="go3dBtn" title="切换到 3D 实时工位观看动作">🏛️ 3D 工位</button>
        </div>
        <div class="graph-body" id="graphBody">
          <div class="empty-state"><span>正在计算链路与去向…</span></div>
        </div>
        <div class="legend" id="legend">
          <span><i></i>中继核心直连</span>
          <span><i style="border-color:#ff3f8e"></i>跨工位精确协同</span>
          <span><i class="dash"></i>时序推断去向</span>
          <span><i style="border-color:#a855f7"></i>控制台通道</span>
          <span style="margin-left:auto;opacity:0.85">悬停/点击节点高亮关联连线与精确条数 · 点击工位进通信台</span>
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
  const weakBtn = root.querySelector('#weakBtn');
  const go3dBtn = root.querySelector('#go3dBtn');

  const syncButtons = () => {
    inferBtn.textContent = state.inferred ? '推断边 · 开' : '推断边 · 关';
    weakBtn.classList.toggle('on', state.hideWeak);
    weakBtn.textContent = state.hideWeak ? '精简模式 · 开' : '精简弱边';
  };
  syncButtons();

  if (go3dBtn) {
    go3dBtn.onclick = () => ctx.go('workstations');
  }

  root.querySelector('#layoutSeg').onclick = (event) => {
    const btn = event.target.closest('button[data-layout]');
    if (!btn || btn.dataset.layout === state.layoutMode) return;
    state.layoutMode = btn.dataset.layout;
    root.querySelectorAll('#layoutSeg button').forEach((b) => b.classList.toggle('on', b === btn));
    if (state.data) drawGraph(host, state.data, ctxRef);
  };

  root.querySelector('#winSeg').onclick = (event) => {
    const btn = event.target.closest('button[data-win]');
    if (!btn || btn.dataset.win === state.win) return;
    state.win = btn.dataset.win;
    root.querySelectorAll('#winSeg button').forEach((b) => b.classList.toggle('on', b === btn));
    load(root, host, feedList);
  };

  weakBtn.onclick = () => {
    state.hideWeak = !state.hideWeak;
    syncButtons();
    if (state.data) drawGraph(host, state.data, ctxRef);
  };

  inferBtn.onclick = () => {
    state.inferred = !state.inferred;
    syncButtons();
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
  }, 160));
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
    let [overview, lineage, events] = await Promise.all([
      api.overview(state.win),
      api.lineage(state.win, state.inferred),
      api.events(28),
    ]);
    const agents = overview.agents || [];
    store.setAgents(agents);

    // 若当前窗口(如 1H/24H)暂无新消息但历史有信箱工位，自动回退拉取 7D 链路或按历史累计构建拓扑，避免画面空白
    if ((!lineage.nodes || !lineage.nodes.length) && agents.length > 0) {
      if (state.win !== '7d') {
        const l7 = await api.lineage('7d', state.inferred).catch(() => null);
        if (l7?.nodes?.length) lineage = l7;
      }
      if (!lineage.nodes || !lineage.nodes.length) {
        const totalIn = agents.reduce((s, a) => s + (a.inbound || 0), 0);
        const totalOut = agents.reduce((s, a) => s + (a.outbound || 0), 0);
        lineage = {
          nodes: [
            { name: 'relay', display_name: '中继核心', virtual: true, inbound: totalIn, outbound: totalOut, volume: totalIn + totalOut, status: 'online' },
            ...agents.map((a) => ({ ...a, volume: a.total || (a.inbound + a.outbound) || 0, virtual: false })),
          ],
          edges: agents
            .filter((a) => (a.total || a.inbound || a.outbound) > 0)
            .map((a) => ({
              from: (a.inbound || 0) >= (a.outbound || 0) ? a.name : 'relay',
              to: (a.inbound || 0) >= (a.outbound || 0) ? 'relay' : a.name,
              count: Math.max(1, (a.inbound || 0) + (a.outbound || 0)),
              confidence: 0.9,
              inferred: false,
            })),
        };
      }
    }

    state.data = lineage;
    renderKpis(root, overview, lineage);
    drawGraph(host, lineage, ctxRef);
    renderFlowDestinations(root, lineage, agents);
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
    `${lineage.nodes.filter((n) => !n.virtual).length} 工位 · ${lineage.edges.length} 链路 · ${num(k.messages)} 报文`;
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

  const sorted = [...edges].sort((a, b) => {
    const ca = (a.from !== 'relay' && a.from !== 'console' && a.to !== 'relay' && a.to !== 'console') ? 1 : 0;
    const cb = (b.from !== 'relay' && b.from !== 'console' && b.to !== 'relay' && b.to !== 'console') ? 1 : 0;
    if (ca !== cb) return cb - ca;
    return (b.count || 0) - (a.count || 0);
  });

  box.innerHTML = sorted.map((e) => {
    const isCross = e.from !== 'relay' && e.from !== 'console' && e.to !== 'relay' && e.to !== 'console';
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

/* ── 对称双翼总线布局（彻底解决左2右14倾斜交叉一团乱） ── */
function buildWingLayout(nodes, edges, W, H) {
  const pos = new Map();
  const sideOf = new Map(); // 'hub' | 'left' | 'right'

  const hubs = nodes.filter((n) => n.virtual || n.name === 'relay' || n.name === 'console');
  // 排序：relay 在上，console 在下
  hubs.sort((a, b) => (a.name === 'relay' ? -1 : b.name === 'relay' ? 1 : (b.volume || 0) - (a.volume || 0)));

  const peers = nodes
    .filter((n) => !hubs.includes(n))
    .sort((a, b) => (b.volume || b.inbound + b.outbound || 0) - (a.volume || a.inbound + a.outbound || 0));

  // 左右双翼蛇形/均衡分摊（高流量的交替分到左右两侧，让两翼流量负载均衡）
  const leftNodes = [];
  const rightNodes = [];
  peers.forEach((n, i) => {
    if (i % 2 === 0) {
      leftNodes.push(n);
      sideOf.set(n.name, 'left');
    } else {
      rightNodes.push(n);
      sideOf.set(n.name, 'right');
    }
  });
  hubs.forEach((h) => sideOf.set(h.name, 'hub'));

  const rowGap = 14;
  const maxWing = Math.max(1, leftNodes.length, rightNodes.length);
  const needH = Math.max(H, maxWing * (NH + rowGap) + 68);

  const hubX = (W - NW) / 2;
  const leftX = Math.max(24, Math.min(hubX - NW - 120, W * 0.05));
  const rightX = Math.min(W - NW - 24, Math.max(hubX + NW + 120, W * 0.95 - NW));

  // 居中放置中枢（relay / console 留出足够垂直间距，让两条总线明确分离）
  const hubGap = Math.min(130, Math.max(72, (needH - hubs.length * NH) / (hubs.length + 1)));
  const hubTotalH = hubs.length * NH + Math.max(0, hubs.length - 1) * hubGap;
  const hubStartY = (needH - hubTotalH) / 2;
  hubs.forEach((h, i) => {
    pos.set(h.name, { x: hubX, y: hubStartY + i * (NH + hubGap), role: 'hub' });
  });

  const placeWing = (list, x, role) => {
    if (!list.length) return;
    const total = list.length * NH + (list.length - 1) * rowGap;
    const startY = Math.max(26, (needH - total) / 2);
    list.forEach((n, i) => {
      pos.set(n.name, { x, y: startY + i * (NH + rowGap), role });
    });
  };
  placeWing(leftNodes, leftX, 'left');
  placeWing(rightNodes, rightX, 'right');

  // 计算左右干线 X 坐标，确保绿线(relay) 与 紫粉线(console) 严格分层并行，绝不在中央交叉
  const leftSpan = hubX - (leftX + NW);
  const rightSpan = rightX - (hubX + NW);
  const trunks = {
    leftRelayX: leftX + NW + leftSpan * 0.42,
    leftConsoleX: leftX + NW + leftSpan * 0.62,
    rightRelayX: hubX + NW + rightSpan * 0.58,
    rightConsoleX: hubX + NW + rightSpan * 0.38,
    hubX,
    leftX,
    rightX,
  };

  return { pos, sideOf, contentH: needH, trunks };
}

/* ── 分层布局：支持横向多列网格自适应，不把14个挤成一条长龙 ── */
function buildLayerLayout(nodes, edges, W, H, vertical) {
  const pos = new Map();
  const sideOf = new Map();
  if (!nodes.length) return { pos, sideOf, contentH: H, trunks: null };

  const hubs = nodes.filter((n) => n.virtual || n.name === 'relay' || n.name === 'console');
  const peers = nodes
    .filter((n) => !hubs.includes(n))
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));

  if (vertical) {
    const padX = 14;
    let y = 16;
    const cols = Math.max(1, Math.floor((W - padX * 2) / (NW + 12)));
    const placeGrid = (list, role) => {
      for (let i = 0; i < list.length; i += cols) {
        const chunk = list.slice(i, i + cols);
        const gap = chunk.length > 1 ? Math.max(10, (W - padX * 2 - chunk.length * NW) / (chunk.length - 1)) : 0;
        const startX = chunk.length > 1 ? padX : (W - NW) / 2;
        chunk.forEach((n, j) => {
          pos.set(n.name, { x: startX + j * (NW + gap), y, role });
          sideOf.set(n.name, role);
        });
        y += NH + 18;
      }
    };
    placeGrid(hubs, 'hub');
    y += 14;
    placeGrid(peers, 'right');
    return { pos, sideOf, contentH: Math.max(H, y + 18), trunks: null };
  }

  // 宽屏分层：左列 Hub、右侧最多 2 列均衡工位矩阵，避免单列 14 行高耸拥挤
  const rowGap = 14;
  const colCount = peers.length > 9 ? 2 : 1;
  const perCol = Math.ceil(peers.length / colCount);
  const needH = Math.max(H, perCol * (NH + rowGap) + 64);

  const hubX = Math.max(28, W * 0.06);
  const hubGap = Math.min(130, Math.max(68, (needH - hubs.length * NH) / (hubs.length + 1)));
  const hubStartY = (needH - (hubs.length * NH + Math.max(0, hubs.length - 1) * hubGap)) / 2;
  hubs.forEach((h, i) => {
    pos.set(h.name, { x: hubX, y: hubStartY + i * (NH + hubGap), role: 'hub' });
    sideOf.set(h.name, 'hub');
  });

  const rightStartX = colCount === 2 ? Math.max(hubX + NW + 120, W * 0.43) : Math.max(hubX + NW + 160, W - NW - 48);
  const colStep = colCount === 2 ? Math.max(NW + 44, (W - 28 - rightStartX) / 2) : 0;

  for (let c = 0; c < colCount; c += 1) {
    const chunk = peers.slice(c * perCol, (c + 1) * perCol);
    const total = chunk.length * NH + Math.max(0, chunk.length - 1) * rowGap;
    const startY = Math.max(26, (needH - total) / 2);
    const x = Math.min(W - NW - 20, rightStartX + c * colStep);
    chunk.forEach((n, i) => {
      pos.set(n.name, { x, y: startY + i * (NH + rowGap), role: 'right' });
      sideOf.set(n.name, 'right');
    });
  }

  return { pos, sideOf, contentH: needH, trunks: null };
}

function edgeColor(edge, isLight, isAmber) {
  const isCross = edge.from !== 'relay' && edge.from !== 'console' && edge.to !== 'relay' && edge.to !== 'console';
  if (isCross && !edge.inferred) return '#ff3f8e';
  if (isCross && edge.inferred) return '#ffc21a';
  if (edge.from === 'console' || edge.to === 'console') return '#a855f7';
  if (edge.confidence >= 0.85) return isAmber ? '#ffc46b' : (isLight ? '#2563eb' : '#45e6f5');
  return isAmber ? '#d99b43' : (isLight ? '#16a34a' : '#35e08a');
}

/* ── 生成平滑的正交圆角总线路径，零中央交叉大乱炖 ── */
function buildBundledPath(a, b, edge, trunks, crossIdx) {
  const isCross = edge.from !== 'relay' && edge.from !== 'console' && edge.to !== 'relay' && edge.to !== 'console';
  const aIsHub = a.role === 'hub';
  const bIsHub = b.role === 'hub';

  // 1) 跨工位直连 (Muse ↔ Muse)：外侧优雅拱形弧线，完全绕开中间枢纽总线
  if (isCross) {
    if (a.role === b.role) {
      const outerSide = a.role === 'left' ? -1 : 1;
      const ax = a.role === 'left' ? a.x : a.x + NW;
      const bx = b.role === 'left' ? b.x : b.x + NW;
      const ay = a.y + NH / 2;
      const by = b.y + NH / 2;
      const bow = (36 + (crossIdx % 4) * 14) * outerSide;
      const c1 = [ax + bow, ay];
      const c2 = [bx + bow, by];
      return {
        d: `M${ax} ${ay} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${bx} ${by}`,
        pillPos: [(ax + 3 * c1[0] + 3 * c2[0] + bx) / 8, (ay + 3 * c1[1] + 3 * c2[1] + by) / 8],
        isCross: true,
      };
    }
    const leftSide = b.x > a.x;
    const x1 = leftSide ? a.x + NW : a.x;
    const x2 = leftSide ? b.x : b.x + NW;
    const y1 = a.y + NH / 2;
    const y2 = b.y + NH / 2;
    const archY = Math.min(y1, y2) - 48 - (crossIdx % 3) * 14;
    const c1 = [x1 + (leftSide ? 70 : -70), archY];
    const c2 = [x2 + (leftSide ? -70 : 70), archY];
    return {
      d: `M${x1} ${y1} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`,
      pillPos: [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8],
      isCross: true,
    };
  }

  // 2) 中继核心/控制台 ↔ 双翼工位：顺滑总线分支（先垂直贴干线，再水平入端口，胶囊停靠在入口直段绝不重叠！）
  if (trunks && (aIsHub || bIsHub)) {
    const hub = aIsHub ? a : b;
    const peer = aIsHub ? b : a;
    const isConsole = edge.from === 'console' || edge.to === 'console';
    const goLeft = peer.role === 'left';

    const hx = goLeft ? hub.x : hub.x + NW;
    const hy = hub.y + NH / 2;
    const px = goLeft ? peer.x + NW : peer.x;
    // 同一个工位的两条线：relay 接卡片上部(36%)，console 接卡片下部(68%)，端口严格分离！
    const py = peer.y + (isConsole ? NH * 0.68 : NH * 0.34);

    const trunkX = goLeft
      ? (isConsole ? trunks.leftConsoleX : trunks.leftRelayX)
      : (isConsole ? trunks.rightConsoleX : trunks.rightRelayX);

    // SVG 曲线起点/终点按 edge.from -> edge.to 方向，让箭头方向正确
    const sx = aIsHub ? hx : px;
    const sy = aIsHub ? hy : py;
    const ex = aIsHub ? px : hx;
    const ey = aIsHub ? py : hy;

    const c1x = trunkX;
    const c1y = sy;
    const c2x = trunkX;
    const c2y = ey;

    // 悬停时显示的数值胶囊放在“靠近工位卡片内侧 28px”的端口直线上 -> 与邻居工位永不碰撞！
    const pillX = goLeft ? px + 34 : px - 34;
    const pillY = py;

    return {
      d: `M${sx} ${sy} C${c1x} ${c1y} ${c2x} ${c2y} ${ex} ${ey}`,
      pillPos: [pillX, pillY],
      isCross: false,
      isConsole,
    };
  }

  // 3) 分层流向模式 fallback
  const goRight = b.x >= a.x;
  const x1 = goRight ? a.x + NW : a.x;
  const x2 = goRight ? b.x - 5 : b.x + NW + 5;
  const y1 = a.y + NH / 2;
  const y2 = b.y + NH / 2;
  const dx = Math.max(36, Math.abs(x2 - x1) * 0.48) * (goRight ? 1 : -1);
  const c1 = [x1 + dx, y1];
  const c2 = [x2 - dx, y2];
  // 标签同样放在 t=0.82 贴近目标节点处，避免中心扎堆
  const t = 0.82;
  const mt = 1 - t;
  const px = mt * mt * mt * x1 + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * x2;
  const py = mt * mt * mt * y1 + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * y2;
  return {
    d: `M${x1} ${y1} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${x2} ${y2}`,
    pillPos: [px, py],
    isCross: false,
    isConsole: edge.from === 'console' || edge.to === 'console',
  };
}

function drawGraph(host, data, ctx) {
  const W = Math.max(host.clientWidth || 640, 300);
  const H = Math.max(host.clientHeight || 340, 220);
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

  // 合并双向边
  const seenPair = new Map();
  const mergedEdges = [];
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
    mergedEdges.push(item);
  }

  const renderEdges = state.hideWeak
    ? mergedEdges.filter((e) => {
        const isCross = e.from !== 'relay' && e.from !== 'console' && e.to !== 'relay' && e.to !== 'console';
        return isCross || (e.count || 0) >= 2;
      })
    : mergedEdges;

  // 统计每个节点的 中继/控制台/跨节点 往来条数，用于直接集成到工位卡片内展示
  const peerEdgeMeta = new Map();
  for (const e of mergedEdges) {
    const addMeta = (peer, hub) => {
      if (!peerEdgeMeta.has(peer)) peerEdgeMeta.set(peer, { relay: 0, console: 0, cross: 0 });
      const m = peerEdgeMeta.get(peer);
      if (hub === 'relay') m.relay += e.count || 0;
      else if (hub === 'console') m.console += e.count || 0;
      else m.cross += e.count || 0;
    };
    if (e.from === 'relay' || e.from === 'console') addMeta(e.to, e.from);
    else if (e.to === 'relay' || e.to === 'console') addMeta(e.from, e.to);
    else {
      addMeta(e.from, 'cross');
      addMeta(e.to, 'cross');
    }
  }

  const useWing = state.layoutMode === 'wing' && !vertical;
  const layout = useWing
    ? buildWingLayout(data.nodes, renderEdges, W, H)
    : buildLayerLayout(data.nodes, renderEdges, W, H, vertical);
  const { pos, contentH, trunks } = layout;
  const viewH = Math.max(H, contentH);

  const neighbors = new Map();
  for (const e of renderEdges) {
    if (!neighbors.has(e.from)) neighbors.set(e.from, new Set());
    if (!neighbors.has(e.to)) neighbors.set(e.to, new Set());
    neighbors.get(e.from).add(e.to);
    neighbors.get(e.to).add(e.from);
  }

  const parts = [];
  parts.push(`<svg viewBox="0 0 ${W} ${viewH}" preserveAspectRatio="xMidYMin meet" role="img"
    style="height:${viewH}px">
    <defs>
      <marker id="garrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto-start-reverse">
        <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </marker>
    </defs>`);

  // 绘制双翼对称干道淡淡的导向轨线，帮助视觉对齐
  if (trunks) {
    const railCol = isLight ? 'rgba(15,23,42,0.08)' : 'rgba(148,163,184,0.12)';
    parts.push(`<g pointer-events="none">
      <line x1="${trunks.leftRelayX}" y1="24" x2="${trunks.leftRelayX}" y2="${viewH - 24}" stroke="${railCol}" stroke-dasharray="3 5"/>
      <line x1="${trunks.rightRelayX}" y1="24" x2="${trunks.rightRelayX}" y2="${viewH - 24}" stroke="${railCol}" stroke-dasharray="3 5"/>
    </g>`);
  }

  let crossIdx = 0;
  const labelBg = isLight ? '#ffffff' : '#0b0f19';
  const labelFg = isLight ? '#0f172a' : '#eef2ff';

  renderEdges.forEach((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) return;

    const geo = buildBundledPath(a, b, e, trunks, crossIdx);
    if (geo.isCross) crossIdx += 1;

    const strokeCol = edgeColor(e, isLight, isAmber);
    const width = geo.isCross
      ? (2.0 + Math.min(e.count, 8) * 0.35)
      : (1.25 + Math.min(e.count, 8) * 0.25);

    // 平时柔和不抢戏（控制台虚线轻盈、中继清晰、跨节点最亮）；悬停或选中相关节点时 100% 点亮
    const baseOpacity = geo.isCross ? 0.94 : (geo.isConsole ? 0.36 : 0.62);
    const dash = (e.inferred && !geo.isCross) ? ' stroke-dasharray="4 4"' : '';
    const markers = e.bidir
      ? ' marker-start="url(#garrow)" marker-end="url(#garrow)"'
      : ' marker-end="url(#garrow)"';

    parts.push(`<path class="gedge ${geo.isCross || (!e.inferred && e.count >= 3) ? 'gedge-flow' : ''}"
      data-from="${esc(e.from)}" data-to="${esc(e.to)}" data-baseop="${baseOpacity}"
      d="${geo.d}" fill="none" stroke="${strokeCol}" stroke-width="${width.toFixed(2)}"${dash}${markers}
      opacity="${baseOpacity}"/>`);

    // 标签胶囊：跨工位弧线常驻展示，中继/控制台线仅在 >= 4 条时微显，悬停关联节点时全部完整浮现 -> 彻底告别中间重叠一团！
    const showDefaultLbl = !vertical && (geo.isCross || e.count >= 6);
    if (e.count >= 1 && !vertical) {
      const txt = `${e.count}条${e.bidir ? '⇄' : ''}`;
      const pillW = Math.max(34, txt.length * 7.2 + 10);
      parts.push(`
        <g class="gedge-lbl" data-from="${esc(e.from)}" data-to="${esc(e.to)}"
          data-default="${showDefaultLbl ? '1' : '0'}"
          style="opacity:${showDefaultLbl ? 0.92 : 0};pointer-events:none">
          <rect x="${(geo.pillPos[0] - pillW / 2).toFixed(1)}" y="${(geo.pillPos[1] - 8.5).toFixed(1)}" width="${pillW}" height="17" rx="8.5"
            fill="${labelBg}" stroke="${strokeCol}" stroke-width="1.1"/>
          <text x="${geo.pillPos[0].toFixed(1)}" y="${(geo.pillPos[1] + 3).toFixed(1)}" text-anchor="middle"
            font-size="9.5" font-weight="700" fill="${labelFg}"
            font-family="JetBrains Mono,ui-monospace,monospace">${txt}</text>
        </g>`);
    }
  });

  // 绘制节点卡片（内置 中/控/协 端口数字，重名节点附短标识）
  for (const n of data.nodes) {
    const p = pos.get(n.name);
    if (!p) continue;
    const virtual = n.virtual || n.name === 'relay' || n.name === 'console';
    const label = n.display_name || n.name;
    let shown = label;
    if (label.length > 9) shown = `${label.slice(0, 9).trimEnd()}…`;

    const fill = isLight
      ? (virtual ? '#eef4ff' : '#ffffff')
      : (virtual ? '#0d1628' : '#111827');
    const liveAct = virtual ? null : resolveMuseLiveAction(n, customMap, null, nowSec);
    const stroke = isLight
      ? (virtual ? '#3b82f6' : '#cbd5e1')
      : (virtual ? '#45e6f5' : (liveAct?.meta?.color || (isAmber ? 'rgba(255,196,107,0.42)' : 'rgba(69,230,245,0.4)')));
    const textMain = isLight ? '#0f172a' : '#eef2ff';
    const clipId = `clip-${Math.random().toString(36).slice(2, 8)}`;
    const av = n.avatar || defaultAvatar(n.name);
    const pal = paletteFor(n.name);
    const badge = museBadgeText(n.name) || (!virtual && n.name !== label ? n.name.slice(0, 4) : '');
    const cx = p.x + 24;
    const cy = p.y + NH / 2;
    const pm = peerEdgeMeta.get(n.name);

    const isPinned = state.pinnedNode === n.name;
    parts.push(`<g class="gnode${virtual ? ' virtual' : ''}${isPinned ? ' pinned' : ''}" data-name="${esc(n.name)}">
      <rect class="box" x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="9"
        fill="${fill}" stroke="${isPinned ? '#ffc21a' : stroke}" stroke-width="${isPinned ? 2.2 : (virtual ? 1.8 : 1.35)}"/>`);

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
      parts.push(`<rect x="${cx - 18}" y="${cy - 19}" width="21" height="12" rx="4" fill="#2563eb"/>
        <text x="${cx - 7.5}" y="${cy - 10.5}" text-anchor="middle" font-size="7.5" font-weight="700" fill="#fff"
          font-family="JetBrains Mono,monospace">${esc(badge.slice(0, 4))}</text>`);
    }

    const dotColor = { online: '#35e08a', active: '#45e6f5', idle: '#ffc21a', silent: '#64748b', empty: '#475569' }[n.status] || '#64748b';
    parts.push(`<circle cx="${cx + 11}" cy="${cy - 11}" r="4" fill="${dotColor}" stroke="${fill}" stroke-width="1.5"/>`);

    const inCol = isLight ? '#2563eb' : '#45e6f5';
    const outCol = isLight ? '#16a34a' : '#35e08a';
    const actIcon = liveAct ? `${liveAct.meta.icon} ` : (n.name === 'relay' ? '💠 ' : '🎛 ');

    // 第一行：动作图标 + 名称
    parts.push(`<text x="${p.x + 46}" y="${p.y + 20}" font-size="11.5" font-weight="700" fill="${textMain}">${actIcon}${esc(shown)}</text>`);

    // 第二行：收/发总数 + (对于工位)内置去向速览 `中x·控y`
    let routeSub = '';
    if (!virtual && pm) {
      const rStr = pm.relay ? `中${pm.relay}` : '';
      const cStr = pm.console ? `控${pm.console}` : '';
      const xStr = pm.cross ? `协${pm.cross}` : '';
      const joined = [rStr, cStr, xStr].filter(Boolean).join('·');
      if (joined) routeSub = ` <tspan fill="#94a3b8">| ${esc(joined)}</tspan>`;
    } else if (virtual) {
      routeSub = ` <tspan fill="#94a3b8">(总${n.volume || (n.inbound + n.outbound)})</tspan>`;
    }

    parts.push(`<text x="${p.x + 46}" y="${p.y + 39}" font-size="9.5" font-family="JetBrains Mono,ui-monospace,monospace">
        <tspan fill="${inCol}" font-weight="700">↓${n.inbound}</tspan>
        <tspan fill="#64748b">·</tspan>
        <tspan fill="${outCol}" font-weight="700">↑${n.outbound}</tspan>${routeSub}
      </text>
      <title>${esc(label)} (${esc(n.name)}) · ↓收 ${n.inbound} / ↑发 ${n.outbound}${liveAct ? ` · 当前动作: ${liveAct.actionText}` : ''}</title>
    </g>`);
  }

  parts.push('</svg>');
  host.innerHTML = parts.join('');

  const applyFocus = (name) => {
    if (!name) {
      host.querySelectorAll('.gedge').forEach((edge) => { edge.style.opacity = edge.dataset.baseop || '0.62'; });
      host.querySelectorAll('.gedge-lbl').forEach((lbl) => { lbl.style.opacity = lbl.dataset.default === '1' ? '0.92' : '0'; });
      host.querySelectorAll('.gnode').forEach((other) => other.classList.remove('dim'));
      return;
    }
    const related = neighbors.get(name) || new Set();
    host.querySelectorAll('.gedge').forEach((edge) => {
      const on = edge.dataset.from === name || edge.dataset.to === name;
      edge.style.opacity = on ? '1' : '0.06';
    });
    host.querySelectorAll('.gedge-lbl').forEach((lbl) => {
      const on = lbl.dataset.from === name || lbl.dataset.to === name;
      lbl.style.opacity = on ? '1' : '0';
    });
    host.querySelectorAll('.gnode').forEach((other) => {
      const otherName = other.dataset.name;
      other.classList.toggle('dim', otherName !== name && !related.has(otherName));
    });
  };

  if (state.pinnedNode) {
    applyFocus(state.pinnedNode);
  }

  host.querySelectorAll('.gnode').forEach((g) => {
    const name = g.dataset.name;
    g.addEventListener('mouseenter', () => applyFocus(name));
    g.addEventListener('mouseleave', () => applyFocus(state.pinnedNode));
    g.addEventListener('click', () => {
      if (g.classList.contains('virtual')) {
        state.pinnedNode = state.pinnedNode === name ? null : name;
        drawGraph(host, state.data, ctx);
      } else if (ctx) {
        ctx.go('chat', { agent: name });
      }
    });
    g.style.cursor = 'pointer';
  });
}
