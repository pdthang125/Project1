const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export interface Env {}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });

const categories = ['Hardware', 'Projector', 'AC', 'Electrical', 'Furniture'];

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ── CORS preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // ── Health check ──
    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, service: 'vku-field-survey-api', timestamp: Date.now() });
    }

    // ── GET /api/surveys — health / stats endpoint ──
    if (url.pathname === '/api/surveys' && request.method === 'GET') {
      return json({ ok: true, message: 'VKU Field Survey API is running.' });
    }

    // ── POST /api/surveys — accept survey payload ──
    if (url.pathname === '/api/surveys' && request.method === 'POST') {
      try {
        const body = (await request.json()) as Record<string, unknown>;

        const requiredText = ['uuid', 'building', 'floor', 'room', 'notes'];
        if (requiredText.some((key) => typeof body[key] !== 'string')) {
          return json({ success: false, error: 'Missing or invalid required text fields' }, 400);
        }
        if (typeof body.timestamp !== 'number' || !Number.isFinite(body.timestamp)) {
          return json({ success: false, error: 'Invalid timestamp' }, 400);
        }
        if (!categories.includes(String(body.category))) {
          return json({ success: false, error: 'Invalid category' }, 400);
        }
        if (!Number.isInteger(body.rating) || Number(body.rating) < 1 || Number(body.rating) > 5) {
          return json({ success: false, error: 'Rating must be an integer between 1 and 5' }, 400);
        }

        console.log('Survey received', {
          uuid: body.uuid,
          category: body.category,
          building: body.building,
          room: body.room,
          rating: body.rating,
          timestamp: body.timestamp,
        });

        return json({ success: true, uuid: body.uuid, receivedAt: Date.now() });
      } catch {
        return json({ success: false, error: 'Invalid JSON body' }, 400);
      }
    }

    return new Response('Not found', { status: 404, headers: CORS_HEADERS });
  },
};