<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { oauth2Authenticated, oauth2Loading } from '$lib/stores/oauth2';
	import { authService } from '$lib/services/authService';
	import Spinner from '../common/Spinner.svelte';

	export let requireAuth = true;
	export let redirectTo = '/auth/login';

	let checking = true;

	onMount(async () => {
		if (!requireAuth) {
			checking = false;
			return;
		}

		// Check authentication status
		const isAuthenticated = await authService.initialize();
		
		if (!isAuthenticated) {
			// Not authenticated, redirect to login
			const currentUrl = $page.url.pathname + $page.url.search;
			const encodedUrl = encodeURIComponent(currentUrl);
			await goto(`${redirectTo}?redirect=${encodedUrl}`);
		} else {
			checking = false;
		}
	});
</script>

{#if checking || $oauth2Loading}
	<div class="flex items-center justify-center min-h-screen">
		<div class="text-center">
			<Spinner className="w-8 h-8 mx-auto mb-4" />
			<p class="text-gray-600 dark:text-gray-400">Checking authentication...</p>
		</div>
	</div>
{:else if $oauth2Authenticated || !requireAuth}
	<slot />
{:else}
	<div class="flex items-center justify-center min-h-screen">
		<div class="text-center">
			<p class="text-gray-600 dark:text-gray-400">Redirecting to login...</p>
		</div>
	</div>
{/if}