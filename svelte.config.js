import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterStatic from '@sveltejs/adapter-static';

const isStatic = process.env.BUILD_TARGET === 'static';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		appDir: isStatic ? 'app' : '_app',
		paths: {
			base: process.env.BASE_PATH || ''
		},
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: isStatic
			? adapterStatic({ fallback: 'index.html', strict: false })
			: adapterCloudflare()
	}
};

export default config;
