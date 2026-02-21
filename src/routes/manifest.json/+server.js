export const prerender = false; // We need this to be dynamic on request

export async function GET({ url }) {
    // 1. Try to get a specific name from the query parameters (e.g. ?name=Office)
    let appName = url.searchParams.get('name');

    // 2. If no name in URL or browser strips it, extract the subdomain automatically
    if (!appName) {
        const host = url.hostname;
        const parts = host.split('.');
        const subdomain = parts[0];

        // Capitalize the first letter (e.g. "home.abc.com" -> "Home")
        if (subdomain && subdomain !== 'localhost' && subdomain !== '127') {
            appName = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
        } else {
            // Default app name if it's localhost or an IP address
            appName = 'HA Dash';
        }
    }

    const manifest = {
        "name": "Home Assistant Dashboard",
        "short_name": appName,
        "start_url": "/?source=pwa",
        "display": "standalone",
        "background_color": "#0f172a",
        "theme_color": "#0f172a",
        "orientation": "portrait-primary",
        "icons": [
            {
                "src": "images/icon-192.png",
                "type": "image/png",
                "sizes": "192x192"
            },
            {
                "src": "images/icon-512.png",
                "type": "image/png",
                "sizes": "512x512"
            }
        ]
    };

    return new Response(JSON.stringify(manifest), {
        headers: {
            'Content-Type': 'application/manifest+json; charset=utf-8'
        }
    });
}
