export const PROJECTS_KEY = 'floorplan-projects-v1';
export const LEGACY_STATE_KEY = 'huxing-design-v1';
export const floorplanKey = id => `floorplan-geometry-v1:${id}`;
export const schemesKey = id => `floorplan-schemes-v1:${id}`;
export const schemeKey = (floorplanId, schemeId) => `floorplan-scheme-v1:${floorplanId}:${schemeId}`;

const read = key => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export function ensureFloorplanStorage(id) {
  let schemes = read(schemesKey(id));
  let geometry = read(floorplanKey(id));
  if (!Array.isArray(schemes) || !schemes.length) {
    const oldKey = `${LEGACY_STATE_KEY}:${id}`;
    const oldState = read(oldKey) || (id === 'my-floorplan' ? read(LEGACY_STATE_KEY) : null);
    const now = Date.now(), schemeId = 'scheme-default';
    if (oldState && typeof oldState === 'object') {
      geometry = oldState.plan || geometry || null;
      const {plan: _oldPlan, ...schemeState} = oldState;
      write(schemeKey(id, schemeId), schemeState);
    }
    write(floorplanKey(id), geometry);
    schemes = [{id:schemeId,name:'默认方案',createdAt:now,updatedAt:now}];
    write(schemesKey(id), schemes);
  } else if (localStorage.getItem(floorplanKey(id)) === null) write(floorplanKey(id), null);
  return {geometry:read(floorplanKey(id)),schemes};
}

export function removeFloorplanStorage(id) {
  const {schemes} = ensureFloorplanStorage(id);
  localStorage.removeItem(floorplanKey(id));
  localStorage.removeItem(schemesKey(id));
  schemes.forEach(s => localStorage.removeItem(schemeKey(id,s.id)));
  localStorage.removeItem(`${LEGACY_STATE_KEY}:${id}`);
}

export function createImportedFloorplan(id, geometry, schemeState, now = Date.now()) {
  const scheme = {id:'scheme-default',name:'默认方案',createdAt:now,updatedAt:now};
  write(floorplanKey(id), geometry);
  write(schemesKey(id), [scheme]);
  write(schemeKey(id,scheme.id), schemeState);
  return scheme;
}
