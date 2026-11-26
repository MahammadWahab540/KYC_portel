export async function onRequest(context) {
  const url = new URL(context.request.url);
  // Forward all /api/v1/* requests to the live backend tunnel
  const backendBase = 'https://talent-eyes-yorkshire-wind.trycloudflare.com';
  const targetUrl = new URL(url.pathname + url.search, backendBase);

  const modifiedRequest = new Request(targetUrl.toString(), {
    method: context.request.method,
    headers: context.request.headers,
    body: ['GET', 'HEAD'].includes(context.request.method) ? undefined : context.request.body,
    redirect: 'follow'
  });

  try {
    const response = await fetch(modifiedRequest);
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Backend proxy error', details: err.message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
