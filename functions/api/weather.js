export async function onRequest(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get('lat'));
  const lon = parseFloat(url.searchParams.get('lon'));
  const model = url.searchParams.get('model') || 'gfs';

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return new Response(JSON.stringify({ error: 'Invalid coordinates' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const apiKey = env.WINDY_POINT_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured on server' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const body = {
    lat,
    lon,
    model,
    parameters: [
      'temp',
      'dewpoint',
      'precip',
      'wind_u-surface',
      'wind_v-surface',
      'gust',
      'humidity',
      'lclouds',
      'mclouds',
      'hclouds',
      'cape',
    ],
    levels: ['surface'],
    key: apiKey,
  };

  try {
    const resp = await fetch('https://api.windy.com/api/point-forecast/v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      return new Response(JSON.stringify({ error: 'Windy API error', detail }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=1800, stale-while-revalidate=3600',
        ...corsHeaders,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy error', detail: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
