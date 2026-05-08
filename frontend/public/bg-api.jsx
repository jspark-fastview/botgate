// API wrapper — token-api 연결
// bg-data.jsx 의 목 데이터를 실데이터로 교체

const API_BASE = window.API_BASE || 'http://localhost:3000';

const API = {
  async get(path) {
    const res = await fetch(API_BASE + path);
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return res.json();
  },

  async post(path, body) {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
    return res.json();
  },

  // 봇별 접근 통계 → [{ bot_ua, count }]
  getStatsBots:   () => API.get('/admin/stats/bots'),
  // 도메인별 통계 → [{ domain, count }]
  getStatsDomains:() => API.get('/admin/stats/domains'),
  // 일별 접근량 (30일) → [{ date, count }]
  getStatsDaily:  () => API.get('/admin/stats/daily'),
  // 토큰 목록
  getTokens:      () => API.get('/admin/tokens'),
  // 최근 로그 → [{ id, token, bot_ua, domain, ip, verified, ts }]
  getLogs:        (limit = 100) => API.get(`/admin/logs?limit=${limit}`),
  // 토큰 발급
  createToken:    (owner, plan) => API.post('/tokens', { owner, plan }),
  // 어드민 토큰 발급
  createAdminToken:(owner, plan) => API.post('/admin/tokens', { owner, plan }),
  // 토큰 활성/비활성
  setTokenActive: (id, active) =>
    fetch(`${API_BASE}/admin/tokens/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    }),
};

// useApi(fn) — 비동기 데이터 훅
function useApi(fn, deps = []) {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error,   setError]   = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    fn()
      .then(d  => { if (alive) { setData(d); setLoading(false); } })
      .catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, deps);

  return { data, loading, error };
}

// usePolling(fn, ms) — 주기적 폴링 훅
function usePolling(fn, ms = 3000) {
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    let alive = true;
    const tick = () => fn().then(d => { if (alive) setData(d); }).catch(() => {});
    tick();
    const id = setInterval(tick, ms);
    return () => { alive = false; clearInterval(id); };
  }, []);

  return data;
}
