// Lettura dei conteggi consenso-indipendenti: le scansioni QR le scrive
// countScan in src/middleware.ts, le pagine viste ("v:") le scrive /api/hit.
// Protetto da ADMIN_TOKEN. Uso:
//   /api/scan-counts?token=...&days=14
import type { APIRoute } from 'astro';
import { kvHGetAll } from '../../lib/kv';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const token = url.searchParams.get('token');
  const admin = import.meta.env.ADMIN_TOKEN;
  if (!admin || token !== admin) {
    return new Response('Unauthorized', { status: 401 });
  }

  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') || 30)));
  const byDay: Record<string, Record<string, number>> = {};
  const totals: Record<string, number> = {};
  // Le chiavi "v:" sono le pagine viste di tutto il sito: escono a parte, così
  // totals/byDay restano quello che erano (solo scansioni partner).
  const viewsByDay: Record<string, number> = {};
  const viewsByPath: Record<string, number> = {};
  const now = new Date();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(now);
    d.setUTCDate(now.getUTCDate() - i);
    const day = d.toISOString().slice(0, 10);
    const rec = await kvHGetAll('scan-counts', day);
    if (!rec || !Object.keys(rec).length) continue;

    const scans: Record<string, number> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (!k.startsWith('v:')) {
        scans[k] = v;
        totals[k] = (totals[k] || 0) + v;
      } else if (k === 'v:__all') {
        viewsByDay[day] = v;
      } else {
        const path = k.slice(2);
        viewsByPath[path] = (viewsByPath[path] || 0) + v;
      }
    }
    if (Object.keys(scans).length) byDay[day] = scans;
  }

  const sortDesc = (o: Record<string, number>) =>
    Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
  const viewsTotal = Object.values(viewsByDay).reduce((a, b) => a + b, 0);
  const body = {
    days,
    totals: sortDesc(totals),
    byDay,
    views: { total: viewsTotal, byDay: viewsByDay, byPath: sortDesc(viewsByPath) },
  };
  return new Response(JSON.stringify(body, null, 2), {
    headers: { 'content-type': 'application/json' },
  });
};
