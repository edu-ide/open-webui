<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { authService } from '$lib/services/authService';
	import { oauth2Error } from '$lib/stores/oauth2';
	import Spinner from '$lib/components/common/Spinner.svelte';

	let processing = true;
	let error = '';

	onMount(async () => {
		// Get OAuth2 callback parameters
		const code = $page.url.searchParams.get('code');
		const state = $page.url.searchParams.get('state');
		const errorParam = $page.url.searchParams.get('error');
		const errorDescription = $page.url.searchParams.get('error_description');

		if (errorParam) {
			// OAuth2 error response
			error = errorDescription || errorParam;
			processing = false;
			oauth2Error.set(error);
			
			// Redirect to login after delay
			setTimeout(() => {
				goto('/auth/login');
			}, 3000);
			return;
		}

		if (!code || !state) {
			error = 'Invalid callback parameters';
			processing = false;
			return;
		}

		try {
			// Handle OAuth2 callback
			const success = await authService.handleCallback(code, state);
			
			if (success) {
				// Redirect to main app
				await goto('/');
			} else {
				error = 'Authentication failed';
				processing = false;
			}
		} catch (err) {
			console.error('Callback error:', err);
			error = err.message || 'Authentication failed';
			processing = false;
		}
	});
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			{#if processing}
				<Spinner className="w-12 h-12 mx-auto mb-4" />
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
					Completing authentication...
				</h2>
				<p class="mt-2 text-gray-600 dark:text-gray-400">
					Please wait while we log you in
				</p>
			{:else if error}
				<div class="rounded-full bg-red-100 dark:bg-red-900 p-3 mx-auto w-fit mb-4">
					<svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
				</div>
				<h2 class="text-2xl font-bold text-gray-900 dark:text-white">
					Authentication Failed
				</h2>
				<p class="mt-2 text-red-600 dark:text-red-400">
					{error}
				</p>
				<p class="mt-4 text-sm text-gray-600 dark:text-gray-400">
					Redirecting to login...
				</p>
			{/if}
		</div>
	</div>
</div>