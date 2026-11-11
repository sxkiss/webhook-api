import { api, store } from '../api.js';
import { esc, icon, rel, fmtDateTime, toast, modal } from '../ui.js';
import { platformName, platformOptions } from '../platforms.js';

let muses = [];
let routes = [];
let platformFilter = '';
let qFilter = '';

export async function mount(root, ctx) {
  platformFilter = '';
  qFilter = '';
  const canOperate = ['admin', 'operator'].includes(ctx.user?.role);
  const isAdmin = ctx.user?.role === 'admin';

  root.innerHTML = `
    <div class="pg-registry">
      <div class="kpis" id="regKpis">
        ${['已注册 Muse', '活跃通道', '会话路由绑定', '启用中路由'].map((k) => `
          <div class="kpi"><div class="k">${k}</div><div class="v">—</div><div class="s">加载中</div></div>`).join('')}
      </div>

      <div class="reg-grid">
        <section class="card reg-section">
          <div class="panel-head">
            <h2>Muse 通道注册表</h2>
            <span class="chip" id="museCnt">—</span>
            <span class="spacer"></span>
            ${canOperate ? `<button class="btn sm" id="regMuseBtn">${icon('plus', 13)}注册新 Muse</button>` : ''}
            <button class="btn ghost sm" id="refreshRegBtn">${icon('refresh', 13)}刷新</button>
          </div>
          <div class="reg-table-wrap" id="museTableWrap">
            <div class="empty-state"><span>加载中…</span></div>
          </div>
        </section>

        <section class="card reg-section">
          <div class="panel-head">
            <h2>多平台会话路由绑定</h2>
            <span class="chip" id="routeCnt">—</span>
            <span class="spacer"></span>
            <select id="routePlatform" aria-label="筛选平台" style="width:140px"><option value="">全部平台</option>${platformOptions()}</select>
            <input type="search" id="routeSearch" placeholder="按平台 / 账号 / 会话 / 通道搜索…" style="width:210px" autocomplete="off">
            ${canOperate ? `<button class="btn sm" id="bindRouteBtn">${icon('plus', 13)}绑定路由</button>` : ''}
          </div>
          <div class="reg-table-wrap" id="routeTableWrap">
            <div class="empty-state"><span>加载中…</span></div>
          </div>
        </section>
      </div>

      <section class="card pad" style="margin-top:14px">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <b style="font-size:13.5px">路由解析验证</b>
          <span class="muted" style="font-size:12px">按平台、账号和会话查找目标 Muse；实际收发需要对应平台的适配器。</span>
          <span style="flex:1"></span>
          <input type="text" id="resPlatform" list="routePlatforms" value="wechat" aria-label="解析平台" placeholder="平台标识" style="width:130px">
          <datalist id="routePlatforms">${platformOptions()}</datalist>
          <input type="text" id="resWx" placeholder="账号 ID / 应用 ID" style="width:190px">
          <input type="text" id="resConv" placeholder="conversation_id（如 room@chatroom）" style="width:210px">
          <button class="btn ghost sm" id="resBtn">解析测试</button>
        </div>
        <div id="resOut" style="margin-top:8px;font-size:12.5px" hidden></div>
      </section>
    </div>`;

  const reload = () => load(root, ctx, canOperate, isAdmin);

  root.querySelector('#refreshRegBtn').onclick = reload;
  root.querySelector('#routePlatform').onchange = (e) => {
    platformFilter = e.target.value;
    renderRoutes(root, ctx, canOperate);
  };
  root.querySelector('#routeSearch').oninput = (e) => {
    qFilter = e.target.value.trim().toLowerCase();
    renderRoutes(root, ctx, canOperate);
  };
  if (canOperate) {
    root.querySelector('#regMuseBtn').onclick = () => openRegisterMuseModal(reload);
    root.querySelector('#bindRouteBtn').onclick = () => openBindRouteModal(reload);
  }

  root.querySelector('#resBtn').onclick = async () => {
    const wx = root.querySelector('#resWx').value.trim();
    const conv = root.querySelector('#resConv').value.trim();
    const out = root.querySelector('#resOut');
    if (!wx || !conv) {
      toast('请填写账号 ID 和会话 ID', 'err');
      return;
    }
    out.hidden = false;
    out.innerHTML = '<span class="muted">解析中…</span>';
    try {
      const platform = root.querySelector('#resPlatform').value.trim();
      const res = await api.resolveRoute(wx, conv, platform);
      const r = res.route || {};
      out.innerHTML = `<span class="chip out">命中路由</span> ${esc(platformName(r.platform))} <code>${esc(r.account_id || r.wx_account_id)}</code> / 会话 <code>${esc(r.conversation_id)}</code> (${esc(r.conversation_type)}) → 通道 <b>${esc(res.channel_id)}</b> (实例 <code>${esc(res.instance_id)}</code>)`;
    } catch (err) {
      out.innerHTML = `<span class="chip danger">未命中</span> <span style="color:var(--red)">${esc(err.message)}</span>`;
    }
  };

  await reload();
  return null;
}

async function load(root, ctx, canOperate, isAdmin) {
  try {
    const [mData, rData] = await Promise.all([api.muses(), api.routes()]);
    muses = mData.muses || [];
    routes = rData.routes || [];
    store.routes = routes;
    const filter = root.querySelector('#routePlatform');
    const custom = [...new Set(routes.map((r) => r.platform || 'wechat'))]
      .filter((p) => !['wechat', 'feishu', 'dingtalk', 'wecom'].includes(p));
    filter.innerHTML = `<option value="">全部平台</option>${platformOptions()}`
      + custom.map((p) => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
    filter.value = platformFilter;
    renderKpis(root);
    renderMuses(root, ctx, canOperate, isAdmin);
    renderRoutes(root, ctx, canOperate);
  } catch (err) {
    root.querySelector('#museTableWrap').innerHTML =
      `<div class="empty-state"><b>加载失败</b><span>${esc(err.message)}</span></div>`;
  }
}

function renderKpis(root) {
  const activeMuses = muses.filter((m) => m.status === 'active').length;
  const legacyMuses = muses.filter((m) => m.legacy).length;
  const enabledRoutes = routes.filter((r) => r.enabled).length;
  const cards = [
    { k: '已注册 Muse', v: muses.length, s: `含 ${legacyMuses} 个历史自动兼容通道` },
    { k: '活跃通道', v: activeMuses, s: `${muses.length - activeMuses} 个已停用` },
    { k: '会话路由绑定', v: routes.length, s: '平台 + 账号 + 会话，独立隔离' },
    { k: '启用中路由', v: enabledRoutes, s: `${routes.length - enabledRoutes} 条已暂停` },
  ];
  root.querySelector('#regKpis').innerHTML = cards.map((c) => `
    <div class="kpi"><div class="k">${esc(c.k)}</div>
      <div class="v">${esc(String(c.v))}</div><div class="s">${esc(c.s)}</div></div>`).join('');
  root.querySelector('#museCnt').textContent = `${muses.length} 个实例`;
  root.querySelector('#routeCnt').textContent = `${routes.length} 条绑定`;
}

function renderMuses(root, ctx, canOperate, isAdmin) {
  const wrap = root.querySelector('#museTableWrap');
  if (!muses.length) {
    wrap.innerHTML = `<div class="empty-state"><b>暂无已注册的 Muse 实例</b>
      <span>点击右上角「注册新 Muse」或调用 <code>POST /api/registry/muse/register</code> 自动分配通道号</span></div>`;
    return;
  }

  wrap.innerHTML = `<table class="tbl">
    <thead>
      <tr>
        <th>通道号</th>
        <th>实例 ID / 显示名</th>
        <th>来源</th>
        <th>状态</th>
        <th>绑定路由</th>
        <th>消息 (收/发)</th>
        <th>最近心跳</th>
        <th style="text-align:right">操作</th>
      </tr>
    </thead>
    <tbody>
      ${muses.map((m) => {
        const active = m.status === 'active';
        return `<tr>
          <td><b class="mono" style="color:var(--blue-deep)">${esc(m.channel_id)}</b></td>
          <td>
            <div><b>${esc(m.display_name || m.channel_id)}</b></div>
            <div class="mono muted" style="font-size:11.5px">${esc(m.instance_id)}</div>
          </td>
          <td>${m.legacy ? '<span class="chip">Legacy 兼容</span>' : '<span class="chip in">Registry 分配</span>'}</td>
          <td>${active ? '<span class="chip out">启用中</span>' : '<span class="chip warn">已停用</span>'}</td>
          <td class="mono">${m.active_route_count || 0} / ${m.route_count || 0}</td>
          <td class="mono">${m.inbound || 0} / ${m.outbound || 0}</td>
          <td class="muted" title="${esc(fmtDateTime(m.last_seen_at))}">${rel(m.last_seen_at)}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost sm" data-m-chat="${esc(m.channel_id)}">对话</button>
            ${canOperate ? `<button class="btn ghost sm" data-m-toggle="${esc(m.instance_id)}" data-st="${active ? 'disabled' : 'active'}">${active ? '停用' : '启用'}</button>` : ''}
            ${isAdmin ? `<button class="btn ghost sm" data-m-del="${esc(m.instance_id)}" data-ch="${esc(m.channel_id)}">删除</button>` : ''}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  wrap.querySelectorAll('[data-m-chat]').forEach((btn) => {
    btn.onclick = () => ctx.go('chat', { agent: btn.dataset.mChat });
  });
  wrap.querySelectorAll('[data-m-toggle]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.patchMuse(btn.dataset.mToggle, { status: btn.dataset.st });
        toast(btn.dataset.st === 'active' ? '已启用 Muse 通道' : '已停用 Muse 通道');
        load(root, ctx, canOperate, isAdmin);
      } catch (err) {
        toast(err.message, 'err');
      }
    };
  });
  wrap.querySelectorAll('[data-m-del]').forEach((btn) => {
    btn.onclick = () => {
      modal({
        title: `删除 Muse 实例「${btn.dataset.ch}」`,
        okText: '确认删除',
        danger: true,
        body: `<p style="margin:0">删除实例 <code>${esc(btn.dataset.mDel)}</code> 将同时解绑其关联的会话路由（历史聊天记录会保留）。</p>`,
        onOk: async () => {
          try {
            await api.deleteMuse(btn.dataset.mDel);
            toast('Muse 实例已删除');
            load(root, ctx, canOperate, isAdmin);
            return true;
          } catch (err) {
            toast(err.message, 'err');
            return false;
          }
        },
      });
    };
  });
}

function renderRoutes(root, ctx, canOperate) {
  const wrap = root.querySelector('#routeTableWrap');
  let list = routes;
  if (platformFilter) list = list.filter((r) => (r.platform || 'wechat') === platformFilter);
  if (qFilter) {
    list = list.filter((r) =>
      `${r.platform || 'wechat'} ${platformName(r.platform)} ${r.account_id || r.wx_account_id} ${r.conversation_id} ${r.channel_id} ${r.instance_id} ${r.muse_display_name || ''}`
        .toLowerCase()
        .includes(qFilter),
    );
  }

  if (!list.length) {
    wrap.innerHTML = `<div class="empty-state"><b>${qFilter || platformFilter ? '没有匹配的路由' : '暂无会话路由'}</b>
      <span>点击右上角「绑定路由」，选择平台并绑定到指定 Muse 通道</span></div>`;
    return;
  }

  wrap.innerHTML = `<table class="tbl">
    <thead>
      <tr>
        <th>平台</th>
        <th>账号 / 应用 ID</th>
        <th>会话 ID (conversation_id)</th>
        <th>类型</th>
        <th>目标 Muse 通道</th>
        <th>状态</th>
        <th>更新时间</th>
        <th style="text-align:right">操作</th>
      </tr>
    </thead>
    <tbody>
      ${list.map((r) => {
        const on = Boolean(r.enabled) && r.muse_status !== 'disabled';
        return `<tr>
          <td><span class="chip">${esc(platformName(r.platform))}</span></td>
          <td class="mono"><b>${esc(r.account_id || r.wx_account_id)}</b></td>
          <td class="mono">${esc(r.conversation_id)}</td>
          <td><span class="chip">${r.conversation_type === 'group' ? '群聊 group' : '私聊 direct'}</span></td>
          <td>
            <b class="mono" style="color:var(--blue-deep)">${esc(r.channel_id)}</b>
            <span class="muted" style="font-size:11.5px">(${esc(r.instance_id)})</span>
          </td>
          <td>${on ? '<span class="chip out">生效中</span>' : '<span class="chip warn">已暂停</span>'}</td>
          <td class="muted">${fmtDateTime(r.updated_at)}</td>
          <td style="text-align:right;white-space:nowrap">
            <button class="btn ghost sm" data-r-chat="${esc(r.channel_id)}">进通道</button>
            ${canOperate ? `
              <button class="btn ghost sm" data-r-toggle="${esc(r.route_id)}" data-en="${r.enabled ? '0' : '1'}">${r.enabled ? '暂停' : '启用'}</button>
              <button class="btn ghost sm" data-r-del="${esc(r.route_id)}">解绑</button>
            ` : ''}
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;

  wrap.querySelectorAll('[data-r-chat]').forEach((btn) => {
    btn.onclick = () => ctx.go('chat', { agent: btn.dataset.rChat });
  });
  wrap.querySelectorAll('[data-r-toggle]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.patchRoute(btn.dataset.rToggle, { enabled: btn.dataset.en === '1' });
        toast(btn.dataset.en === '1' ? '路由已启用' : '路由已暂停');
        load(root, ctx, canOperate, ctx.user?.role === 'admin');
      } catch (err) {
        toast(err.message, 'err');
      }
    };
  });
  wrap.querySelectorAll('[data-r-del]').forEach((btn) => {
    btn.onclick = async () => {
      try {
        await api.deleteRoute(btn.dataset.rDel);
        toast('路由已解绑');
        load(root, ctx, canOperate, ctx.user?.role === 'admin');
      } catch (err) {
        toast(err.message, 'err');
      }
    };
  });
}

function openRegisterMuseModal(onDone) {
  modal({
    title: '注册新 Muse 实例',
    okText: '注册并分配通道',
    body: `
      <p style="margin:0 0 12px;font-size:12.5px;color:var(--ink2)">
        相同 <code>instance_id</code> 重复注册会幂等返回原通道号；新实例将自动分配下一个空闲的 <code>museN号</code>。
      </p>
      <label class="field"><span>实例标识 (instance_id)</span>
        <input type="text" id="m-inst" placeholder="例如 muse-prod-03">
      </label>
      <label class="field"><span>显示名称 (可选)</span>
        <input type="text" id="m-disp" placeholder="留空则默认使用分配的通道号">
      </label>`,
    onOk: async (wrap) => {
      const instance_id = wrap.querySelector('#m-inst').value.trim();
      const display_name = wrap.querySelector('#m-disp').value.trim();
      if (!instance_id) {
        toast('请填写 instance_id', 'err');
        return false;
      }
      try {
        const res = await api.registerMuse({ instance_id, display_name: display_name || undefined });
        toast(`已分配通道：${res.channel_id}`);
        onDone();
        return true;
      } catch (err) {
        toast(err.message, 'err');
        return false;
      }
    },
  });
}

function openBindRouteModal(onDone) {
  const activeMuses = muses.filter((m) => m.status === 'active');
  const options = activeMuses.map((m) =>
    `<option value="${esc(m.channel_id)}">${esc(m.channel_id)} — ${esc(m.display_name || m.instance_id)} (${esc(m.instance_id)})</option>`
  ).join('');

  modal({
    title: '绑定平台会话到 Muse 通道',
    okText: '保存绑定',
    body: `
      <label class="field"><span>平台（可选择或填写自定义标识）</span>
        <input type="text" id="b-platform" list="bindPlatforms" value="${esc(platformFilter || 'wechat')}" placeholder="wechat / feishu / dingtalk / wecom">
        <datalist id="bindPlatforms">${platformOptions()}</datalist>
      </label>
      <p class="muted" style="font-size:12px">微信 wechat · 飞书 feishu · 钉钉 dingtalk · 企业微信 wecom；自定义标识使用小写字母、数字、下划线或连字符。</p>
      <label class="field"><span>账号 / 应用 ID (account_id)</span>
        <input type="text" id="b-wx" placeholder="微信机器人账号、飞书 App ID、钉钉机器人 ID 或企微应用标识">
      </label>
      <label class="field"><span>会话 ID (conversation_id)</span>
        <input type="text" id="b-conv" placeholder="用户 ID、群 ID 或平台 chat_id">
      </label>
      <label class="field"><span>会话类型</span>
        <select id="b-type">
          <option value="direct">私聊 (direct)</option>
          <option value="group">群聊 (group)</option>
        </select>
      </label>
      <label class="field"><span>目标 Muse 通道</span>
        ${options
          ? `<select id="b-ch">${options}</select>`
          : `<input type="text" id="b-ch" placeholder="例如 muse1号">`}
      </label>`,
    onOk: async (wrap) => {
      const platform = wrap.querySelector('#b-platform').value.trim();
      const account_id = wrap.querySelector('#b-wx').value.trim();
      const conversation_id = wrap.querySelector('#b-conv').value.trim();
      const conversation_type = wrap.querySelector('#b-type').value;
      const channel_id = wrap.querySelector('#b-ch').value.trim();
      if (!platform || !account_id || !conversation_id || !channel_id) {
        toast('请完整填写平台、账号、会话 ID 和目标通道', 'err');
        return false;
      }
      try {
        const res = await api.bindRoute({ platform, account_id, conversation_id, conversation_type, channel_id });
        toast(`已绑定到 ${res.channel_id}`);
        onDone();
        return true;
      } catch (err) {
        toast(err.message, 'err');
        return false;
      }
    },
  });
}
