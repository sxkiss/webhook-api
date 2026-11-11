import { api, store } from '../api.js';
import {
  esc, num, icon, initial, defaultAvatar, statusText, rel, toast, modal,
  paletteFor, museBadgeText, resolveMuseLiveAction, openMuseActionModal,
} from '../ui.js';

let filter = '';
let agentsRef = [];
let hiddenRef = [];
let deletedRef = [];

const T = {
  fileInput: null,
  uploading: '',
  reload: () => {},
  setUploading(name) { this.uploading = name; },
};

export async function mount(root, ctx) {
  filter = '';
  const canEdit = ctx.user?.role === 'admin';
  const canUpload = ['admin', 'operator'].includes(ctx.user?.role);

  root.innerHTML = `
    <div class="pg-agents">
      <div class="panel-head" style="padding:0 0 12px;border:0;background:transparent">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="dp-badge">UNITS & ACTIONS</span>
          <h2 style="font-size:15px">信箱成员 · 工位数量与动作定义</h2>
          <span class="chip" id="cnt">—</span>
        </div>
        <span class="spacer"></span>
        <input type="search" id="search" placeholder="搜索信箱、职能或去向…" style="width:210px" autocomplete="off">
        ${canEdit ? `<button class="btn ghost sm" id="addBtn">${icon('plus', 13)} 新增标注</button>` : ''}
        <button class="btn ghost sm" id="refreshBtn">${icon('refresh', 13)} 刷新</button>
      </div>
      <p class="muted" style="font-size:12px;margin:0 0 14px;line-height:1.65">
        实时汇总每个 Muse 工位的<b>收发报文数量</b>、<b>数据去向路由</b>以及<b>3D 工位实时动作定义（入站 / 推演 / 出站 / 协同 / 待命）</b>。点击卡片上的「⚡ 动作定义」可自定义每个 Muse 的行为规范与 3D 姿态。
      </p>
      <div class="grid-agents" id="grid"></div>
      <div id="tucked"></div>
    </div>`;

  const grid = root.querySelector('#grid');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
  fileInput.hidden = true;
  root.appendChild(fileInput);
  T.fileInput = fileInput;
  T.reload = () => load(grid, root, ctx);

  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    const name = T.uploading;
    if (!file || !name) return;
    try {
      await api.uploadAvatar(name, file);
      toast('形象已更新');
      T.reload();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      fileInput.value = '';
      T.uploading = '';
    }
  };

  root.querySelector('#search').oninput = (e) => {
    filter = e.target.value.trim().toLowerCase();
    renderGrid(grid, root, ctx);
  };
  root.querySelector('#refreshBtn').onclick = () => T.reload();
  if (canEdit) root.querySelector('#addBtn').onclick = () => addAgent(ctx);

  await T.reload();
  return null;
}

async function load(grid, root, ctx) {
  try {
    const [data, lineage, routesData] = await Promise.all([
      api.agents(),
      api.lineage('24h', true).catch(() => ({ nodes: [] })),
      api.routes().catch(() => ({ routes: [] })),
    ]);
    const lnMap = new Map((lineage.nodes || []).map((n) => [n.name, n]));
    const routeMap = new Map();
    for (const r of (routesData.routes || [])) {
      const ch = r.channel_id || r.inbox_name;
      const enabled = (r.enabled !== undefined ? Boolean(r.enabled) : r.status === 'active') && r.muse_status !== 'disabled';
      if (enabled && ch) {
        const arr = routeMap.get(ch) || [];
        arr.push(r);
        routeMap.set(ch, arr);
      }
    }

    agentsRef = (data.agents || []).map((a) => {
      const ln = lnMap.get(a.name);
      return {
        ...a,
        peers_out: ln?.peers_out || [],
        peers_in: ln?.peers_in || [],
        routes: routeMap.get(a.name) || [],
      };
    });
    hiddenRef = data.hidden || [];
    deletedRef = data.deleted || [];
    store.setAgents(agentsRef);
    const totalMsgs = agentsRef.reduce((acc, a) => acc + (a.total || 0), 0);
    const tucked = hiddenRef.length + deletedRef.length;
    root.querySelector('#cnt').textContent = `${agentsRef.length} 个工位 · 累计 ${num(totalMsgs)} 条报文${tucked ? ` · 隐藏 ${tucked}` : ''}`;
    renderGrid(grid, root, ctx);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state"><b>加载失败</b><span>${esc(err.message)}</span></div>`;
  }
}

function renderGrid(grid, root, ctx) {
  const canEdit = ctx.user?.role === 'admin';
  const canUpload = ['admin', 'operator'].includes(ctx.user?.role);
  const customMap = store.settings?.muse_actions || {};
  const nowSec = Date.now() / 1000;
  renderTucked(root, ctx);

  let list = agentsRef;
  if (filter) {
    list = list.filter((a) => {
      const liveAct = resolveMuseLiveAction(a, customMap, null, nowSec);
      return `${a.name} ${a.display_name} ${a.role || ''} ${liveAct.profile.duty} ${liveAct.actionText}`.toLowerCase().includes(filter);
    });
  }

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><b>还没有匹配的信箱</b>
      <span>任意 agent 往 /webhook/inbound/{name} 推一条消息，这里就会自动出现</span></div>`;
    return;
  }

  grid.innerHTML = list.map((a) => {
    const av = a.avatar || defaultAvatar(a.name);
    const label = a.display_name || a.name;
    const pal = paletteFor(a.name);
    const badge = museBadgeText(a.name);
    const fbStyle = `background:${pal.bg};color:${pal.fg};border-color:${pal.border}`;
    const liveAct = resolveMuseLiveAction(a, customMap, null, nowSec);
    const prof = liveAct.profile;

    const outs = (a.peers_out || []).slice(0, 2).map((p) => {
      const dst = p.to === 'relay' ? '中继核心' : p.to;
      return `<span class="ag-dest out">→ ${esc(dst)} <b>(${p.count}条)</b></span>`;
    });
    const ins = (a.peers_in || []).slice(0, 1).map((p) => {
      const src = p.from === 'relay' ? '中继核心' : p.from;
      return `<span class="ag-dest in">← ${esc(src)} <b>(${p.count}条)</b></span>`;
    });
    const destHtml = [...outs, ...ins].join(' ') || ((a.total || 0) > 0
      ? `<span class="ag-dest muted">⇄ 中继核心 (${a.total}条)</span>`
      : '<span class="ag-dest muted">暂无活跃流向</span>');

    return `<div class="agent-card" data-name="${esc(a.name)}" style="--act-c:${liveAct.meta.color}">
      <div class="av-wrap">
        ${av
          ? `<img class="av-lg" src="${esc(av)}" alt="${esc(label)}"
               onerror="this.style.display='none';this.nextElementSibling.style.display='grid'">
             <div class="av-fallback" style="display:none;${fbStyle}">${esc(initial(label))}</div>`
          : `<div class="av-fallback" style="${fbStyle}">${esc(initial(label))}</div>`}
        ${badge ? `<span class="av-muse-badge">${esc(badge)}</span>` : ''}
        ${canUpload ? `<button class="av-edit" data-act="upload" title="上传形象">${icon('camera', 11)}</button>` : ''}
      </div>
      <div class="info">
        <div class="nm">
          <b>${esc(label)}</b>
          <span class="ag-act-pill" style="color:${liveAct.meta.color};border-color:${liveAct.meta.color}">
            ${liveAct.meta.icon} ${esc(liveAct.meta.short)}
          </span>
          ${a.routes?.length ? `<span class="chip in" style="font-size:10px;padding:0 6px">${a.routes.length} 路由</span>` : ''}
        </div>
        <div class="raw">标识: <code>${esc(a.name)}</code> · <span class="dot ${esc(a.status)}"></span> ${statusText(a.status)} (${rel(a.last_ts)})</div>
        <div class="ag-duty">${esc(prof.duty)}</div>
        <div class="ag-live-now">
          <span class="lbl">正在干嘛:</span>
          <span class="val">${esc(liveAct.actionText)}</span>
        </div>
        <div class="stats" style="margin-top:6px">
          <span>↓收进 <b class="in-val">${num(a.inbound)}</b></span>
          <span>↑发出 <b class="out-val">${num(a.outbound)}</b></span>
          <span>Σ总计 <b>${num(a.total)} 条</b></span>
        </div>
        <div class="ag-dest-row">
          <span class="lbl">数据去向:</span>
          ${destHtml}
        </div>
      </div>
      <div class="agent-actions" style="flex-direction:column;gap:5px">
        <button class="btn ghost sm" data-act="action-def" title="定义该 Muse 的 3D 工位动作">⚡ 动作定义</button>
        <div style="display:flex;gap:5px;justify-content:flex-end">
          <button class="iconbtn" data-act="office" title="在 3D 指挥室查看">${icon('office', 13)}</button>
          <button class="iconbtn" data-act="chat" title="打开通信台">${icon('chat', 13)}</button>
          ${canEdit ? `<button class="iconbtn" data-act="edit" title="编辑资料">${icon('settings', 13)}</button>` : ''}
          ${canEdit ? `<button class="iconbtn" data-act="del" title="隐藏信箱">${icon('x', 13)}</button>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.agent-card').forEach((card) => {
    const name = card.dataset.name;
    const agent = agentsRef.find((a) => a.name === name);
    card.querySelectorAll('[data-act]').forEach((btn) => {
      btn.onclick = (event) => {
        event.stopPropagation();
        const act = btn.dataset.act;
        if (act === 'upload') {
          T.setUploading(name);
          T.fileInput.click();
        } else if (act === 'chat') {
          ctx.go('chat', { agent: name });
        } else if (act === 'office') {
          ctx.go('office');
        } else if (act === 'action-def') {
          openMuseActionModal(agent, store, api, () => renderGrid(grid, root, ctx));
        } else if (act === 'edit') {
          editAgent(agent);
        } else if (act === 'del') {
          confirmDelete(agent);
        }
      };
    });
  });
}

function confirmDelete(agent) {
  const label = agent.display_name || agent.name;
  modal({
    title: `隐藏「${label}」`,
    okText: '隐藏',
    body: '<p style="margin:0;font-size:12.5px;line-height:1.7">只隐藏信箱，不删除历史消息或标注。下次有新通信后会自动恢复，也可以在下方手动恢复。</p>',
    onOk: async () => {
      try {
        await api.deleteAgent(agent.name);
        toast(`已隐藏「${label}」`);
        T.reload();
        return true;
      } catch (err) {
        toast(err.message, 'err');
        return false;
      }
    },
  });
}

async function restoreAgent(name, label) {
  try {
    await api.restoreAgent(name);
    toast(`已恢复「${label || name}」`);
    T.reload();
  } catch (err) {
    toast(err.message, 'err');
  }
}

function renderTucked(root, ctx) {
  const host = root.querySelector('#tucked');
  if (!host) return;
  const canEdit = ctx.user?.role === 'admin';
  const groups = [
    ['deleted', '已隐藏，等下次通信', deletedRef],
    ['hidden', '自动忽略（没有消息）', hiddenRef],
  ].filter(([, , list]) => list.length);
  if (!groups.length) { host.innerHTML = ''; return; }
  host.innerHTML = groups.map(([key, title, list]) => `
    <div style="margin-top:18px">
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px">
        <b style="font-size:12.5px">${esc(title)}</b><span class="chip" style="font-size:10px">${list.length}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        ${list.map((a) => `<span class="chip" style="display:inline-flex;align-items:center;gap:6px;font-size:11.5px">
          ${esc(a.display_name || a.name)}
          ${canEdit ? `<button class="iconbtn" data-restore="${esc(a.name)}" data-label="${esc(a.display_name || a.name)}" title="恢复">↻</button>` : ''}
        </span>`).join('')}
      </div>
    </div>`).join('');
  host.querySelectorAll('[data-restore]').forEach((btn) => {
    btn.onclick = () => restoreAgent(btn.dataset.restore, btn.dataset.label);
  });
}

function editAgent(agent) {
  modal({
    title: `编辑「${agent.display_name || agent.name}」`,
    okText: '保存',
    body: `
      <label class="field"><span>显示名</span>
        <input type="text" id="f-name" value="${esc(agent.display_name === agent.name ? '' : agent.display_name)}" placeholder="${esc(agent.name)}">
        <small>留空则直接用原始名字 <code>${esc(agent.name)}</code></small>
      </label>
      <label class="field"><span>角色标签</span>
        <input type="text" id="f-role" value="${esc(agent.role || '')}" placeholder="例如：发送方 / 应答方 / 只观察">
      </label>
      <label class="field"><span>备注</span>
        <textarea id="f-note" rows="3" placeholder="谁能给它发消息、要不要回复…">${esc(agent.note || '')}</textarea>
      </label>
      ${agent.has_custom_avatar ? '<button class="btn ghost sm" id="f-clear" type="button">恢复默认形象</button>' : ''}`,
    onOk: async (wrap) => {
      try {
        await api.patchAgent(agent.name, {
          display_name: wrap.querySelector('#f-name').value.trim(),
          role: wrap.querySelector('#f-role').value.trim(),
          note: wrap.querySelector('#f-note').value.trim(),
        });
        toast('已保存');
        T.reload();
        return true;
      } catch (err) {
        toast(err.message, 'err');
        return false;
      }
    },
  });

  const clear = document.getElementById('f-clear');
  if (clear) {
    clear.onclick = async () => {
      try {
        await api.deleteAvatar(agent.name);
        toast('已恢复默认形象');
        document.getElementById('modal').hidden = true;
        document.getElementById('modal').innerHTML = '';
        T.reload();
      } catch (err) {
        toast(err.message, 'err');
      }
    };
  }
}

function addAgent(ctx) {
  modal({
    title: '新增信箱标注',
    okText: '创建',
    body: `<p style="margin:0 0 12px;font-size:12.5px;color:var(--ink2)">
        用于给还没来过消息的信箱提前配好形象和角色。名字要和对方推送时用的 <code>name</code> 完全一致。</p>
      <label class="field"><span>信箱名</span><input type="text" id="a-name" placeholder="例如 muse3"></label>`,
    onOk: async (wrap) => {
      const name = wrap.querySelector('#a-name').value.trim();
      if (!name) { toast('请填写信箱名', 'err'); return false; }
      try {
        await api.patchAgent(name, { display_name: '' });
        toast('已创建，可以上传形象了');
        T.reload();
        return true;
      } catch (err) {
        toast(err.message, 'err');
        return false;
      }
    },
  });
}
