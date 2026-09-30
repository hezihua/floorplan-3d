const number = value => Number.parseFloat(value || '0') || 0;

function readEntities(text) {
  const raw = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  while (raw.length && !raw.at(-1).trim()) raw.pop();
  if (raw.length < 4 || raw.length % 2 !== 0) throw new Error('DXF 文件格式不正确');
  const pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([Number.parseInt(raw[i].trim(), 10), raw[i + 1].trim()]);
  const entitiesAt = pairs.findIndex(([code, value]) => code === 2 && value.toUpperCase() === 'ENTITIES');
  if (entitiesAt < 0) throw new Error('DXF 文件中没有 ENTITIES 图元');
  let endAt = pairs.findIndex((p, i) => i > entitiesAt && p[0] === 0 && p[1].toUpperCase() === 'ENDSEC');
  if (endAt < 0) endAt = pairs.length;
  const entities = [];
  for (let i = entitiesAt + 1; i < endAt;) {
    if (pairs[i][0] !== 0) { i++; continue; }
    const type = pairs[i][1].toUpperCase(); let j = i + 1;
    while (j < endAt && pairs[j][0] !== 0) j++;
    const fields = pairs.slice(i + 1, j);
    const get = code => fields.find(p => p[0] === code)?.[1];
    const layer = get(8) || '0';
    if (type === 'LINE') {
      entities.push({type, layer, points:[[number(get(10)),number(get(20))],[number(get(11)),number(get(21))]], closed:false});
    } else if (type === 'LWPOLYLINE') {
      const points = []; let x;
      for (const [code, value] of fields) {
        if (code === 10) { x = number(value); points.push([x, 0]); }
        if (code === 20 && points.length) points[points.length - 1][1] = number(value);
      }
      if (points.length >= 2) entities.push({type, layer, points, closed:(number(get(70)) & 1) !== 0});
    } else if (type === 'POLYLINE') {
      const points = []; let k = j;
      while (k < endAt && pairs[k][0] === 0 && pairs[k][1].toUpperCase() === 'VERTEX') {
        let m = k + 1; while (m < endAt && pairs[m][0] !== 0) m++;
        const v = pairs.slice(k + 1, m), x = number(v.find(p=>p[0]===10)?.[1]), y = number(v.find(p=>p[0]===20)?.[1]); points.push([x,y]); k=m;
      }
      entities.push({type, layer, points, closed:(number(get(70)) & 1) !== 0});
      j = k;
    }
    i = j;
  }
  return {pairs, entities};
}

function drawingScale(pairs) {
  const at = pairs.findIndex(([code, value]) => code === 9 && value === '$INSUNITS');
  const unit = at < 0 ? 4 : Number.parseInt(pairs.slice(at + 1, at + 5).find(p => p[0] === 70)?.[1] || '4', 10);
  return ({1:25.4,2:304.8,3:1609344,4:1,5:10,6:1000,7:1000000,8:0.0000254,9:0.0254,10:914.4,11:0.0000001,12:0.000001,13:0.001,14:100})[unit] || 1;
}

const layerKind = name => {
  const s = name.toLowerCase();
  if (/window|win|窗/.test(s)) return 'window';
  if (/door|门/.test(s)) return 'door';
  if (/room|space|area|floor|房间|地面|户型/.test(s)) return 'room';
  if (/wall|墙|隔墙|承重/.test(s)) return 'wall';
  return '';
};
const bbox = points => [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];

export function parseDxf(text) {
  const {pairs, entities} = readEntities(text), scale = drawingScale(pairs), warnings = [];
  const usable = entities.filter(e => e.points.length >= 2).map(e => ({...e, points:e.points.map(([x,y])=>[x*scale,y*scale])}));
  const all = usable.flatMap(e => e.points);
  if (!all.length) throw new Error('没有找到可导入的直线或多段线');
  const ext = bbox(all), span = Math.max(ext[2]-ext[0], ext[3]-ext[1]);
  if (span < 100 || span > 1000000) throw new Error('图形尺寸异常；请检查 DXF 单位设置');
  const map = ([x,y]) => [Math.round(x-ext[0]), Math.round(ext[3]-y)];
  const rooms = [], walls = [], wins = [], doors = [];
  const unique = new Set();
  const addWall = (a,b,layer) => {
    const dx = b[0]-a[0], dy = b[1]-a[1], eps = Math.max(2, scale*2);
    if (Math.abs(dx) < eps && Math.abs(dy) < eps) return;
    if (Math.abs(dx) > eps && Math.abs(dy) > eps) { warnings.push(`已跳过斜向墙线（图层 ${layer}）；当前户型墙体需水平或垂直`); return; }
    const kind = layer.toLowerCase();
    const width = /exterior|outside|外墙/.test(kind) ? 240 : /bearing|struct|承重/.test(kind) ? 200 : 120;
    const type = /bearing|struct|承重/.test(kind) ? 'b' : /exterior|outside|外墙/.test(kind) ? 'e' : 'n';
    const [x0,y0] = a, [x1,y1] = b;
    const rect = Math.abs(dx) >= Math.abs(dy)
      ? [Math.min(x0,x1),Math.round((y0+y1)/2-width/2),Math.max(x0,x1),Math.round((y0+y1)/2+width/2),type]
      : [Math.round((x0+x1)/2-width/2),Math.min(y0,y1),Math.round((x0+x1)/2+width/2),Math.max(y0,y1),type];
    const key = rect.join(','); if (!unique.has(key)) { unique.add(key); walls.push(rect); }
  };
  for (const e of usable) {
    const kind = layerKind(e.layer), pts = e.points.map(map), closedPts = e.closed && pts.length > 2 ? pts.concat([pts[0]]) : pts;
    if (kind === 'room' && e.closed && pts.length >= 3) {
      const poly = pts.slice(); if (poly.length > 1 && poly[0][0] === poly.at(-1)[0] && poly[0][1] === poly.at(-1)[1]) poly.pop();
      if (poly.length >= 3 && Math.abs((poly.reduce((s,p,i)=>{const q=poly[(i+1)%poly.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2) > 1e6) {
        const id = `room-${rooms.length+1}`, b = bbox(poly);
        rooms.push({id,name:`房间 ${rooms.length+1}`,poly,mat:'tile800',at:[Math.round((b[0]+b[2])/2),Math.round((b[1]+b[3])/2)]});
      }
    } else if (kind === 'window' && e.closed) {
      const [x0,y0,x1,y1] = bbox(pts); if (x1>x0 && y1>y0) wins.push([x0,y0,x1,y1]);
    } else if (kind === 'door' && e.closed) {
      const [x0,y0,x1,y1] = bbox(pts), horizontal = x1-x0 >= y1-y0;
      if (x1>x0 && y1>y0) {
        const len = horizontal ? x1-x0 : y1-y0;
        doors.push({name:`门 ${doors.length+1}`,rect:[x0,y0,x1,y1],h:horizontal?[x0,y0]:[x0,y0],c:horizontal?[1,0]:[0,1],o:horizontal?[0,1]:[-1,0],len});
      }
    } else if (kind === 'wall') {
      for (let i=0;i<closedPts.length-1;i++) addWall(closedPts[i],closedPts[i+1],e.layer);
    }
  }
  if (!rooms.length) throw new Error('没有识别到房间边界。请将房间闭合多段线放在名称含 ROOM / SPACE / 房间 的图层');
  if (!walls.length) rooms.forEach(r => { const pts = r.poly.concat([r.poly[0]]); for (let i=0;i<pts.length-1;i++) addWall(pts[i],pts[i+1],'WALL'); });
  const openings = wins.concat(doors.map(d=>d.rect));
  if (openings.length) {
    const split = [];
    for (const wall of walls) {
      const [x0,y0,x1,y1,type] = wall, horizontal = x1-x0 >= y1-y0;
      let spans = [[horizontal ? x0 : y0, horizontal ? x1 : y1]];
      for (const [a,b,c,d] of openings) {
        const crosses = horizontal ? d >= y0 && b <= y1 : c >= x0 && a <= x1;
        if (!crosses) continue;
        const lo = horizontal ? a : b, hi = horizontal ? c : d;
        spans = spans.flatMap(([s,e]) => hi <= s || lo >= e ? [[s,e]] : [[s,Math.max(s,lo)],[Math.min(e,hi),e]].filter(([u,v])=>v-u>20));
      }
      spans.forEach(([s,e]) => split.push(horizontal ? [s,y0,e,y1,type] : [x0,s,x1,e,type]));
    }
    walls.splice(0,walls.length,...split);
  }
  if (warnings.length) warnings.splice(6);
  const wallSet = new Set(walls.map(w=>w[4]));
  return {rooms,walls,wins,doors,slides:[],warnings,units:'mm',wallHeight:2800,wallTypes:[...wallSet]};
}
