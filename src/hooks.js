/** @type {import('@sveltejs/kit').Reroute} */
export function reroute({ url }) {
    // '/index.html'로 끝나는 요청이 들어오면 내부적으로는 '/' 요청으로 처리하여 404를 방지합니다.
    // 이렇게 하면 주소창의 'index.html'은 유지되면서 SvelteKit은 홈 페이지를 정상 렌더링합니다.
    if (url.pathname.endsWith('/index.html')) {
        return url.pathname.replace('/index.html', '/');
    }
}
