<script>
    import "../app.css";
    import { onMount } from "svelte";
    import { page } from "$app/stores";

    let { children } = $props();

    let manifestHref = $derived(
        $page.url.searchParams.get("name")
            ? `/manifest.json?name=${encodeURIComponent($page.url.searchParams.get("name") || "")}`
            : "/manifest.json",
    );

    onMount(() => {
        // Register Service Worker for PWA
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((registration) => {
                    console.log(
                        "ServiceWorker registration successful with scope: ",
                        registration.scope,
                    );
                })
                .catch((err) => {
                    console.log("ServiceWorker registration failed: ", err);
                });
        }
    });
</script>

<svelte:head>
    <link rel="manifest" href={manifestHref} />
</svelte:head>

{@render children()}
