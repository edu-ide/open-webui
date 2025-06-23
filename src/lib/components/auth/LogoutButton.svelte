<script lang="ts">
	import { authService } from '$lib/services/authService';
	import { oauth2Authenticated } from '$lib/stores/oauth2';
	
	export let className = '';
	export let showText = true;
	
	async function handleLogout() {
		await authService.logout();
	}
</script>

{#if $oauth2Authenticated}
	<button
		on:click={handleLogout}
		class="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors {className}"
		aria-label="Logout"
	>
		<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
		</svg>
		{#if showText}
			<span>Logout</span>
		{/if}
	</button>
{/if}