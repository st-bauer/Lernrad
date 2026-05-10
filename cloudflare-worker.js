/**
 * Cloudflare Worker – Nextcloud WebDAV Proxy
 * ─────────────────────────────────────────────
 * Leitet GET und PUT Anfragen an Nextcloud WebDAV weiter.
 * Löst CORS-Problem zwischen GitHub Pages und Nextcloud.
 *
 * EINRICHTUNG:
 * 1. Neuen Worker in Cloudflare erstellen
 * 2. Diesen Code einfügen
 * 3. Unter "Settings → Variables" folgende Umgebungsvariablen setzen:
 *    - NEXTCLOUD_URL  → https://cloudfiles.senckenberg-runkel.de/remote.php/dav/files/da65e470-cdc4-45fb-81f6-7438e75284ce/
 *    - NEXTCLOUD_PASS → dein Nextcloud App-Passcode
 * 4. Worker deployen
 * 5. Worker-URL (z.B. https://lerncoaching.DEINNAME.workers.dev) ins Dashboard eintragen
 */

export default {
  async fetch(request, env) {

    // ── CORS Preflight ──
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // ── Nur GET und PUT erlaubt ──
    if (!['GET', 'PUT'].includes(request.method)) {
      return new Response('Method not allowed', {
        status: 405,
        headers: corsHeaders(),
      });
    }

    // ── Konfiguration aus Umgebungsvariablen ──
    const nextcloudUrl = env.NEXTCLOUD_URL;
    const nextcloudPass = env.NEXTCLOUD_PASS;
    const filename = env.NEXTCLOUD_FILE || 'lerncoaching.json';

    if (!nextcloudUrl || !nextcloudPass) {
      return new Response(JSON.stringify({
        error: 'Worker nicht konfiguriert. Bitte NEXTCLOUD_URL und NEXTCLOUD_PASS als Umgebungsvariablen setzen.'
      }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }

    // ── Datei-URL zusammenbauen ──
    const fileUrl = nextcloudUrl.endsWith('/')
      ? nextcloudUrl + filename
      : nextcloudUrl + '/' + filename;

    // ── Auth-Header für Nextcloud ──
    // Nextcloud App-Passcodes funktionieren ohne Username
    const authHeader = 'Basic ' + btoa(':' + nextcloudPass);

    try {
      let response;

      if (request.method === 'GET') {
        // ── Datei von Nextcloud laden ──
        response = await fetch(fileUrl, {
          method: 'GET',
          headers: {
            'Authorization': authHeader,
            'Accept': 'application/json',
          },
        });

        if (response.status === 404) {
          // Noch keine Datei vorhanden – leere DB zurückgeben
          return new Response(JSON.stringify({ students: [], version: 1 }), {
            status: 200,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
          });
        }

        if (!response.ok) {
          return new Response(JSON.stringify({ error: `Nextcloud Fehler: ${response.status}` }), {
            status: response.status,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
          });
        }

        const data = await response.text();
        return new Response(data, {
          status: 200,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });

      } else if (request.method === 'PUT') {
        // ── Datei in Nextcloud speichern ──
        const body = await request.text();

        // Validieren dass es JSON ist
        try { JSON.parse(body); } catch(e) {
          return new Response(JSON.stringify({ error: 'Ungültiges JSON' }), {
            status: 400,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
          });
        }

        response = await fetch(fileUrl, {
          method: 'PUT',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
          },
          body,
        });

        if (response.ok || response.status === 201 || response.status === 204) {
          return new Response(JSON.stringify({ ok: true, status: response.status }), {
            status: 200,
            headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
          });
        }

        return new Response(JSON.stringify({ error: `Nextcloud Fehler: ${response.status}` }), {
          status: response.status,
          headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
        });
      }

    } catch(e) {
      return new Response(JSON.stringify({ error: 'Worker Fehler: ' + e.message }), {
        status: 500,
        headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
      });
    }
  }
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://st-bauer.github.io',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}
