<script lang="ts">
	import { onMount } from 'svelte';
	import { authService } from '$lib/services/authService';
	import { oauth2Authenticating, oauth2Error } from '$lib/stores/oauth2';
	import Spinner from '$lib/components/common/Spinner.svelte';

	let loading = false;

	onMount(async () => {
		// Check if already authenticated
		const isAuthenticated = await authService.initialize();
		if (isAuthenticated) {
			// Redirect to main app
			window.location.href = '/';
		}
	});

	async function handleLogin() {
		loading = true;
		try {
			await authService.login();
			// This will redirect to OAuth2 provider
		} catch (error) {
			console.error('Login error:', error);
			loading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
	<div class="max-w-md w-full space-y-8">
		<div>
			<div class="mx-auto h-12 w-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
				<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
				</svg>
			</div>
			
			<h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
				Sign in to AI Chat
			</h2>
			<p class="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
				Secure authentication with OAuth2
			</p>
		</div>
		
		<div class="mt-8 space-y-6">
			{#if $oauth2Error}
				<div class="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
					<div class="flex">
						<div class="flex-shrink-0">
							<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
							</svg>
						</div>
						<div class="ml-3">
							<h3 class="text-sm font-medium text-red-800 dark:text-red-200">
								Authentication Error
							</h3>
							<div class="mt-2 text-sm text-red-700 dark:text-red-300">
								{$oauth2Error}
							</div>
						</div>
					</div>
				</div>
			{/if}

			<div>
				<button
					on:click={handleLogin}
					disabled={loading || $oauth2Authenticating}
					class="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
				>
					{#if loading || $oauth2Authenticating}
						<Spinner className="w-5 h-5 mr-2" />
						Signing in...
					{:else}
						<span class="absolute left-0 inset-y-0 flex items-center pl-3">
							<svg class="h-5 w-5 text-blue-500 group-hover:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd" />
							</svg>
						</span>
						Sign in with OAuth2
					{/if}
				</button>
			</div>

			<div class="mt-6">
				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-gray-300 dark:border-gray-700"></div>
					</div>
					<div class="relative flex justify-center text-sm">
						<span class="px-2 bg-gray-50 dark:bg-gray-900 text-gray-500">Features</span>
					</div>
				</div>

				<div class="mt-6 grid grid-cols-2 gap-3 text-sm">
					<div class="flex items-center">
						<svg class="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-gray-700 dark:text-gray-300">Secure Authentication</span>
					</div>
					<div class="flex items-center">
						<svg class="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-gray-700 dark:text-gray-300">MCP Tools</span>
					</div>
					<div class="flex items-center">
						<svg class="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-gray-700 dark:text-gray-300">AI Chat</span>
					</div>
					<div class="flex items-center">
						<svg class="h-5 w-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
						</svg>
						<span class="text-gray-700 dark:text-gray-300">Auto Token Refresh</span>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>