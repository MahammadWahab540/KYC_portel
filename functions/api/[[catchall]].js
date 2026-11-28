export async function onRequest(context) {
  const url = new URL(context.request.url);
  const backendBase = 'https://hearts-vendor-handmade-donald.trycloudflare.com';
  const targetUrl = new URL(url.pathname + url.search, backendBase);

  // Handle CORS preflight directly
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id',
        'Access-Control-Max-Age': '86400'
      }
    });
  }

  const modifiedRequest = new Request(targetUrl.toString(), {
    method: context.request.method,
    headers: context.request.headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    redirect: 'follow'
  });

  try {
    const response = await fetch(modifiedRequest);

    // If Cloudflare tunnel returned 530 or HTML error page
    if (response.status === 530 || (response.status >= 500 && (response.headers.get('content-type') || '').includes('text/html'))) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Authentication or backend gateway temporarily reconnecting. Please retry in a moment.',
          code: 'UPSTREAM_GATEWAY_RECONNECTING',
          upstreamStatus: response.status
        }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id'
          }
        }
      );
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Correlation-Id');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Backend gateway connection error',
        details: err.message,
        code: 'GATEWAY_ERROR'
      }),
      {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Correlation-Id'
        }
      }
    );
  }
}
