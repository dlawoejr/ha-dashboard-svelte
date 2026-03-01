export const prerender = process.env.BUILD_TARGET === 'static' ? true : false;

export async function GET({ url }) {
    // 빌드 타임(prerender)에는 URL 정보가 없으므로 기본 이름 사용
    let appName = 'HA Dash';

    try {
        // 동적 런타임일 경우에만 searchParams와 hostname 접근
        const nameParam = url.searchParams.get('name');
        if (nameParam) {
            appName = nameParam;
        } else if (url.hostname) {
            const host = url.hostname;
            const parts = host.split('.');
            const subdomain = parts[0];

            if (subdomain && subdomain !== 'localhost' && subdomain !== '127') {
                appName = subdomain.charAt(0).toUpperCase() + subdomain.slice(1);
            }
        }
    } catch (e) {
        // Pre-rendering 시 URL 접근 에러 무시
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
