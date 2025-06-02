/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
    const response = await resolve(event);

    // 모든 응답에 COOP/COEP/CORP 헤더 추가
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
    // CORP 헤더는 이미 Vite 설정에 있지만, 여기서도 명시적으로 추가하여 확실하게 적용
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');

    return response;
} 