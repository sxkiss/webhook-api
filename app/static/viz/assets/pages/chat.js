import { api, store } from '../api.js';
import {
  esc, num, icon, fmtTime, fmtDay, rel, statusText, defaultAvatar, initial,
  toast, debounce, paletteFor, museBadgeText, resolveMuseLiveAction, openMuseActionModal,
} from '../ui.js';

const S = {
  agents: [],
  last: new Map(),
  selected: null,
  msgs: [],
  oldest: null,
  unread: new Map(),
  pending: null,
  ctx: null,
  els: {},
  filter: '',
  dirFilter: '',
  msgQuery: '',
  messageCache: new Map(),
  loading: false,
  exhausted: false,
  gen: 0,
};

export async function mount(root, ctx) {
  S.ctx = ctx;
  S.selected = null;
  S.msgs = [];
  S.unread.clear();
  S.filter = '';
  S.dirFilter = '';
  S.msgQuery = '';
  const preselect = ctx.params?.agent || null;

  root.innerHTML = `
    <div class="pg-chat" id="chatPage">
      <div class="thread-list">
        <div class="thread-search">
          <input type="search" id="threadSearch" placeholder="搜索信箱或动作…" autocomplete="off">
        </div>
        <div class="threads" id="threads">
          <div class="empty-state"><span>加载中…</span></div>
        </div>
      </div>

      <div class="chat-main" id="chatMain">
        <div class="chat-head">
          <button class="iconbtn only-mobile" id="backBtn" title="返回列表">${icon('caret', 16)}</button>
          <div id="headAv" style="width:32px;height:32px;flex:none;display:grid;place-items:center"></div>
          <div style="min-width:0">
            <h2 id="headName">选择信箱</h2>
            <div class="sub" id="headSub">从左边挑一个信箱开始对话</div>
          </div>
          <span class="spacer" style="flex:1"></span>
          <div class="seg" id="chatDirSeg" title="按方向筛选消息">
            <button data-dir="" class="on">全部</button>
            <button data-dir="inbound">仅收</button>
            <button data-dir="outbound">仅发</button>
          </div>
          <input type="search" id="msgSearch" placeholder="搜消息…" style="width:128px;padding:4px 8px;font-size:12px" autocomplete="off">
          <button class="iconbtn" id="refreshChatBtn" title="刷新当前会话">${icon('refresh', 13)}</button>
          <span class="chip" id="headChip" hidden></span>
        </div>

        <div class="chat-scroll" id="chatScroll">
          <div class="empty-state">
            <b>还没有选信箱</b><span>左侧列出了所有被自动检测到的信箱</span>
          </div>
        </div>

        <div class="composer">
          <div class="tools">
            <button class="iconbtn" id="attachBtn" title="发送图片 / 文件">${icon('paperclip', 14)}</button>
            <span id="attachChip" class="muted" style="font-size:12px"></span>
            <select id="sendDirection" title="选择消息去向" style="margin-left:auto;width:auto;min-width:136px">
              <option value="inbound">↓ 发给 Muse (入站)</option>
              <option value="outbound">↑ 模拟 Muse 回复 (出站)</option>
            </select>
            <input type="file" id="fileInput" hidden>
          </div>
          <div class="row">
            <textarea id="input" placeholder="写消息（支持 Ctrl+V 粘贴图片 / 拖拽文件上传）…" rows="1" disabled></textarea>
            <button class="btn" id="sendBtn" disabled>${icon('send', 14)}发送</button>
          </div>
        </div>
      </div>

      <aside class="chat-side" id="chatSide"></aside>
    </div>`;

  S.els = {
    page: root.querySelector('#chatPage'),
    main: root.querySelector('#chatMain'),
    threads: root.querySelector('#threads'),
    scroll: root.querySelector('#chatScroll'),
    input: root.querySelector('#input'),
    sendBtn: root.querySelector('#sendBtn'),
    attachBtn: root.querySelector('#attachBtn'),
    attachChip: root.querySelector('#attachChip'),
    direction: root.querySelector('#sendDirection'),
    fileInput: root.querySelector('#fileInput'),
    headName: root.querySelector('#headName'),
    headSub: root.querySelector('#headSub'),
    headAv: root.querySelector('#headAv'),
    headChip: root.querySelector('#headChip'),
    side: root.querySelector('#chatSide'),
    dirSeg: root.querySelector('#chatDirSeg'),
    msgSearch: root.querySelector('#msgSearch'),
  };

  root.querySelector('#threadSearch').oninput = (e) => {
    S.filter = e.target.value.trim().toLowerCase();
    renderThreads();
  };
  root.querySelector('#backBtn').onclick = () => {
    S.els.page.classList.remove('thread-open');
  };
  root.querySelector('#refreshChatBtn').onclick = () => {
    if (S.selected) open(S.selected);
    else loadThreads();
  };
  S.els.dirSeg.onclick = (e) => {
    const btn = e.target.closest('button[data-dir]');
    if (!btn) return;
    S.dirFilter = btn.dataset.dir || '';
    S.els.dirSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
    renderMessages(true);
  };
  S.els.msgSearch.oninput = debounce((e) => {
    S.msgQuery = e.target.value.trim().toLowerCase();
    renderMessages(true);
  }, 150);

  async function uploadAttachment(file) {
    if (!file || !S.selected) return;
    S.els.attachBtn.disabled = true;
    S.els.attachChip.textContent = '上传中…';
    try {
      const data = await api.upload(file);
      S.pending = { url: data.url, type: data.type, name: data.name };
      S.els.attachChip.innerHTML = `${icon('paperclip', 12)} ${esc(data.name)} <a href="#" id="clearAttach">移除</a>`;
      root.querySelector('#clearAttach').onclick = (ev) => {
        ev.preventDefault();
        S.pending = null;
        S.els.attachChip.textContent = '';
      };
    } catch (err) {
      toast(err.message, 'err');
      S.els.attachChip.textContent = '';
    } finally {
      S.els.attachBtn.disabled = false;
      S.els.fileInput.value = '';
    }
  }

  S.els.sendBtn.onclick = sendMessage;
  S.els.input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  };
  S.els.input.oninput = () => {
    S.els.input.style.height = 'auto';
    S.els.input.style.height = `${Math.min(S.els.input.scrollHeight, 120)}px`;
  };
  S.els.input.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          uploadAttachment(file);
          break;
        }
      }
    }
  });
  S.els.main.addEventListener('dragover', (e) => {
    if (!S.selected) return;
    e.preventDefault();
    S.els.main.classList.add('drag-over');
  });
  S.els.main.addEventListener('dragleave', (e) => {
    if (e.target === S.els.main) S.els.main.classList.remove('drag-over');
  });
  S.els.main.addEventListener('drop', (e) => {
    S.els.main.classList.remove('drag-over');
    if (!S.selected) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      e.preventDefault();
      uploadAttachment(file);
    }
  });

  S.els.attachBtn.onclick = () => S.els.fileInput.click();
  S.els.fileInput.onchange = () => uploadAttachment(S.els.fileInput.files?.[0]);

  S.els.scroll.onscroll = async () => {
    if (S.exhausted || S.loading || !S.oldest || !S.selected) return;
    if (S.els.scroll.scrollTop > 30) return;
    const gen = S.gen;
    const before = S.oldest;
    S.loading = true;
    try {
      const data = await api.messages(S.selected, { limit: 40, before });
      if (gen !== S.gen) return;
      const seen = new Set(S.msgs.map((m) => m.id));
      const older = (data.messages || []).filter((m) => !seen.has(m.id));
      if (older.length) {
        const height = S.els.scroll.scrollHeight;
        S.msgs = [...older, ...S.msgs];
        S.oldest = S.msgs[0].timestamp;
        renderMessages(false);
        S.els.scroll.scrollTop = S.els.scroll.scrollHeight - height + 30;
      } else {
        S.exhausted = true;
        if (!S.els.scroll.querySelector('.no-more-top')) {
          S.els.scroll.insertAdjacentHTML('afterbegin',
            '<div class="daysep no-more-top">没有更早的消息了</div>');
        }
      }
    } catch (err) {
      if (gen === S.gen) toast(err.message, 'err');
    } finally {
      S.loading = false;
    }
  };

  const refreshThreads = debounce(renderThreads, 400);
  const offMessages = store.on('messages', (items) => {
    for (const item of items) {
      if (!item.name) continue;
      let agent = S.agents.find((a) => a.name === item.name);
      if (!agent) {
        agent = {
          name: item.name,
          display_name: item.name,
          inbound: 0,
          outbound: 0,
          total: 0,
          recent: 0,
          last_ts: item.timestamp,
          status: 'online',
        };
        S.agents.unshift(agent);
      }
      if (item.direction === 'inbound') agent.inbound = (agent.inbound || 0) + 1;
      else agent.outbound = (agent.outbound || 0) + 1;
      agent.total = (agent.total || 0) + 1;
      agent.last_ts = Math.max(agent.last_ts || 0, item.timestamp || 0);
      agent.status = 'online';

      S.last.set(item.name, item);
      if (item.name === S.selected) {
        appendMessages([item]);
        renderSide(agent);
      } else if (item.direction === 'inbound') {
        S.unread.set(item.name, (S.unread.get(item.name) || 0) + 1);
      }
    }
    refreshThreads();
  });

  await loadThreads();
  if (preselect && S.agents.some((a) => a.name === preselect)) open(preselect);
  else if (S.agents.length) open(S.agents[0].name);

  return () => offMessages();
}

async function loadThreads() {
  // 首屏只等待列表、最近事件和路由；链路关系在后台补齐，不阻塞打开通信台。
  const [agentsData, events, routesData] = await Promise.all([
    api.agents(),
    api.events(80),
    api.routes().catch(() => ({ routes: [] })),
  ]);
  const routeMap = new Map();
  for (const r of (routesData.routes || [])) {
    const ch = r.channel_id || r.inbox_name;
    const enabled = (r.enabled !== undefined ? Boolean(r.enabled) : r.status === 'active') && r.muse_status !== 'disabled';
    if (enabled && ch) {
      const list = routeMap.get(ch) || [];
      list.push(r);
      routeMap.set(ch, list);
    }
  }

  S.agents = (agentsData.agents || []).map((a) => {
    return {
      ...a,
      peers_out: [],
      peers_in: [],
      routes: routeMap.get(a.name) || [],
    };
  });
  store.setAgents(S.agents);
  S.last.clear();
  for (const e of events.events || []) S.last.set(e.name, e);
  renderThreads();

  // 不阻塞首屏；完成后只更新侧栏关系数据。
  api.lineage('24h', true).then((lineage) => {
    const lnMap = new Map((lineage.nodes || []).map((n) => [n.name, n]));
    S.agents = S.agents.map((a) => {
      const ln = lnMap.get(a.name);
      return { ...a, peers_out: ln?.peers_out || [], peers_in: ln?.peers_in || [] };
    });
    store.setAgents(S.agents);
    renderThreads();
    const selectedAgent = S.agents.find((a) => a.name === S.selected);
    if (selectedAgent) renderSide(selectedAgent);
  }).catch(() => {});
}

function renderThreads() {
  const host = S.els.threads;
  if (!host) return;
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;

  let list = [...S.agents];
  if (S.filter) {
    list = list.filter((a) => `${a.name} ${a.display_name}`.toLowerCase().includes(S.filter));
  }
  list.sort((a, b) => (S.last.get(b.name)?.timestamp || b.last_ts || 0) - (S.last.get(a.name)?.timestamp || a.last_ts || 0));

  if (!list.length) {
    host.innerHTML = `<div class="empty-state"><b>没有信箱</b>
      <span>往 /webhook/inbound/{name} 发一条消息就能自动出现</span></div>`;
    return;
  }

  host.innerHTML = list.map((a) => {
    const last = S.last.get(a.name);
    const liveAct = resolveMuseLiveAction(a, customMap, null, nowSec);
    const preview = last
      ? `${last.via === 'console' ? '我：' : (last.direction === 'inbound' ? '↓ ' : '↑ ')}${last.content || `[${last.type}]`}`
      : (a.last_preview || liveAct.actionText);
    const unread = S.unread.get(a.name) || 0;
    const av = a.avatar || defaultAvatar(a.name);
    const pal = paletteFor(a.name);
    const badge = museBadgeText(a.name);
    const when = last ? shortWhen(last.timestamp) : (a.last_ts ? shortWhen(a.last_ts) : '');
    return `<div class="thread ${a.name === S.selected ? 'on' : ''}" data-name="${esc(a.name)}">
      <div style="width:36px;height:36px;flex:none;position:relative">
        ${av
          ? `<img src="${esc(av)}" alt="" style="width:36px;height:36px;border-radius:50%;object-fit:cover"
               onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
             <div class="av-fallback" style="display:none;width:36px;height:36px;font-size:13px;background:${pal.bg};color:${pal.fg}">${esc(initial(a.display_name || a.name))}</div>`
          : `<div class="av-fallback" style="width:36px;height:36px;font-size:13px;background:${pal.bg};color:${pal.fg}">${esc(initial(a.display_name || a.name))}</div>`}
        ${badge ? `<span class="av-muse-badge" style="top:-3px;left:-4px;font-size:8.5px;padding:0 4px">${esc(badge)}</span>` : ''}
      </div>
      <div class="body">
        <div class="row1">
          <span class="nm">${liveAct.meta.icon} ${esc(a.display_name || a.name)}</span>
          <span class="dot ${esc(a.status)}" style="transform:scale(.85)"></span>
          <span class="when">${when}</span>
        </div>
        <div class="preview">${esc(preview.slice(0, 38))}</div>
        <div style="font-size:10px;font-family:var(--mono);color:var(--ink-3);margin-top:2px">
          <span style="color:#45e6f5">↓${num(a.inbound || 0)}</span> · <span style="color:#35e08a">↑${num(a.outbound || 0)}</span> · 共 ${num(a.total || 0)} 条
        </div>
      </div>
      ${unread ? `<span class="badge">${unread > 99 ? '99+' : unread}</span>` : ''}
    </div>`;
  }).join('');

  host.querySelectorAll('.thread').forEach((node) => {
    node.onclick = () => open(node.dataset.name);
  });
}

async function open(name) {
  const gen = ++S.gen;
  S.selected = name;
  S.unread.delete(name);
  S.pending = null;
  S.msgs = [];
  S.oldest = null;
  S.exhausted = false;
  S.loading = false;
  S.els.attachChip.textContent = '';
  S.els.page.classList.add('thread-open');
  renderThreads();

  const agent = S.agents.find((a) => a.name === name) || store.agent(name) || { name, display_name: name };
  const customMap = store.settings?.muse_actions || {};
  const liveAct = resolveMuseLiveAction(agent, customMap);

  S.els.headName.textContent = `${agent.display_name || agent.name}`;
  S.els.headSub.textContent = `↓收 ${agent.inbound || 0} · ↑发 ${agent.outbound || 0} · 共 ${agent.total || 0} 条 · ${liveAct.meta.icon} ${liveAct.meta.short}`;
  const av = agent.avatar || defaultAvatar(agent.name);
  const pal = paletteFor(agent.name);
  S.els.headAv.innerHTML = av
    ? `<img src="${esc(av)}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover">`
    : `<div class="av-fallback" style="width:32px;height:32px;font-size:12px;background:${pal.bg};color:${pal.fg}">${esc(initial(agent.display_name || agent.name))}</div>`;
  S.els.headChip.hidden = false;
  S.els.headChip.className = `chip ${agent.status === 'online' ? 'in' : ''}`;
  S.els.headChip.textContent = statusText(agent.status || 'empty');

  S.els.input.disabled = false;
  S.els.sendBtn.disabled = false;
  const cached = S.messageCache.get(name);
  if (cached) {
    S.msgs = cached.slice();
    S.oldest = S.msgs[0]?.timestamp || null;
    renderMessages(true);
    renderSide(agent);
  } else {
    S.els.scroll.innerHTML = '<div class="empty-state"><span>加载消息…</span></div>';
  }

  try {
    const data = await api.messages(name, { limit: 60 });
    if (gen !== S.gen) return;
    S.msgs = data.messages || [];
    S.messageCache.set(name, S.msgs.slice());
    S.oldest = S.msgs[0]?.timestamp || null;
    renderMessages(true);
    renderSide(agent);
  } catch (err) {
    if (gen === S.gen) {
      S.els.scroll.innerHTML = `<div class="empty-state"><b>加载失败</b><span>${esc(err.message)}</span></div>`;
    }
  }
}

function shortWhen(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? fmtTime(ts) : fmtDay(ts);
}

function safeUrl(raw) {
  const u = String(raw || '').trim();
  if (!u) return '';
  const low = u.toLowerCase();
  if (low.startsWith('javascript:') || low.startsWith('data:')
      || low.startsWith('vbscript:') || low.startsWith('file:')) return '';
  if (u.startsWith('/uploads/')) {
    if (u.includes('..') || u.includes('\\')) return '';
    return u;
  }
  try {
    const p = new URL(u, location.origin);
    return (p.protocol === 'http:' || p.protocol === 'https:') ? u : '';
  } catch { return ''; }
}

function mediaHtml(m) {
  if (!m.media_url) return '';
  const url = esc(safeUrl(m.media_url));
  if (!url) return '<span class="file">[附件链接已拦截]</span>';
  if (m.type === 'image') return `<img src="${url}" alt="图片" loading="lazy" onerror="this.remove()">`;
  if (m.type === 'video') return `<video src="${url}" controls preload="metadata"></video>`;
  if (m.type === 'audio') return `<audio src="${url}" controls preload="metadata"></audio>`;
  return `<a class="file" href="${url}" target="_blank" rel="noopener">${icon('paperclip', 13)}${esc(m.content || '下载附件')}</a>`;
}

function bubbleHtml(m) {
  // 控制台发出的消息现在按 inbound 入库，但在界面上仍应显示为“我发的”。
  // 旧数据中部分控制台消息是 outbound，也统一按 via=console 处理。
  const mine = m.via === 'console';
  const canDelete = ['admin', 'operator'].includes(S.ctx?.user?.role);
  const kind = mine ? '↑ 发出' : (m.direction === 'inbound' ? '↓ 收进' : '↩ 回传');
  const meta = `${fmtTime(m.timestamp)} · ${kind}${mine ? ' · 控制台' : ''}${m.request_id ? ` · #${esc(String(m.request_id).slice(0, 8))}` : ''}`;
  const isPlaceholder = m.media_url && m.content && /^\[(image|video|audio|file)\]$/i.test(m.content.trim());
  const text = m.content && m.type !== 'file' && !isPlaceholder ? esc(m.content) : '';
  const delBtn = canDelete
    ? `<button class="bubble-del" data-del-msg="${esc(m.id)}" title="删除此消息">×</button>`
    : '';
  const inner = delBtn
    + (text ? `<div class="text">${text}</div>` : '')
    + mediaHtml(m)
    + `<span class="meta">${meta}</span>`;
  return `<div class="bubble ${mine ? 'right' : 'left'}" data-id="${esc(m.id)}">${inner}</div>`;
}

function getFilteredMessages() {
  return S.msgs.filter((m) => {
    if (S.dirFilter && m.direction !== S.dirFilter) return false;
    if (S.msgQuery) {
      const hay = `${m.content || ''} ${m.request_id || ''} ${m.type || ''}`.toLowerCase();
      if (!hay.includes(S.msgQuery)) return false;
    }
    return true;
  });
}

function bindBubbleActions() {
  S.els.scroll.querySelectorAll('[data-del-msg]').forEach((btn) => {
    btn.onclick = async (ev) => {
      ev.stopPropagation();
      const id = btn.dataset.delMsg;
      try {
        await api.deleteMessage(id);
        S.msgs = S.msgs.filter((m) => m.id !== id);
        btn.closest('.bubble')?.remove();
        toast('消息已删除');
      } catch (err) {
        toast(err.message, 'err');
      }
    };
  });
}

function renderMessages(toBottom) {
  const list = getFilteredMessages();
  if (!list.length) {
    const filtered = Boolean(S.dirFilter || S.msgQuery);
    S.els.scroll.innerHTML = `<div class="empty-state"><b>${filtered ? '没有匹配筛选条件的消息' : '还没有消息'}</b>
      <span>${filtered ? '可切换上方「全部」或清空搜索词' : '在下方输入框发一条，就会作为消息写入当前信箱'}</span></div>`;
    return;
  }
  const parts = [];
  let lastDay = '';
  for (const m of list) {
    const day = fmtDay(m.timestamp);
    if (day !== lastDay) {
      parts.push(`<div class="daysep">${day}</div>`);
      lastDay = day;
    }
    parts.push(bubbleHtml(m));
  }
  S.els.scroll.innerHTML = parts.join('');
  bindBubbleActions();
  if (toBottom) S.els.scroll.scrollTop = S.els.scroll.scrollHeight;
}

function appendMessages(items) {
  const fresh = items.filter((m) => m.name === S.selected && !S.msgs.some((x) => x.id === m.id));
  if (!fresh.length) return;
  const atBottom = S.els.scroll.scrollHeight - S.els.scroll.scrollTop - S.els.scroll.clientHeight < 80;
  const hadNone = !S.msgs.length;
  S.msgs.push(...fresh);
  S.messageCache.set(S.selected, S.msgs.slice());
  if (hadNone || S.dirFilter || S.msgQuery) {
    renderMessages(atBottom || hadNone);
  } else {
    const day = fmtDay(fresh[0].timestamp);
    const lastDay = S.msgs.length > fresh.length ? fmtDay(S.msgs[S.msgs.length - fresh.length - 1].timestamp) : '';
    if (day !== lastDay) S.els.scroll.insertAdjacentHTML('beforeend', `<div class="daysep">${day}</div>`);
    S.els.scroll.insertAdjacentHTML('beforeend', fresh.map(bubbleHtml).join(''));
    bindBubbleActions();
    if (atBottom) S.els.scroll.scrollTop = S.els.scroll.scrollHeight;
  }
  S.els.headSub.textContent = `收/发已更新 · ${rel(fresh[fresh.length - 1].timestamp)}`;
}

async function sendMessage() {
  const name = S.selected;
  if (!name) return;
  const input = S.els.input;
  const text = input.value.trim();
  if (!text && !S.pending) return;

  const payload = {
    name,
    content: text || (S.pending?.type === 'file' ? S.pending.name : ''),
    type: S.pending?.type || 'text',
    media_url: S.pending?.url || null,
    direction: S.els.direction.value,
  };

  S.els.sendBtn.disabled = true;
  try {
    const res = await api.send(payload);
    input.value = '';
    input.style.height = 'auto';
    S.pending = null;
    S.els.attachChip.textContent = '';
    appendMessages([{
      id: res.id,
      name,
      direction: payload.direction,
      type: payload.type,
      content: payload.content,
      media_url: payload.media_url,
      timestamp: res.timestamp,
      via: 'console',
    }]);
    S.els.scroll.scrollTop = S.els.scroll.scrollHeight;
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    S.els.sendBtn.disabled = false;
  }
}

function renderSide(agent) {
  const a = S.agents.find((x) => x.name === agent.name) || store.agent(agent.name) || agent;
  const pal = paletteFor(a.name);
  const customMap = store.settings?.muse_actions || {};
  const liveAct = resolveMuseLiveAction(a, customMap);
  const prof = liveAct.profile;
  const peersOut = a.peers_out || [];
  const peersIn = a.peers_in || [];
  const routes = a.routes || [];

  S.els.side.innerHTML = `
    <div class="side-block" style="text-align:center;padding:16px 14px 12px">
      <div style="width:54px;height:54px;margin:0 auto 8px">
        ${a.avatar || defaultAvatar(a.name)
          ? `<img src="${esc(a.avatar || defaultAvatar(a.name))}" alt="" style="width:54px;height:54px;border-radius:50%;object-fit:cover">`
          : `<div class="av-fallback" style="width:54px;height:54px;font-size:18px;background:${pal.bg};color:${pal.fg}">${esc(initial(a.display_name || a.name))}</div>`}
      </div>
      <div style="font-weight:700;font-size:14px">${esc(a.display_name || a.name)}</div>
      <div class="mono muted" style="font-size:11px">${esc(a.name)}</div>
      <div style="margin-top:6px">
        <span class="chip" style="color:${liveAct.meta.color};border-color:${liveAct.meta.color};background:transparent">
          ${liveAct.meta.icon} ${esc(liveAct.meta.short)}
        </span>
      </div>
      <div style="font-size:11.5px;color:var(--ink-2);margin-top:6px;line-height:1.45">${esc(prof.duty)}</div>
    </div>

    <div class="side-block">
      <h3>3D 工位实时动作</h3>
      <div style="font-size:12px;color:var(--ink-1);line-height:1.5;margin-bottom:8px">
        <b>正在执行：</b>${esc(liveAct.actionText)}
      </div>
      <button class="btn ghost sm" id="sideActionDef" style="width:100%">⚡ 定义该 Muse 动作</button>
    </div>

    <div class="side-block">
      <h3>报文数量统计</h3>
      <div class="kv"><span>↓ 入站收进</span><b style="color:#45e6f5">${num(a.inbound || 0)} 条</b></div>
      <div class="kv"><span>↑ 出站发出</span><b style="color:#35e08a">${num(a.outbound || 0)} 条</b></div>
      <div class="kv"><span>Σ 历史累计</span><b>${num(a.total || 0)} 条</b></div>
      <div class="kv"><span>最近活跃</span><b>${rel(a.last_ts)}</b></div>
      <div class="kv"><span>工位状态</span><b>${statusText(a.status)}</b></div>
    </div>

    <div class="side-block">
      <h3>数据去向与来源</h3>
      ${peersOut.length ? peersOut.map((p) => `
        <div class="kv"><span>→ 发往 <b>${esc(p.to === 'relay' ? '中继核心' : p.to)}</b></span><b style="color:#35e08a">${num(p.count)} 条</b></div>
      `).join('') : ''}
      ${peersIn.length ? peersIn.map((p) => `
        <div class="kv"><span>← 来自 <b>${esc(p.from === 'relay' ? '中继核心' : p.from)}</b></span><b style="color:#45e6f5">${num(p.count)} 条</b></div>
      `).join('') : ''}
      ${!peersOut.length && !peersIn.length ? '<div class="muted" style="font-size:11.5px">当前时间窗暂无跨节点去向</div>' : ''}
      ${routes.length ? `<div style="margin-top:6px;font-size:11px;color:var(--ink-2)">已绑定 <b>${routes.length}</b> 条会话路由</div>` : ''}
    </div>

    <div class="side-block" style="border-bottom:0">
      <h3>快捷跳转</h3>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn ghost sm" id="sideOffice">🏛️ 在 3D 指挥室查看工位</button>
        <button class="btn ghost sm" id="sideAgents">👤 编辑信箱资料</button>
      </div>
    </div>`;

  S.els.side.querySelector('#sideActionDef').onclick = () => {
    openMuseActionModal(a, store, api, () => {
      renderThreads();
      renderSide(a);
    });
  };
  S.els.side.querySelector('#sideAgents').onclick = () => S.ctx.go('agents');
  S.els.side.querySelector('#sideOffice').onclick = () => S.ctx.go('office');
}
