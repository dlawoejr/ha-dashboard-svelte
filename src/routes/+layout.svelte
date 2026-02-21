<script>
    import '../app.css';
    import { onMount } from 'svelte';

    let { children } = $props();

    onMount(() => {
        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(err => {
                    console.log('ServiceWorker registration failed: ', err);
                });
        }
    });
</script>

{@render children()}
