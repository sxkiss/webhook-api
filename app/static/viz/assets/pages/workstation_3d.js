/**
 * 3D 5-Zone Command Office & Walking Agents Engine (v8)
 * 五方位分区办公大厅 · 全员直立清晰小人 · 回字形走廊真实走动 · 360° 透视旋转
 */

export const ZONE_META = {
  all:    { id: 'all',    label: '全景沙盘', color: '#45e6f5', cam: { yaw: 0.24, pitch: 0.48, zoom: 1.02, tx: 0, tz: 5 } },
  center: { id: 'center', label: '中枢沙盘', color: '#45e6f5', cam: { yaw: 0.15, pitch: 0.50, zoom: 1.32, tx: 0, tz: -25 } },
  north:  { id: 'north',  label: '北翼总控', color: '#38bdf8', cam: { yaw: 0.08, pitch: 0.46, zoom: 1.26, tx: 0, tz: -145 } },
  west:   { id: 'west',   label: '西翼接入', color: '#a855f7', cam: { yaw: 0.34, pitch: 0.48, zoom: 1.24, tx: -175, tz: -10 } },
  east:   { id: 'east',   label: '东翼派发', color: '#35e08a', cam: { yaw: -0.34, pitch: 0.48, zoom: 1.24, tx: 175, tz: -10 } },
  south:  { id: 'south',  label: '南翼会议·茶水', color: '#ffc21a', cam: { yaw: 0.18, pitch: 0.52, zoom: 1.18, tx: 0, tz: 145 } },
};

export function rotY(lx, lz, yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [lx * c + lz * s, -lx * s + lz * c];
}

// 3D -> 2D 透视投影：wy 始终竖直向上（屏幕 y 减小），绝不出现小人倒置或横躺
export function createProjector(cam, W, H) {
  const cosY = Math.cos(cam.yaw);
  const sinY = Math.sin(cam.yaw);
  const cosP = Math.cos(cam.pitch);
  const sinP = Math.sin(cam.pitch);
  const fov = Math.min(W, H) * 1.06 * cam.zoom;
  const dist = 760;

  return function project(wx, wy, wz) {
    const dx = wx - (cam.tx || 0);
    const dz = wz - (cam.tz || 0);
    const rx = dx * cosY - dz * sinY;
    const rz = dx * sinY + dz * cosY;

    // wy 竖直向上；rz 越往南(+Z)屏幕越靠下
    const ry = wy * cosP - rz * sinP;
    // 相机深度：越靠北(rz<0)越远(z越大)，越高(wy>0)离俯视镜头越近(z越小，后绘制覆盖地面)
    const cz = -rz * cosP - wy * sinP;

    const denom = Math.max(140, dist + cz);
    const f = fov / denom;
    return {
      x: W * 0.5 + rx * f,
      y: H * 0.55 - ry * f,
      z: cz,
      f,
      visible: denom > 145,
    };
  };
}

function fillStrokePoly(ctx, pts, fill, stroke, lw = 1) {
  if (!pts.every((p) => p.visible)) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}

// 根据工位数量动态构建五方位办公大厅（北翼总控、西翼入站、中枢全息岛、东翼出站、南翼会议室+工位+茶水间）
export function buildOfficePlan(agents) {
  const list = [...(agents || [])];
  const wings = { north: [], west: [], east: [], south: [] };

  // 前 2~3 个核心工位放北翼总控排，其余轮流分入 西翼、东翼、南翼、北翼，保证五方位均衡美观
  list.forEach((ag, i) => {
    if (i === 0) wings.north.push(ag);
    else {
      const cycle = ['west', 'east', 'north', 'south', 'west', 'east', 'north', 'south'];
      wings[cycle[(i - 1) % cycle.length]].push(ag);
    }
  });

  const northRows = Math.max(1, Math.ceil(wings.north.length / 4));
  const westRows = Math.max(1, Math.ceil(wings.west.length / 2));
  const eastRows = Math.max(1, Math.ceil(wings.east.length / 2));
  const southRows = Math.max(1, Math.ceil(wings.south.length / 2));
  const sideRows = Math.max(westRows, eastRows, 2);

  const halfW = Math.max(360, 310 + (wings.west.length > 4 || wings.east.length > 4 ? 55 : 0));
  const halfD = Math.max(255, 130 + (northRows + southRows + Math.max(0, sideRows - 2)) * 56);

  const desks = [];
  let deskNum = 1;
  const nextDeskLabel = () => `DESK #${String(deskNum++).padStart(2, '0')}`;

  // 1) 北翼 · 核心总控工位区（面朝北侧巨幕大屏 yaw = 0）
  wings.north.forEach((ag, i) => {
    const row = Math.floor(i / 4);
    const col = i % 4;
    const inRow = Math.min(4, wings.north.length - row * 4);
    const wx = (col - (inRow - 1) * 0.5) * 114;
    const wz = -(halfD - 76) + row * 76;
    desks.push({
      agent: ag,
      deskId: nextDeskLabel(),
      zone: i === 0 ? 'center' : 'north',
      wx,
      wz,
      baseY: 0,
      yaw: 0,
      scale: i === 0 ? 1.06 : 0.98,
      corridor: 'c_north',
      visitPos: [wx, wz + 36],
    });
  });

  // 2) 西翼 · 入站接入工位区（位于左侧紫青色分区地毯，微朝中央 -0.12 弧度，正姿直立）
  wings.west.forEach((ag, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const inRow = Math.min(2, wings.west.length - row * 2);
    const wx = -(halfW - 122) + col * 102 + (inRow === 1 ? 32 : 0);
    const wz = -42 + (row - (westRows - 1) * 0.5) * 84;
    desks.push({
      agent: ag,
      deskId: nextDeskLabel(),
      zone: 'west',
      wx,
      wz,
      baseY: 0,
      yaw: -0.12,
      scale: 0.98,
      corridor: 'c_west',
      visitPos: [wx + 32, wz + 32],
    });
  });

  // 3) 东翼 · 出站派发工位区（位于右侧翠绿色分区地毯，微朝中央 +0.12 弧度，正姿直立）
  wings.east.forEach((ag, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const inRow = Math.min(2, wings.east.length - row * 2);
    const wx = (halfW - 122) - col * 102 - (inRow === 1 ? 32 : 0);
    const wz = -42 + (row - (eastRows - 1) * 0.5) * 84;
    desks.push({
      agent: ag,
      deskId: nextDeskLabel(),
      zone: 'east',
      wx,
      wz,
      baseY: 0,
      yaw: 0.12,
      scale: 0.98,
      corridor: 'c_east',
      visitPos: [wx - 32, wz + 32],
    });
  });

  // 4) 南翼 · 协同工位区（位于西南会议室与东南茶水吧之间，正姿直立）
  wings.south.forEach((ag, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const inRow = Math.min(2, wings.south.length - row * 2);
    const wx = (col - (inRow - 1) * 0.5) * 112;
    const wz = halfD - 68 - row * 76;
    desks.push({
      agent: ag,
      deskId: nextDeskLabel(),
      zone: 'south',
      wx,
      wz,
      baseY: 0,
      yaw: 0,
      scale: 0.98,
      corridor: 'c_south',
      visitPos: [wx, wz - 34],
    });
  });

  // 回字形走廊路网（围绕中央全息沙盘台）
  const corrX = 92;
  const corrZTop = -82;
  const corrZBot = 82;
  const meetCenter = [-(halfW - 108), halfD - 64];
  const loungeCenter = [halfW - 108, halfD - 64];

  const nodes = {
    nw: [-corrX, corrZTop],
    c_north: [0, corrZTop],
    ne: [corrX, corrZTop],
    c_west: [-corrX, 0],
    c_hub: [0, 28],
    c_east: [corrX, 0],
    sw: [-corrX, corrZBot],
    c_south: [0, corrZBot],
    se: [corrX, corrZBot],
    meet_entry: [meetCenter[0] + 45, corrZBot],
    lounge_entry: [loungeCenter[0] - 45, corrZBot],
  };
  const adj = {
    nw: ['c_north', 'c_west'],
    c_north: ['nw', 'ne'],
    ne: ['c_north', 'c_east'],
    c_west: ['nw', 'sw', 'c_hub'],
    c_hub: ['c_west', 'c_east', 'c_south'],
    c_east: ['ne', 'se', 'c_hub'],
    sw: ['c_west', 'c_south', 'meet_entry'],
    c_south: ['sw', 'se', 'c_hub'],
    se: ['c_east', 'c_south', 'lounge_entry'],
    meet_entry: ['sw'],
    lounge_entry: ['se'],
  };

  const meetSeats = [
    { wx: meetCenter[0] - 30, wz: meetCenter[1] - 10, yaw: 0 },
    { wx: meetCenter[0] + 30, wz: meetCenter[1] - 10, yaw: 0 },
    { wx: meetCenter[0] - 30, wz: meetCenter[1] + 22, yaw: 0 },
    { wx: meetCenter[0] + 30, wz: meetCenter[1] + 22, yaw: 0 },
  ];

  const loungeSpots = [
    { wx: loungeCenter[0] - 22, wz: loungeCenter[1] + 10, yaw: 0, mode: 'stand' },
    { wx: loungeCenter[0] + 18, wz: loungeCenter[1] + 16, yaw: 0, mode: 'sit' },
    { wx: loungeCenter[0] + 34, wz: loungeCenter[1] - 6, yaw: 0, mode: 'stand' },
  ];

  return {
    halfW,
    halfD,
    desks,
    graph: { nodes, adj },
    meetCenter,
    meetSeats,
    loungeCenter,
    loungeSpots,
  };
}

export function findCorridorPath(plan, startNode, endNode, endPt) {
  const { nodes, adj } = plan.graph;
  if (!nodes[startNode] || !nodes[endNode]) return [endPt];
  if (startNode === endNode) return [nodes[startNode], endPt];
  const q = [[startNode]];
  const vis = new Set([startNode]);
  while (q.length) {
    const path = q.shift();
    const cur = path[path.length - 1];
    for (const nb of adj[cur] || []) {
      if (vis.has(nb)) continue;
      vis.add(nb);
      const next = [...path, nb];
      if (nb === endNode) {
        return [...next.map((id) => nodes[id]), endPt];
      }
      q.push(next);
    }
  }
  return [nodes[startNode], endPt];
}

// 绘制五方位建筑底板、区域地毯、北侧全息指挥大屏、西侧服务器机柜、中枢全息圆台、西南会议室、东南茶水吧
export function buildArchitectureScene(project, plan, themeColors, t) {
  const { halfW, halfD, meetCenter, loungeCenter } = plan;
  const cmds = [];
  const { isLight, isAmber, primaryHex } = themeColors;

  // 1) 地板与五方位分区地毯 + 走廊流光轨迹
  cmds.push({
    z: 99999,
    draw(ctx) {
      const fBL = project(-halfW, 0, -halfD);
      const fBR = project(halfW, 0, -halfD);
      const fFR = project(halfW, 0, halfD);
      const fFL = project(-halfW, 0, halfD);
      fillStrokePoly(
        ctx,
        [fBL, fBR, fFR, fFL],
        isLight ? 'rgba(241,245,249,0.94)' : (isAmber ? 'rgba(20,16,12,0.94)' : 'rgba(8,14,26,0.94)'),
        primaryHex,
        1.8,
      );

      // 3D 地板前缘厚度包边
      const bFL = project(-halfW, -10, halfD);
      const bFR = project(halfW, -10, halfD);
      const bBR = project(halfW, -10, -halfD);
      fillStrokePoly(ctx, [fFL, fFR, bFR, bFL], isLight ? '#cbd5e1' : '#16243d', primaryHex, 1);
      fillStrokePoly(ctx, [fFR, fBR, bBR, bFR], isLight ? '#94a3b8' : '#0f192d', primaryHex, 1);

      // 地面透视网格
      ctx.strokeStyle = isLight ? 'rgba(37,99,235,0.08)' : 'rgba(69,230,245,0.07)';
      ctx.lineWidth = 1;
      for (let gx = -halfW + 45; gx < halfW; gx += 45) {
        const p1 = project(gx, 0, -halfD);
        const p2 = project(gx, 0, halfD);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      for (let gz = -halfD + 45; gz < halfD; gz += 45) {
        const p1 = project(-halfW, 0, gz);
        const p2 = project(halfW, 0, gz);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }

      // 五大功能分区地面地毯框
      const drawCarpet = (x1, z1, x2, z2, fill, stroke, label) => {
        const pts = [project(x1, 0.4, z1), project(x2, 0.4, z1), project(x2, 0.4, z2), project(x1, 0.4, z2)];
        fillStrokePoly(ctx, pts, fill, stroke, 1.2);
        const lp = project((x1 + x2) * 0.5, 1, z1 + 14);
        if (lp.visible && lp.f > 0.32) {
          ctx.font = `700 ${Math.max(9, Math.round(10.5 * lp.f))}px "JetBrains Mono", "Microsoft YaHei", sans-serif`;
          ctx.fillStyle = stroke;
          ctx.textAlign = 'center';
          ctx.fillText(label, lp.x, lp.y);
        }
      };

      // 北翼、西翼、中枢、东翼、西南会议室、东南茶水吧
      drawCarpet(-235, -(halfD - 28), 235, -102, 'rgba(56,189,248,0.06)', 'rgba(56,189,248,0.45)', '▲ 北翼 · 核心总控工位区');
      drawCarpet(-(halfW - 42), -92, -108, 72, 'rgba(168,85,247,0.06)', 'rgba(168,85,247,0.45)', '◀ 西翼 · 入站接入区');
      drawCarpet(108, -92, halfW - 42, 72, 'rgba(53,224,138,0.06)', 'rgba(53,224,138,0.45)', '东翼 · 出站派发区 ▶');
      drawCarpet(-68, -56, 68, 56, 'rgba(69,230,245,0.09)', 'rgba(69,230,245,0.65)', '💠 中枢全息沙盘');
      drawCarpet(meetCenter[0] - 66, meetCenter[1] - 44, meetCenter[0] + 66, meetCenter[1] + 44, 'rgba(255,194,26,0.08)', 'rgba(255,194,26,0.55)', '🤝 西南 · 协同会议室');
      drawCarpet(loungeCenter[0] - 66, loungeCenter[1] - 44, loungeCenter[0] + 66, loungeCenter[1] + 44, 'rgba(53,224,138,0.08)', 'rgba(53,224,138,0.55)', '☕ 东南 · 茶水休闲吧');

      // 回字形走廊动态流光步道
      const g = plan.graph.nodes;
      const ring = [g.nw, g.ne, g.se, g.sw, g.nw].map(([x, z]) => project(x, 0.8, z));
      ctx.save();
      ctx.setLineDash([7, 6]);
      ctx.lineDashOffset = -(t * 20) % 13;
      ctx.strokeStyle = isLight ? 'rgba(37,99,235,0.4)' : 'rgba(69,230,245,0.42)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ring[0].x, ring[0].y);
      for (let i = 1; i < ring.length; i += 1) ctx.lineTo(ring[i].x, ring[i].y);
      ctx.stroke();
      ctx.restore();
    },
  });

  // 2) 北侧全息大屏墙 (MUSE COMMAND WALL)
  const wallZ = -(halfD - 14);
  cmds.push({
    z: project(0, 45, wallZ).z,
    draw(ctx) {
      const wBL = project(-185, 16, wallZ);
      const wBR = project(185, 16, wallZ);
      const wTR = project(185, 76, wallZ);
      const wTL = project(-185, 76, wallZ);
      fillStrokePoly(ctx, [wBL, wBR, wTR, wTL], isLight ? 'rgba(15,23,42,0.9)' : 'rgba(6,18,38,0.92)', primaryHex, 2);

      // 实时心电波形
      ctx.beginPath();
      for (let i = 0; i <= 28; i += 1) {
        const u = i / 28;
        const wx = -160 + u * 320;
        const wy = 40 + Math.sin(u * 10 + t * 4) * 8 + Math.cos(u * 20 - t * 5) * 4;
        const p = project(wx, wy, wallZ + 1);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = '#35e08a';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      const pTxt = project(0, 62, wallZ + 1);
      ctx.fillStyle = primaryHex;
      ctx.font = `700 ${Math.max(9, Math.round(11 * pTxt.f))}px "JetBrains Mono", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('MUSE COMMAND WALL · 五方位实时办公大厅', pTxt.x, pTxt.y);
    },
  });

  // 3) 中枢全息沙盘圆台 (位于大厅正中央 0, 0)
  cmds.push({
    z: project(0, 18, 0).z,
    draw(ctx) {
      // 底座环與全息台面
      for (const [ry, r, col, fill] of [
        [2, 34, '#45e6f5', 'rgba(14,58,77,0.75)'],
        [14, 26, '#35e08a', 'rgba(6,38,54,0.88)'],
      ]) {
        ctx.beginPath();
        for (let i = 0; i <= 24; i += 1) {
          const a = (Math.PI * 2 * i) / 24;
          const p = project(Math.cos(a) * r, ry, Math.sin(a) * r * 0.75);
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // 悬浮旋转能量核
      const coreP = project(0, 26 + Math.sin(t * 3) * 3, 0);
      ctx.fillStyle = '#45e6f5';
      ctx.beginPath();
      ctx.arc(coreP.x, coreP.y, Math.max(4, 6 * coreP.f), 0, Math.PI * 2);
      ctx.fill();
    },
  });

  // 4) 西侧 3D 服务器机柜阵列 & 东侧路由矩阵屏
  for (const rz of [-65, 0, 65]) {
    const rx = -(halfW - 22);
    cmds.push({
      z: project(rx, 25, rz).z,
      draw(ctx) {
        const b1 = project(rx - 12, 0, rz - 14);
        const b2 = project(rx + 12, 0, rz - 14);
        const t2 = project(rx + 12, 52, rz - 14);
        const t1 = project(rx - 12, 52, rz - 14);
        fillStrokePoly(ctx, [b1, b2, t2, t1], '#0f172a', '#a855f7', 1.3);
        for (let ly = 14; ly <= 44; ly += 10) {
          const lp = project(rx, ly, rz - 13);
          ctx.fillStyle = Math.sin(t * 5 + ly + rz) > 0 ? '#35e08a' : '#45e6f5';
          ctx.beginPath();
          ctx.arc(lp.x, lp.y, Math.max(1.8, 2.3 * lp.f), 0, Math.PI * 2);
          ctx.fill();
        }
      },
    });
  }

  // 5) 西南协同会议室（3D 椭圆会议桌 + 演示白板）
  cmds.push({
    z: project(meetCenter[0], 14, meetCenter[1]).z,
    draw(ctx) {
      const [mx, mz] = meetCenter;
      // 会议桌腿
      for (const dx of [-22, 22]) {
        const pT = project(mx + dx, 14, mz + 4);
        const pB = project(mx + dx, 0, mz + 4);
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = Math.max(2, 3 * pT.f);
        ctx.beginPath(); ctx.moveTo(pT.x, pT.y); ctx.lineTo(pB.x, pB.y); ctx.stroke();
      }
      // 会议桌面
      const tBL = project(mx - 38, 14, mz - 12);
      const tBR = project(mx + 38, 14, mz - 12);
      const tFR = project(mx + 38, 14, mz + 18);
      const tFL = project(mx - 38, 14, mz + 18);
      fillStrokePoly(ctx, [tBL, tBR, tFR, tFL], '#1e293b', '#ffc21a', 1.5);
    },
  });

  // 6) 东南茶水休闲吧（吧台 + 意式咖啡机 + 休闲沙发）
  cmds.push({
    z: project(loungeCenter[0], 16, loungeCenter[1]).z,
    draw(ctx) {
      const [lx, lz] = loungeCenter;
      const cBL = project(lx - 42, 16, lz - 18);
      const cBR = project(lx + 10, 16, lz - 18);
      const cFR = project(lx + 10, 16, lz - 2);
      const cFL = project(lx - 42, 16, lz - 2);
      fillStrokePoly(ctx, [cBL, cBR, cFR, cFL], '#78350f', '#f59e0b', 1.4);
      // 咖啡杯与热气
      const cup = project(lx - 16, 19, lz - 10);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(cup.x, cup.y, Math.max(2.5, 3.8 * cup.f), 0, Math.PI * 2);
      ctx.fill();

      // 绿色休闲沙发
      const sBL = project(lx + 4, 10, lz + 6);
      const sBR = project(lx + 48, 10, lz + 6);
      const sFR = project(lx + 48, 10, lz + 24);
      const sFL = project(lx + 4, 10, lz + 24);
      fillStrokePoly(ctx, [sBL, sBR, sFR, sFL], '#0f766e', '#35e08a', 1.3);
    },
  });

  return cmds;
}

// 绘制单个 3D 办公工位（发光地垫 + 编号 + 4腿办公桌 + 双联全息屏 + 实时代码流 + 安灯塔 + 工学椅）
export function buildDeskCmd(project, desk, postureColor, isSelected, isHovered, isLight, t = 0) {
  const { wx, wz, baseY = 0, yaw = 0, scale: sc = 1, deskId } = desk;
  const activeHighlight = isSelected || isHovered;
  const col = isSelected ? '#ffc21a' : postureColor;

  const toWorld = (lx, ly, lz) => {
    const [rx, rz] = rotY(lx * sc, lz * sc, yaw);
    return project(wx + rx, baseY + ly * sc, wz + rz);
  };

  const centerP = toWorld(0, 14, 0);
  if (!centerP.visible) return [];

  return [{
    z: centerP.z,
    draw(ctx) {
      // 1. 独立工位地垫
      const padPts = [toWorld(-42, 0.5, -30), toWorld(42, 0.5, -30), toWorld(42, 0.5, 34), toWorld(-42, 0.5, 34)];
      fillStrokePoly(
        ctx,
        padPts,
        activeHighlight ? 'rgba(69,230,245,0.18)' : (isLight ? 'rgba(226,232,240,0.85)' : 'rgba(13,22,40,0.88)'),
        col,
        activeHighlight ? 2.2 : 1.2,
      );

      // 地垫前缘工位编号 (DESK #01..#18)
      const numPos = toWorld(-30, 1, 27);
      if (numPos.f > 0.3) {
        ctx.fillStyle = col;
        ctx.font = `700 ${Math.max(8, Math.round(9.5 * numPos.f))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'left';
        ctx.fillText(deskId, numPos.x, numPos.y);
      }

      // 2. 四根桌腿 + 桌面 (y = 16)
      for (const [lx, lz] of [[-30, -18], [30, -18], [-30, 2], [30, 2]]) {
        const legT = toWorld(lx, 16, lz);
        const legB = toWorld(lx, 0.5, lz);
        ctx.beginPath();
        ctx.moveTo(legT.x, legT.y);
        ctx.lineTo(legB.x, legB.y);
        ctx.strokeStyle = isLight ? '#64748b' : '#334155';
        ctx.lineWidth = Math.max(1.2, 2.0 * centerP.f);
        ctx.stroke();
      }

      const deskPts = [toWorld(-34, 16, -20), toWorld(34, 16, -20), toWorld(34, 16, 4), toWorld(-34, 16, 4)];
      fillStrokePoly(ctx, deskPts, isLight ? '#ffffff' : '#131f35', col, 1.5);

      // 桌面发光键盘 + 咖啡杯
      const kbL = toWorld(-10, 17, -3);
      const kbR = toWorld(10, 17, -3);
      ctx.beginPath();
      ctx.moveTo(kbL.x, kbL.y);
      ctx.lineTo(kbR.x, kbR.y);
      ctx.strokeStyle = col;
      ctx.lineWidth = Math.max(2, 3.0 * centerP.f);
      ctx.stroke();

      const mug = toWorld(21, 18, -4);
      ctx.beginPath();
      ctx.arc(mug.x, mug.y, Math.max(2, 2.8 * mug.f), 0, Math.PI * 2);
      ctx.fillStyle = '#f59e0b';
      ctx.fill();

      // 3. 双联全息显示屏 (y = 18..33) + 动态代码行
      for (const sideSign of [-1, 1]) {
        const xIn = sideSign * 2;
        const xOut = sideSign * 25;
        const sPts = [toWorld(xIn, 18, -17), toWorld(xOut, 18, -13), toWorld(xOut, 33, -13), toWorld(xIn, 33, -17)];
        fillStrokePoly(ctx, sPts, isLight ? 'rgba(15,23,42,0.88)' : 'rgba(6,24,48,0.92)', col, 1.2);

        for (let ln = 0; ln < 3; ln += 1) {
          const ly = 21 + ln * 3.5;
          const ratio = 0.45 + ((ln * 29 + Math.floor(t * 8)) % 50) / 100;
          const l1 = toWorld(sideSign * 4, ly, -16.5);
          const l2 = toWorld(sideSign * (4 + 17 * ratio), ly, -14);
          ctx.beginPath();
          ctx.moveTo(l1.x, l1.y);
          ctx.lineTo(l2.x, l2.y);
          ctx.strokeStyle = ln === 0 ? '#ffffff' : col;
          ctx.lineWidth = Math.max(1, 1.4 * centerP.f);
          ctx.stroke();
        }
      }

      // 4. 右上角三色安灯塔
      const andonB = toWorld(30, 16, -17);
      const andonT = toWorld(30, 39, -17);
      ctx.beginPath();
      ctx.moveTo(andonB.x, andonB.y);
      ctx.lineTo(andonT.x, andonT.y);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = Math.max(1.2, 1.8 * centerP.f);
      ctx.stroke();

      const lampCols = ['#35e08a', '#ffc21a', col];
      [28, 33, 38.5].forEach((ly, idx) => {
        const lp = toWorld(30, ly, -17);
        ctx.beginPath();
        ctx.arc(lp.x, lp.y, (idx === 2 ? 3.5 : 2.3) * lp.f, 0, Math.PI * 2);
        ctx.fillStyle = lampCols[idx];
        ctx.fill();
      });
    },
  }];
}

// 绘制 100% 直立清晰的 3D 智能体小人（坐姿敲代码/收发 + 走廊迈步走动送件/开会/喝咖啡）
export function buildAgentCharacterCmd(project, actor, t) {
  const { wx, wz, baseY = 0, yaw = 0, mode, action, walkPhase = 0, color, carrying } = actor;
  const walking = mode === 'walk';
  const standing = walking || mode === 'stand';

  // 坐姿位于桌前椅子 (lz = +11)，行走/站立位于当前世界坐标
  const [offX, offZ] = standing ? [0, 0] : rotY(0, 11, yaw);
  const cx = wx + offX;
  const cz = wz + offZ;

  // 注意：人物身体使用朝向桌面的小角度，保证在任何视角下都垂直挺拔、绝不斜躺！
  const poseYaw = standing ? 0 : yaw * 0.35;
  const toChar = (lx, ly, lz) => {
    const [rx, rz] = rotY(lx, lz, poseYaw);
    return project(cx + rx, baseY + ly, cz + rz);
  };

  const breath = walking
    ? Math.abs(Math.sin(walkPhase * 2)) * 2.5
    : Math.sin(t * 3.2 + actor.seed) * 1.2;
  const leanZ = (!standing && (action === 'coding' || action === 'reviewing')) ? -2.5 : 0;

  const headPos = toChar(0, (standing ? 38 : 35) + breath, leanZ);
  const pillPos = toChar(0, (standing ? 49 : 46) + breath, leanZ);
  if (!headPos.visible) return null;

  return {
    z: headPos.z - 2,
    headScreen: pillPos,
    draw(ctx) {
      const sc = headPos.f;

      // 1) 行走/站立时的脚下光环与迈步双腿
      if (standing) {
        const ground = toChar(0, 1, 0);
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.8;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.ellipse(ground.x, ground.y, Math.max(9, 14 * sc), Math.max(4, 7 * sc), 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // 交替迈步双腿
        for (const side of [-1, 1]) {
          const stepX = side * 4.2;
          const liftY = walking ? Math.max(0, Math.sin(walkPhase + (side === 1 ? 0 : Math.PI))) * 4.5 : 0;
          const strideZ = walking ? Math.cos(walkPhase + (side === 1 ? 0 : Math.PI)) * 5 : 0;
          const hipP = toChar(stepX, 15 + breath * 0.5, 0);
          const footP = toChar(stepX, 2 + liftY, strideZ);
          ctx.beginPath();
          ctx.moveTo(hipP.x, hipP.y);
          ctx.lineTo(footP.x, footP.y);
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = Math.max(2.5, 4.2 * sc);
          ctx.lineCap = 'round';
          ctx.stroke();
        }
      }

      // 2) 直立躯干 (Torso: hip y=12..15 -> shoulder y=27..30)
      const hip = toChar(0, standing ? 15 : 11, 0);
      const shoulder = toChar(0, (standing ? 29 : 26) + breath * 0.5, leanZ);
      ctx.beginPath();
      ctx.moveTo(hip.x, hip.y);
      ctx.lineTo(shoulder.x, shoulder.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(6, 10 * sc);
      ctx.lineCap = 'round';
      ctx.stroke();

      // 3) 左右手臂实时动作
      const shL = toChar(-6, (standing ? 28 : 25) + breath * 0.5, leanZ);
      const shR = toChar(6, (standing ? 28 : 25) + breath * 0.5, leanZ);
      let handL;
      let handR;

      if (walking) {
        const sw = Math.sin(walkPhase) * 6;
        handL = toChar(-9, 18, sw);
        handR = carrying ? toChar(8, 22, -6) : toChar(9, 18, -sw);
      } else if (action === 'coding') {
        const tapL = Math.sin(t * 18 + actor.seed) * 2.8;
        const tapR = Math.cos(t * 18 + actor.seed) * 2.8;
        handL = toChar(-6, 17.5 + Math.max(0, tapL), -12);
        handR = toChar(6, 17.5 + Math.max(0, tapR), -12);
      } else if (action === 'receiving') {
        handL = toChar(-7, 17.5, -10);
        handR = toChar(11, 35 + Math.sin(t * 8) * 2.0, -2);
      } else if (action === 'dispatching') {
        handL = toChar(-7, 18.0, -10);
        handR = toChar(12, 40 + Math.sin(t * 10) * 3.0, -6);
      } else if (action === 'handoff') {
        handL = toChar(-7, 18.0, -8);
        handR = toChar(16 + Math.sin(t * 9) * 3.5, 30, -2);
      } else {
        handL = toChar(-7, 17.5, -9);
        handR = toChar(14, 19.5 + Math.sin(t * 2.5) * 1.8, -10);
      }

      for (const [sh, hd] of [[shL, handL], [shR, handR]]) {
        ctx.beginPath();
        ctx.moveTo(sh.x, sh.y);
        ctx.lineTo(hd.x, hd.y);
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.max(2.2, 3.8 * sc);
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(hd.x, hd.y, Math.max(1.8, 2.6 * hd.f), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }

      // 手持送件夹或咖啡杯
      if (carrying) {
        ctx.fillStyle = carrying === 'coffee' ? '#f59e0b' : '#45e6f5';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        const w = Math.max(5, 8 * sc);
        const h = Math.max(6, 9 * sc);
        ctx.fillRect(handR.x - w * 0.5, handR.y - h * 0.5, w, h);
        ctx.strokeRect(handR.x - w * 0.5, handR.y - h * 0.5, w, h);
      }

      // 4) 坐姿时的工学椅背（包裹在身后 lz = +5）
      if (!standing) {
        const chPts = [toChar(-8, 9, 5), toChar(8, 9, 5), toChar(7, 23, 6), toChar(-7, 23, 6)];
        fillStrokePoly(ctx, chPts, '#1e293b', color, 1.1);
      }

      // 5) 3D 发光头部（始终在躯干正上方！）+ 头顶战术光环
      ctx.save();
      ctx.beginPath();
      ctx.arc(headPos.x, headPos.y, Math.max(5, 7.4 * sc), 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.0;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      for (let i = 0; i <= 20; i += 1) {
        const a = (Math.PI * 2 * i) / 20 + t * 2.2;
        const hp = toChar(Math.cos(a) * 8.5, (standing ? 46 : 43) + breath, leanZ + Math.sin(a) * 8.5);
        if (i === 0) ctx.moveTo(hp.x, hp.y);
        else ctx.lineTo(hp.x, hp.y);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    },
  };
}
