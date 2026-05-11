<script lang="ts">
  import { goto } from '$app/navigation'
  import { toast } from 'svelte-sonner'
  import { api } from '$lib/api/client'
  import { uploadScreenshot } from '$lib/api/uploads'
  import { userState } from '$lib/state/userState.svelte'
  import { Button } from '@coms-portal/ui/primitives'
  import EmployeeSelector from '$lib/components/points/EmployeeSelector.svelte'
  import { Award, AlertTriangle, ChevronRight } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'
  import { getErrorMessage } from '$lib/api/client'

  const user = $derived(userState.current)
  const isSelfOnly = $derived(!(user?.canSubmitPoints ?? false))

  let userId = $state<string>('')
  let level = $state(1)
  let reason = $state('')
  let relatedStaff = $state('')
  let screenshotFile = $state<File | undefined>()
  let screenshotPreview = $state<string | undefined>()
  let isSubmitting = $state(false)
  let error = $state<string | null>(null)

  $effect(() => {
    if (isSelfOnly && user?.id) userId = user.id
  })

  function getImpactBand(l: number): 'low' | 'medium' | 'high' {
    if (l <= 3) return 'low'
    if (l <= 6) return 'medium'
    return 'high'
  }

  const IMPACT_LABELS = { low: 'Kecil', medium: 'Sedang', high: 'Besar' }
  const IMPACT_COLORS = {
    low: 'text-primary/60 bg-primary/8 border-primary/15',
    medium: 'text-primary bg-primary/10 border-primary/20',
    high: 'text-primary bg-primary/15 border-primary/30',
  }

  const impact = $derived(getImpactBand(level))

  function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (file) {
      screenshotFile = file
      screenshotPreview = URL.createObjectURL(file)
    }
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault()
    error = null

    if (!userId) { error = m.form_error_select_employee(); return }
    if (!reason.trim()) { error = m.poin_aha_form_error_describe(); return }

    isSubmitting = true
    try {
      const screenshotUrl = screenshotFile ? await uploadScreenshot(screenshotFile) : undefined
      const payload = {
        userId,
        categoryCode: 'POIN_AHA',
        points: level,
        reason: reason.trim(),
        relatedStaff: relatedStaff.trim() || undefined,
        screenshotUrl,
      }
      const result = await api.api.v1.points.post(payload as never)
      if (result.error) {
        error = getErrorMessage(result.error, m.form_error_submission_failed())
        return
      }
      toast.success(m.poin_aha_form_submit())
      goto('/points')
    } catch (err) {
      error = err instanceof Error ? err.message : m.form_error_submission_failed()
    } finally {
      isSubmitting = false
    }
  }
</script>

<div class="min-h-screen bg-background">
  <!-- Page header -->
  <div class="bg-primary-dark px-4 pt-5 pb-6">
    <div class="max-w-lg mx-auto">
      <div class="flex items-center gap-1.5 text-white/60 text-xs font-medium mb-3">
        <a href="/points" class="hover:text-white/80 transition-colors">Poin</a>
        <ChevronRight class="w-3 h-3" />
        <span class="text-white/90">Catat Poin AHA</span>
      </div>
      <div class="flex items-start gap-3">
        <div
          class="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-primary/20 border border-primary/30 mt-0.5"
        >
          <Award class="w-5 h-5 text-primary-light" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-white leading-tight">{m.poin_aha_form_title()}</h1>
          <p class="text-white/60 text-xs mt-1">
            Isi semua bagian dengan teliti sebelum mengirim
          </p>
        </div>
      </div>
    </div>
  </div>

  <!-- Form body -->
  <div class="max-w-lg mx-auto px-4 py-5 space-y-4">
    <form onsubmit={handleSubmit} class="space-y-4">

      <!-- Step 1: Employee -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold leading-none"
          >1</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.form_staff_name()}
          </span>
        </div>
        <div class="p-4">
          {#if isSelfOnly}
            <div
              class="flex h-10 w-full items-center rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground"
            >
              {user?.name ?? ''}
            </div>
          {:else}
            <EmployeeSelector
              value={userId}
              onChange={(id) => (userId = id)}
              excludeId={user?.role === 'leader' ? (user?.id ?? undefined) : undefined}
            />
          {/if}
        </div>
      </div>

      <!-- Step 2: Activity / Reason -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold leading-none"
          >2</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.poin_aha_form_activity()}
          </span>
        </div>
        <div class="p-4">
          <textarea
            class="flex min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-colors resize-none"
            placeholder={m.poin_aha_form_activity_placeholder()}
            bind:value={reason}
            maxlength={1000}
          ></textarea>
          <div class="flex justify-end mt-1">
            <span class="text-[10px] text-muted-foreground">{reason.length}/1000</span>
          </div>
        </div>
      </div>

      <!-- Step 3: Impact level -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold leading-none"
          >3</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.poin_aha_form_level({ level: String(level) })}
          </span>
        </div>
        <div class="p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Pilih tingkat dampak</span>
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-full border {IMPACT_COLORS[impact]}"
            >
              {IMPACT_LABELS[impact]}
            </span>
          </div>
          <div class="grid grid-cols-5 gap-2">
            {#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}
              {@const band = getImpactBand(n)}
              {@const isSelected = level === n}
              <button
                type="button"
                onclick={() => (level = n)}
                class="flex flex-col items-center justify-center h-11 rounded-lg border text-sm font-bold transition-all {isSelected
                  ? 'border-primary bg-primary text-white shadow-md scale-105'
                  : band === 'high'
                    ? 'border-primary/20 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/20'
                    : band === 'medium'
                      ? 'border-primary/15 bg-primary/8 text-primary/80 hover:border-primary/30 hover:bg-primary/15'
                      : 'border-slate-200 bg-slate-50/50 text-slate-600 hover:border-slate-400 hover:bg-slate-100'}"
              >
                {n}
              </button>
            {/each}
          </div>
        </div>
      </div>

      <!-- Step 4: Related staff (optional) -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold leading-none"
          >4</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.form_related_staff()}
          </span>
        </div>
        <div class="p-4">
          <input
            type="text"
            class="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/50 transition-colors"
            placeholder={m.form_related_staff_placeholder()}
            bind:value={relatedStaff}
            maxlength={500}
          />
        </div>
      </div>

      <!-- Step 5: Screenshot (optional) -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold leading-none"
          >5</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.form_screenshot_optional()}
          </span>
        </div>
        <div class="p-4 space-y-2">
          <label
            class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/30 transition-colors"
          >
            <span class="text-sm text-muted-foreground">
              {screenshotFile ? screenshotFile.name : 'Click to upload screenshot (optional)'}
            </span>
            <input type="file" accept="image/*" class="hidden" onchange={handleFileChange} />
          </label>
          {#if screenshotPreview}
            <div class="aspect-video rounded-xl overflow-hidden border border-border">
              <img src={screenshotPreview} alt="Preview" class="object-cover w-full h-full" />
            </div>
          {/if}
        </div>
      </div>

      {#if error}
        <div
          class="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5"
        >
          <AlertTriangle class="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
          <p class="text-sm text-destructive leading-snug">{error}</p>
        </div>
      {/if}

      <Button
        type="submit"
        disabled={isSubmitting}
        class="w-full btn-gradient-blue text-white font-semibold h-11 rounded-xl shadow-md"
      >
        {isSubmitting ? m.common_submitting() : m.poin_aha_form_submit()}
      </Button>

      <p class="text-center text-[11px] text-muted-foreground pb-2">
        Poin AHA akan tercatat dan berkontribusi pada skor anggota
      </p>
    </form>
  </div>
</div>
