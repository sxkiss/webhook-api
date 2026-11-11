/* 通用工具：图标、格式化、弹层、头像 */

export const ICONS = {
  overview: '<path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/>',
  chat: '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3 21l1.9-4.6A8.2 8.2 0 0 1 4 11.5 8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5z"/>',
  office: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="5" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="m7 7 3 3M17 7l-3 3M7 17l3-3M17 17l-3-3"/>',
  workstation: '<rect x="3" y="4" width="18" height="11" rx="2"/><path d="M8 20h8M12 15v5M7 9h4M7 12h6"/>',
  agents: '<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>',
  paperclip: '<path d="M21.4 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 1 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  caret: '<path d="m6 9 6 6 6-6"/>',
  warn: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>',
};

export function icon(name, size = 16) {
  const path = ICONS[name] || '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor"
    stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);
}

export function el(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html.trim();
  return tpl.content.firstElementChild;
}

export function num(n) {
  if (n == null || Number.isNaN(n)) return '0';
  if (n >= 10000) return `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

export function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDay(ts) {
  const d = new Date(ts * 1000);
  const now = new Date();
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, now)) return '今天';
  const y = new Date(now.getTime() - 86400000);
  if (same(d, y)) return '昨天';
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtDateTime(ts) {
  if (!ts) return '—';
  return `${fmtDay(ts)} ${fmtTime(ts)}`;
}

export function rel(ts) {
  if (!ts) return '从未';
  const gap = Date.now() / 1000 - ts;
  if (gap < 60) return '刚刚';
  if (gap < 3600) return `${Math.floor(gap / 60)} 分钟前`;
  if (gap < 86400) return `${Math.floor(gap / 3600)} 小时前`;
  if (gap < 86400 * 30) return `${Math.floor(gap / 86400)} 天前`;
  return fmtDateTime(ts).split(' ')[0];
}

export function statusText(status) {
  return ({ online: '在线', active: '活跃', idle: '空闲', silent: '静默', empty: '无消息' })[status] || status;
}

const DEFAULT_AVATARS = [
  [/^(boss|老板)/i, 'avatar-boss.webp'],
  [/^console|控制台/i, 'avatar-console.webp'],
  [/^ford/i, 'avatar-ford.webp'],
  [/^muse/i, 'avatar-muse.png'],
  [/^qwen/i, 'avatar-qwenpaw.webp'],
  [/^vita/i, 'avatar-vita.webp'],
];

export function defaultAvatar(name) {
  for (const [re, file] of DEFAULT_AVATARS) {
    if (re.test(name || '')) return `agents/${file}`;
  }
  return '';
}

const AVATAR_PALETTES = [
  { bg: '#dbeafe', fg: '#1d4ed8', border: '#93c5fd' },
  { bg: '#ede9fe', fg: '#6d28d9', border: '#c4b5fd' },
  { bg: '#dcfce7', fg: '#15803d', border: '#86efac' },
  { bg: '#fef3c7', fg: '#b45309', border: '#fcd34d' },
  { bg: '#fce7f3', fg: '#be185d', border: '#f9a8d4' },
  { bg: '#cffafe', fg: '#0e7490', border: '#67e8f9' },
];

export function paletteFor(name) {
  let h = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTES[h % AVATAR_PALETTES.length];
}

export function museBadgeText(name) {
  const m = /^muse(\d+)号$/i.exec(String(name || '').trim());
  if (m) return `#${m[1]}`;
  if (/^muse$/i.test(String(name || '').trim())) return 'M';
  return '';
}

export function avatarHtml(agent, cls = 'av-lg') {
  const rawName = agent?.name || '?';
  const name = agent?.display_name || rawName;
  const src = agent?.avatar || defaultAvatar(rawName);
  const pal = paletteFor(rawName);
  const fbStyle = `background:${pal.bg};color:${pal.fg};border-color:${pal.border}`;
  if (src) {
    return `<img class="${cls}" src="${esc(src)}" alt="${esc(name)}" loading="lazy"
      onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='grid')">
      <div class="av-fallback" style="display:none;${fbStyle}">${esc(initial(name))}</div>`;
  }
  return `<div class="av-fallback" style="${fbStyle}">${esc(initial(name))}</div>`;
}

export function initial(name) {
  const s = String(name || '?').trim();
  if (!s) return '?';
  if (/[\u4e00-\u9fa5]/.test(s[0])) return s.slice(0, 1);
  return s.slice(0, 2).toUpperCase();
}

const TOAST_MS = 2600;
const toastTimers = new WeakMap();

export function toast(message, type = 'ok') {
  const wrap = document.getElementById('toast');
  if (!wrap) return;

  // 同一条提示已经在屏上：只续命，不再叠一层（否则会堆成一片且永不消失）
  const same = [...wrap.querySelectorAll('.toast')].find((n) => n.dataset.msg === message);
  if (same) {
    clearTimeout(toastTimers.get(same));
    toastTimers.set(same, setTimeout(() => same.remove(), TOAST_MS));
    return;
  }

  const node = el(`<div class="toast ${type === 'err' ? 'err' : ''}"></div>`);
  node.dataset.msg = message;
  node.textContent = message;
  wrap.appendChild(node);
  toastTimers.set(node, setTimeout(() => node.remove(), TOAST_MS));

  // 最多同时 3 条，超出的把最老的挤掉
  const live = wrap.querySelectorAll('.toast');
  if (live.length > 3) live[0].remove();
}

export function modal({ title, body = '', okText = '确定', cancelText = '取消', danger = false, onOk }) {
  const wrap = document.getElementById('modal');
  wrap.hidden = false;
  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>
      <div class="body">${body}</div>
      <div class="foot">
        <button class="btn ghost" data-cancel>${esc(cancelText)}</button>
        <button class="btn ${danger ? 'danger' : ''}" data-ok>${esc(okText)}</button>
      </div>
    </div>`;
  const close = () => { wrap.hidden = true; wrap.innerHTML = ''; };
  wrap.querySelector('[data-cancel]').onclick = close;
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  wrap.querySelector('[data-ok]').onclick = async () => {
    const btn = wrap.querySelector('[data-ok]');
    btn.disabled = true;
    try {
      const keep = await onOk?.(wrap);
      if (keep !== false) close();
    } finally {
      btn.disabled = false;
    }
  };
  return close;
}

export function promptModal({ title, label, value = '', placeholder = '', okText = '保存', onOk }) {
  return modal({
    title,
    okText,
    body: `<label class="field"><span>${esc(label)}</span>
      <input type="text" id="pm-input" value="${esc(value)}" placeholder="${esc(placeholder)}">
    </label>`,
    onOk: (wrap) => onOk(wrap.querySelector('#pm-input').value.trim()),
  });
}

export function debounce(fn, ms = 250) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function elVal(root, sel) {
  const node = root.querySelector(sel);
  return node ? node.value : '';
}

// ─── Muse 3D 工位实时动作与行为定义系统 ──────────────────────────────────────

export const MUSE_POSTURES = {
  receiving: {
    key: 'receiving',
    icon: '📡',
    short: '入站接收',
    badge: 'RECEIVING',
    color: '#45e6f5',
    desc: '单手举起接收全息电波，头顶扩散声呐脉冲，屏幕显示入站波形',
  },
  coding: {
    key: 'coding',
    icon: '⌨️',
    short: '拆解推演',
    badge: 'CODING',
    color: '#35e08a',
    desc: '双手在 3D 键盘高速交替敲击，双联全息屏滚动代码与推理树',
  },
  dispatching: {
    key: 'dispatching',
    icon: '🚀',
    short: '出站派发',
    badge: 'DISPATCH',
    color: '#22c55e',
    desc: '高举发光数据包晶体，向对端工位或中继核发射能量脉冲',
  },
  handoff: {
    key: 'handoff',
    icon: '🔄',
    short: '跨工位协同',
    badge: 'HANDOFF',
    color: '#ff3f8e',
    desc: '侧身向协作工位挥手投射全息桥，同步 request_id 与上下文',
  },
  reviewing: {
    key: 'reviewing',
    icon: '🔍',
    short: '审校核验',
    badge: 'REVIEW',
    color: '#ffc21a',
    desc: '前倾审视双联屏，激光扫描线上下核验报文质量与路由合规性',
  },
  patrol: {
    key: 'patrol',
    icon: '🛰️',
    short: '巡检待命',
    badge: 'PATROL',
    color: '#a78bfa',
    desc: '工位呼吸待命，端起咖啡巡视绑定路由与队列水位',
  },
};

const PRESET_PROFILES = {
  muse: {
    duty: '总控指挥中枢 · 全局意图识别与跨分身任务编排',
    on_inbound: '接收主通道微信指令 → 语义解析意图并拆解多步子任务',
    on_process: '检索全局上下文记忆库 → 推演最优执行路径与分配方案',
    on_outbound: '汇总各分身执行回执 → 封装最终答复投递至微信终端',
    on_collab: '向 muse1~5号 分身广播协同上下文与 request_id 锁',
    on_idle: '全频段监听主路由队列 & 实时巡检各分身工位健康度',
  },
  'muse1号': {
    duty: '1号主力执行官 · 核心私聊/群聊对话闭环与工具调用',
    on_inbound: '捕获绑定会话入站消息 → 校验路由签名与上下文窗口',
    on_process: '高速推理生成答复方案 & 调取外部技能插件执行',
    on_outbound: '经由固定微信路由向目标群聊/联系人精准派发回复',
    on_collab: '向 Muse 主脑回传任务进度并与相邻分身交接长任务',
    on_idle: '保持热备长连接 · 监听 1号通道心跳与待办队列',
  },
  'muse2号': {
    duty: '2号内容与策略官 · 深度文案精修与结构化纪要生成',
    on_inbound: '接收复杂长文本指令 → 提取核心实体与结构化要点',
    on_process: '多轮润色推演与逻辑校验 · 生成高可读性答复稿',
    on_outbound: '向目标通道派发精修长文或结构化卡片报文',
    on_collab: '将提炼后的摘要结论同步至上下游协作工位',
    on_idle: '整理归档近期会话知识库片段 & 预热提示词模板',
  },
  'muse3号': {
    duty: '3号情报检索官 · 外部数据源查询与多源事实核验',
    on_inbound: '拦截查询类入站请求 → 解析检索关键词与时间范围',
    on_process: '并发扫描多维数据源 → 交叉比对事实置信度',
    on_outbound: '输出带来源标注的核验结论并回传中继核心',
    on_collab: '为其他 Muse 工位提供实时背景情报与数据支撑',
    on_idle: '周期性探活外部检索接口与 Webhook 回调延迟',
  },
  'muse4号': {
    duty: '4号高并发响应官 · 高频批量指令处理与极速应答',
    on_inbound: '批量拉取高并发入站报文 → 自动去重与优先级排序',
    on_process: '并行流水线高速推演 · 极速生成标准化响应负载',
    on_outbound: '批量向中继核心发射出站报文并确认送达回执',
    on_collab: '自动接管忙时工位溢出流量 · 平衡全网负载水位',
    on_idle: '监控全局吞吐水位线 & 预热高频问答缓存池',
  },
  'muse5号': {
    duty: '5号安全审计哨兵 · 链路合规核验与异常超时兜底',
    on_inbound: '扫描入站报文负载 → 识别异常格式、注入风险与超时单',
    on_process: '审计端到端链路完整性 & 生成安全兜底响应方案',
    on_outbound: '发送安全审计回执或异常告警通知至控制台',
    on_collab: '接管超时未闭环的跨工位任务并触发補償重试',
    on_idle: '静默巡航全网 3D 链路 · 守护 Webhook 鉴权边界',
  },
  upload: {
    duty: '多媒体附件专员 · 图片/语音/文件流解析与安全托管',
    on_inbound: '接收多媒体二进制流 → 校验 MIME 类型与字节上限',
    on_process: '清洗元数据、生成安全访问签名 URL 与缩略预览',
    on_outbound: '将媒体资源链接分发至目标会话或下游工位',
    on_collab: '为各 Muse 工位提供富媒体附件挂载与转存服务',
    on_idle: '巡检 storage/uploads 存储水位与静态资源可用性',
  },
  finch: {
    duty: '敏捷侦察特工 · 轻量级事件嗅探与快速信令转发',
    on_inbound: '敏捷捕获外部 Webhook 触发信令 → 提取事件指纹',
    on_process: '快速过滤噪声事件并匹配目标路由规则',
    on_outbound: '极速转发高价值信令至目标终端',
    on_collab: '向主控工位同步外部异动事件流',
    on_idle: '低功耗雷达旋转监听外部触发器脉冲',
  },
  hark: {
    duty: '回声监听专员 · 全链路回执确认与投递状态追踪',
    on_inbound: '监听入站回执与状态回调 → 匹配原始 request_id',
    on_process: '核算端到端往返时延 (RTT) 与投递成功率',
    on_outbound: '向发起方返回送达确认与链路诊断报告',
    on_collab: '协助中继核心校准时序配对置信度',
    on_idle: '持续监听回执通道 · 维护投递账本一致性',
  },
  huang: {
    duty: '专线驻守工位 · 定制化业务指令处理与督办跟进',
    on_inbound: '接收专线业务指令 → 解析督办事项与责任节点',
    on_process: '核对业务规则库并生成定制化跟进方案',
    on_outbound: '定向派发业务结果与进度简报',
    on_collab: '跨工位协调专项任务资源与优先级',
    on_idle: '值守专线通道 · 定时核查待办事项闭环率',
  },
};

export function getMuseActionProfile(agentOrName, customActionsMap = null) {
  const rawName = typeof agentOrName === 'string' ? agentOrName : (agentOrName?.name || '');
  const roleHint = typeof agentOrName === 'object' ? (agentOrName?.role || '') : '';
  const key = rawName.trim().toLowerCase();
  const preset = PRESET_PROFILES[key] || PRESET_PROFILES[rawName] || {
    duty: roleHint || `专项中继工位 (${rawName || 'Agent'}) · 负责指令接收、推理与报文派发`,
    on_inbound: `接收发往 ${rawName} 的入站指令 → 解析参数与会话上下文`,
    on_process: `在工位沙箱内推演处理逻辑 → 生成响应负载`,
    on_outbound: `封装出站报文 → 经中继核心派发至目标终端`,
    on_collab: `与关联工位同步 request_id 及协同状态`,
    on_idle: `驻守工位监听 Webhook 路由队列 · 周期性自检`,
  };
  const custom = (customActionsMap && customActionsMap[rawName]) || {};
  return {
    duty: custom.duty || preset.duty,
    on_inbound: custom.on_inbound || preset.on_inbound,
    on_process: custom.on_process || preset.on_process,
    on_outbound: custom.on_outbound || preset.on_outbound,
    on_collab: custom.on_collab || preset.on_collab,
    on_idle: custom.on_idle || preset.on_idle,
    forced_posture: custom.forced_posture || 'auto',
  };
}

export function resolveMuseLiveAction(agent, customActionsMap = null, burstOverride = null, nowSec = Date.now() / 1000) {
  const profile = getMuseActionProfile(agent, customActionsMap);
  const peersOut = agent?.peers_out || [];
  const peersIn = agent?.peers_in || [];
  const routes = agent?.routes || [];
  const topOut = peersOut[0]?.to ? (peersOut[0].to === 'relay' ? '中继核心' : peersOut[0].to) : (routes[0] ? `微信:${(routes[0].conversation_id || '').slice(0, 8)}` : '中继核心');
  const topIn = peersIn[0]?.from ? (peersIn[0].from === 'relay' ? '中继核心' : peersIn[0].from) : '外部终端';

  // 1. 实时突发消息或手动触发演练优先
  if (burstOverride && burstOverride.until > nowSec) {
    const pKey = burstOverride.posture || 'coding';
    const meta = MUSE_POSTURES[pKey] || MUSE_POSTURES.coding;
    const textMap = {
      receiving: profile.on_inbound,
      coding: profile.on_process,
      dispatching: profile.on_outbound,
      handoff: profile.on_collab,
      reviewing: profile.on_process,
      patrol: profile.on_idle,
    };
    const remain = Math.max(0, Math.min(1, (burstOverride.until - nowSec) / (burstOverride.duration || 8)));
    return {
      posture: pKey,
      meta,
      actionText: burstOverride.customText || textMap[pKey] || profile.on_process,
      targetLabel: pKey === 'receiving' ? `← ${topIn}` : `→ ${topOut}`,
      stepLabel: burstOverride.isManual ? '手动演练中' : '实时触发',
      progress: Math.round((1 - remain) * 100),
      profile,
      isLiveBurst: true,
    };
  }

  // 2. 用户固定了该工位的常态动作模式
  if (profile.forced_posture && profile.forced_posture !== 'auto' && MUSE_POSTURES[profile.forced_posture]) {
    const pKey = profile.forced_posture;
    const meta = MUSE_POSTURES[pKey];
    const textMap = {
      receiving: profile.on_inbound,
      coding: profile.on_process,
      dispatching: profile.on_outbound,
      handoff: profile.on_collab,
      reviewing: profile.on_process,
      patrol: profile.on_idle,
    };
    const cyc = Math.round(((nowSec * 18) % 100));
    return {
      posture: pKey,
      meta,
      actionText: textMap[pKey] || profile.on_process,
      targetLabel: pKey === 'receiving' ? `← ${topIn}` : `→ ${topOut}`,
      stepLabel: '固定动作模式',
      progress: cyc,
      profile,
      isLiveBurst: false,
    };
  }

  // 3. 根据工位实时在线状态、近期收发记录与流向自动推演当前动作
  let hash = 0;
  const nm = String(agent?.name || '');
  for (let i = 0; i < nm.length; i++) hash = (hash * 31 + nm.charCodeAt(i)) >>> 0;
  const phase = (nowSec + (hash % 19) * 1.7);
  const gap = agent?.last_ts ? (nowSec - agent.last_ts) : 999999;

  // 最近 90 秒内有真实消息活动
  if (gap < 90) {
    if (agent?.last_dir === 'inbound') {
      const subStage = Math.floor((nowSec % 10) / 5); // 0: receiving, 1: coding
      const pKey = subStage === 0 ? 'receiving' : 'coding';
      return {
        posture: pKey,
        meta: MUSE_POSTURES[pKey],
        actionText: pKey === 'receiving' ? profile.on_inbound : profile.on_process,
        targetLabel: `← ${topIn}`,
        stepLabel: pKey === 'receiving' ? 'STEP 1/3 · 入站捕获' : 'STEP 2/3 · 拆解推演',
        progress: Math.min(98, Math.round(((nowSec % 5) / 5) * 100)),
        profile,
        isLiveBurst: true,
      };
    }
    return {
      posture: 'dispatching',
      meta: MUSE_POSTURES.dispatching,
      actionText: profile.on_outbound,
      targetLabel: `→ ${topOut}`,
      stepLabel: 'STEP 3/3 · 报文派发',
      progress: Math.min(98, Math.round(((nowSec % 6) / 6) * 100)),
      profile,
      isLiveBurst: true,
    };
  }

  // 在线或活跃工位：按工位相位在「接收 -> 推演 -> 派发 -> 协同/审校」之间真实流转
  if (agent?.status === 'online' || agent?.status === 'active') {
    const hasCross = peersOut.some((p) => p.to !== 'relay') || peersIn.some((p) => p.from !== 'relay');
    const cyclePool = hasCross
      ? ['receiving', 'coding', 'dispatching', 'handoff']
      : ['receiving', 'coding', 'dispatching', 'reviewing'];
    const idx = Math.floor(phase / 7) % cyclePool.length;
    const pKey = cyclePool[idx];
    const textMap = {
      receiving: profile.on_inbound,
      coding: profile.on_process,
      dispatching: profile.on_outbound,
      handoff: profile.on_collab,
      reviewing: profile.on_process,
    };
    const stepNames = {
      receiving: 'STAGE 1 · 监听入站',
      coding: 'STAGE 2 · 编码推演',
      dispatching: 'STAGE 3 · 路由派发',
      handoff: 'STAGE 4 · 跨工位协同',
      reviewing: 'STAGE 4 · 上下文核验',
    };
    return {
      posture: pKey,
      meta: MUSE_POSTURES[pKey],
      actionText: textMap[pKey],
      targetLabel: pKey === 'receiving' ? `← ${topIn}` : `→ ${topOut}`,
      stepLabel: stepNames[pKey],
      progress: Math.round(((phase % 7) / 7) * 100),
      profile,
      isLiveBurst: false,
    };
  }

  // 有历史消息或绑定了路由的工位：在「审校核验」与「巡检待命」间切换
  if ((agent?.total || 0) > 0 || routes.length > 0) {
    const pKey = (Math.floor(phase / 11) % 3 === 0) ? 'reviewing' : 'patrol';
    return {
      posture: pKey,
      meta: MUSE_POSTURES[pKey],
      actionText: pKey === 'reviewing' ? profile.on_process : profile.on_idle,
      targetLabel: `⇄ ${topOut}`,
      stepLabel: pKey === 'reviewing' ? 'ROUTINE · 账本核验' : 'STANDBY · 路由值守',
      progress: Math.round(((phase % 11) / 11) * 100),
      profile,
      isLiveBurst: false,
    };
  }

  // 空置待命工位
  return {
    posture: 'patrol',
    meta: MUSE_POSTURES.patrol,
    actionText: profile.on_idle,
    targetLabel: '待绑定路由',
    stepLabel: 'STANDBY · 待命监听',
    progress: Math.round(((phase % 14) / 14) * 100),
    profile,
    isLiveBurst: false,
  };
}

export function openMuseActionModal(agent, storeRef, apiRef, onSaved) {
  const customMap = storeRef.settings?.muse_actions || {};
  const prof = getMuseActionProfile(agent, customMap);
  const label = agent.display_name || agent.name;

  const postureOptions = [
    ['auto', '⚡ 智能实时联动（根据收发报文与状态自动切换动作）'],
    ...Object.values(MUSE_POSTURES).map((p) => [p.key, `${p.icon} 固定为「${p.short}」(${p.badge}) — ${p.desc}`]),
  ];

  modal({
    title: `⚙️ 定义 Muse 工位动作 · ${label} (${agent.name})`,
    okText: '💾 保存动作定义',
    body: `
      <div style="font-size:12px;color:var(--ink-2);margin-bottom:10px;line-height:1.5">
        配置该 Muse 在 3D 指挥室与工作台中的<b>职能角色定位</b>及<b>各阶段触发动作定义</b>。保存后将实时驱动 3D 工位小人姿态、双联屏画面与动作 HUD。
      </div>
      <label class="field">
        <span>工位职能定位 (ROLE & DUTY)</span>
        <input type="text" id="ma-duty" value="${esc(prof.duty)}" placeholder="例如：1号主力执行官 · 核心对话闭环">
      </label>
      <label class="field">
        <span>3D 工位常态姿态模式 (POSTURE MODE)</span>
        <select id="ma-posture">
          ${postureOptions.map(([k, txt]) => `<option value="${esc(k)}" ${prof.forced_posture === k ? 'selected' : ''}>${esc(txt)}</option>`).join('')}
        </select>
      </label>
      <label class="field">
        <span>📡 收到入站消息时动作 (ON INBOUND)</span>
        <input type="text" id="ma-inbound" value="${esc(prof.on_inbound)}">
      </label>
      <label class="field">
        <span>⌨️ 工位内部拆解推演动作 (ON PROCESS / CODING)</span>
        <input type="text" id="ma-process" value="${esc(prof.on_process)}">
      </label>
      <label class="field">
        <span>🚀 发送出站回复时动作 (ON OUTBOUND / DISPATCH)</span>
        <input type="text" id="ma-outbound" value="${esc(prof.on_outbound)}">
      </label>
      <label class="field">
        <span>🔄 跨工位协同交接动作 (ON COLLAB / HANDOFF)</span>
        <input type="text" id="ma-collab" value="${esc(prof.on_collab)}">
      </label>
      <label class="field">
        <span>🛰️ 日常待命与巡检动作 (ON IDLE / PATROL)</span>
        <input type="text" id="ma-idle" value="${esc(prof.on_idle)}">
      </label>
      <div style="display:flex;justify-content:flex-end;margin-top:4px">
        <button type="button" class="btn ghost sm" id="ma-reset-btn">↺ 恢复该工位预设动作</button>
      </div>
    `,
    onOk: async (wrap) => {
      const nextMap = { ...(storeRef.settings?.muse_actions || {}) };
      nextMap[agent.name] = {
        duty: wrap.querySelector('#ma-duty').value.trim(),
        forced_posture: wrap.querySelector('#ma-posture').value,
        on_inbound: wrap.querySelector('#ma-inbound').value.trim(),
        on_process: wrap.querySelector('#ma-process').value.trim(),
        on_outbound: wrap.querySelector('#ma-outbound').value.trim(),
        on_collab: wrap.querySelector('#ma-collab').value.trim(),
        on_idle: wrap.querySelector('#ma-idle').value.trim(),
      };
      try {
        const res = await apiRef.saveSettings({ muse_actions: nextMap });
        storeRef.settings = res.settings;
        toast(`已保存 ${label} 的 3D 工位动作定义`);
        onSaved?.(nextMap[agent.name]);
      } catch (err) {
        // 即使当前账号只读，也在前端会话内立即生效
        storeRef.settings = { ...(storeRef.settings || {}), muse_actions: nextMap };
        toast(`已在当前视图应用 ${label} 的动作定义`);
        onSaved?.(nextMap[agent.name]);
      }
    },
  });

  const resetBtn = document.getElementById('ma-reset-btn');
  if (resetBtn) {
    resetBtn.onclick = () => {
      const def = getMuseActionProfile(agent, {});
      document.getElementById('ma-duty').value = def.duty;
      document.getElementById('ma-posture').value = 'auto';
      document.getElementById('ma-inbound').value = def.on_inbound;
      document.getElementById('ma-process').value = def.on_process;
      document.getElementById('ma-outbound').value = def.on_outbound;
      document.getElementById('ma-collab').value = def.on_collab;
      document.getElementById('ma-idle').value = def.on_idle;
      toast('已填入默认预设，点击「保存动作定义」即可生效');
    };
  }
}
