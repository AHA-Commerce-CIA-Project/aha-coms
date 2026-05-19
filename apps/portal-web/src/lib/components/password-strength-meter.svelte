<script lang="ts">
  import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core'
  import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common'
  import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en'

  // Configure zxcvbn once per page-load (module scope — runs on first import).
  // The dictionaries cover common passwords, English words, common surnames,
  // and the adjacency graphs zxcvbn uses to detect keyboard patterns.
  zxcvbnOptions.setOptions({
    translations: zxcvbnEnPackage.translations,
    graphs: zxcvbnCommonPackage.adjacencyGraphs,
    dictionary: {
      ...zxcvbnCommonPackage.dictionary,
      ...zxcvbnEnPackage.dictionary,
    },
  })

  // `userInputs` lets callers pass the user's email/name so zxcvbn flags
  // password attempts that derive from their own identity (`alice2026!` for
  // user `alice@…`).
  let {
    password = '',
    userInputs = [],
    minLength = 12,
  }: {
    password?: string
    userInputs?: string[]
    minLength?: number
  } = $props()

  // zxcvbn returns score 0-4 (0 = top-10 worst, 4 = strong against offline
  // attack). We also enforce the spec's length floor — anything below
  // minLength is forced to weak regardless of score.
  const result = $derived.by(() => {
    if (password.length === 0) return null
    return zxcvbn(password, userInputs.filter((s) => s.length > 0))
  })

  const tooShort = $derived(password.length > 0 && password.length < minLength)

  type Tier = {
    label: string
    width: string
    barClass: string
    textClass: string
  }

  const tier = $derived<Tier>(
    tooShort
      ? { label: `Too short — minimum ${minLength} characters`, width: 'w-1/5', barClass: 'bg-rose-500', textClass: 'text-rose-500' }
      : !result
        ? { label: '', width: 'w-0', barClass: 'bg-transparent', textClass: 'text-transparent' }
        : result.score === 0
          ? { label: 'Very weak', width: 'w-1/4', barClass: 'bg-rose-500', textClass: 'text-rose-500' }
          : result.score === 1
            ? { label: 'Weak', width: 'w-2/5', barClass: 'bg-rose-400', textClass: 'text-rose-500' }
            : result.score === 2
              ? { label: 'Fair', width: 'w-3/5', barClass: 'bg-amber-500', textClass: 'text-amber-500' }
              : result.score === 3
                ? { label: 'Strong', width: 'w-4/5', barClass: 'bg-emerald-500', textClass: 'text-emerald-500' }
                : { label: 'Very strong', width: 'w-full', barClass: 'bg-emerald-500', textClass: 'text-emerald-500' },
  )

  const warning = $derived(result?.feedback.warning ?? '')
  const suggestions = $derived(result?.feedback.suggestions ?? [])
  const crackTime = $derived(
    result?.crackTimesDisplay.offlineSlowHashing1e4PerSecond ?? '',
  )
</script>

{#if password.length > 0}
  <div class="mt-1.5 space-y-1" data-testid="password-strength-meter">
    <div class="h-1 w-full overflow-hidden rounded bg-muted">
      <div class="h-full transition-all {tier.width} {tier.barClass}"></div>
    </div>
    <p class="text-[10px] {tier.textClass}">
      {tier.label}
      {#if !tooShort && crackTime}
        <span class="text-muted-foreground">— ~{crackTime} to crack offline</span>
      {/if}
    </p>
    {#if warning && !tooShort}
      <p class="text-[10px] text-amber-600">⚠ {warning}</p>
    {/if}
    {#if suggestions.length > 0 && !tooShort}
      <ul class="ml-3 list-disc text-[10px] text-muted-foreground">
        {#each suggestions as suggestion (suggestion)}
          <li>{suggestion}</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}
