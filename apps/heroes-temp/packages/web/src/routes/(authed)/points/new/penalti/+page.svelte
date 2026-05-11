<script lang="ts">
  import { goto } from '$app/navigation'
  import { toast } from 'svelte-sonner'
  import { api } from '$lib/api/client'
  import { uploadScreenshot } from '$lib/api/uploads'
  import { userState } from '$lib/state/userState.svelte'
  import { Button } from '@coms-portal/ui/primitives'
  import EmployeeSelector from '$lib/components/points/EmployeeSelector.svelte'
  import { AlertTriangle, ChevronRight } from 'lucide-svelte'
  import * as m from '$lib/paraglide/messages'
  import { KITTA_CODES, KITTA_LABELS, KITTA_DESCRIPTIONS } from '@coms/shared/constants'
  import type { KittaCode } from '@coms/shared/constants'
  import { getErrorMessage } from '$lib/api/client'

  const user = $derived(userState.current)
  const isSelfOnly = $derived(!(user?.canSubmitPoints ?? false))

  let userId = $state<string>('')
  let kittaComponent = $state<KittaCode | undefined>(undefined)
  let violationLevel = $state(1)
  let reason = $state('')
  let relatedStaff = $state('')
  let screenshotFile = $state<File | undefined>()
  let screenshotPreview = $state<string | undefined>()
  let isSubmitting = $state(false)
  let error = $state<string | null>(null)

  $effect(() => {
    if (isSelfOnly && user?.id) userId = user.id
  })

  function getSeverityBand(level: number): 'low' | 'medium' | 'high' {
    if (level <= 3) return 'low'
    if (level <= 6) return 'medium'
    return 'high'
  }

  const SEVERITY_LABELS = { low: 'Ringan', medium: 'Sedang', high: 'Berat' }
  const SEVERITY_COLORS = {
    low: 'text-status-pending bg-status-pending-bg border-status-pending/20',
    medium: 'text-destructive/70 bg-destructive/5 border-destructive/20',
    high: 'text-penalti bg-destructive/10 border-destructive/20',
  }

  const violationDescriptions: Record<number, () => string> = {
    1: m.violation_1, 2: m.violation_2, 3: m.violation_3, 4: m.violation_4,
    5: m.violation_5, 6: m.violation_6, 7: m.violation_7, 8: m.violation_8,
    9: m.violation_9, 10: m.violation_10,
  }

  const severity = $derived(getSeverityBand(violationLevel))

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
    if (!kittaComponent) { error = m.penalti_form_error_select_kitta(); return }
    if (!reason.trim()) { error = m.penalti_form_error_describe(); return }
    if (!screenshotFile) { error = m.form_error_screenshot_required(); return }

    isSubmitting = true
    try {
      const screenshotUrl = await uploadScreenshot(screenshotFile)
      const payload = {
        userId,
        categoryCode: 'PENALTI',
        points: violationLevel,
        reason: reason.trim(),
        relatedStaff: relatedStaff.trim() || undefined,
        screenshotUrl,
        kittaComponent: kittaComponent as KittaCode,
      }
      const result = await api.api.v1.points.post(payload as never)
      if (result.error) {
        error = getErrorMessage(result.error, m.form_error_submission_failed())
        return
      }
      toast.success(m.penalti_form_submit())
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
        <span class="text-white/90">Catat Penalti</span>
      </div>
      <div class="flex items-start gap-3">
        <div
          class="flex-shrink-0 flex items-center justify-center w-11 h-11 rounded-xl bg-penalti/20 border border-penalti/30 mt-0.5"
        >
          <AlertTriangle class="w-5 h-5 text-penalti-light" />
        </div>
        <div>
          <h1 class="text-xl font-bold text-white leading-tight">{m.penalti_form_title()}</h1>
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
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-dark text-white text-[10px] font-bold leading-none"
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
              excludeId={user?.id ?? undefined}
            />
          {/if}
        </div>
      </div>

      <!-- Step 2: KITTA category -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-dark text-white text-[10px] font-bold leading-none"
          >2</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.penalti_form_kitta_category()}
          </span>
        </div>
        <div class="p-4 space-y-2">
          {#each KITTA_CODES as code (code)}
            <label
              class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all {kittaComponent === code ? 'border-penalti/50 bg-destructive/10 shadow-sm' : 'border-border hover:border-penalti/20 hover:bg-muted/40'}"
            >
              <input
                type="radio"
                name="kitta"
                value={code}
                checked={kittaComponent === code}
                onchange={() => (kittaComponent = code)}
                class="mt-1 accent-penalti"
              />
              <div class="min-w-0">
                <p
                  class="text-sm font-semibold {kittaComponent === code ? 'text-penalti' : 'text-foreground'}"
                >
                  {code}<span class="font-normal text-foreground/80 ml-1">— {KITTA_LABELS[code]}</span>
                </p>
                <p class="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {KITTA_DESCRIPTIONS[code]}
                </p>
              </div>
            </label>
          {/each}
        </div>
      </div>

      <!-- Step 3: Violation level -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-dark text-white text-[10px] font-bold leading-none"
          >3</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.penalti_form_violation_level({ level: String(violationLevel) })}
          </span>
        </div>
        <div class="p-4 space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">Pilih tingkat pelanggaran</span>
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-full border {SEVERITY_COLORS[severity]}"
            >
              {SEVERITY_LABELS[severity]}
            </span>
          </div>
          <div class="grid grid-cols-5 gap-2">
            {#each Array.from({ length: 10 }, (_, i) => i + 1) as n (n)}
              {@const band = getSeverityBand(n)}
              {@const isSelected = violationLevel === n}
              <button
                type="button"
                onclick={() => (violationLevel = n)}
                class="flex flex-col items-center justify-center h-11 rounded-lg border text-sm font-bold transition-all {isSelected
                  ? 'border-penalti bg-penalti text-white shadow-md scale-105'
                  : band === 'high'
                    ? 'border-destructive/20 bg-destructive/5 text-destructive hover:border-penalti/60 hover:bg-destructive/10'
                    : band === 'medium'
                      ? 'border-destructive/15 bg-destructive/5 text-destructive/70 hover:border-destructive/30 hover:bg-destructive/10'
                      : 'border-status-pending/20 bg-status-pending-bg text-status-pending hover:border-status-pending/40 hover:bg-status-pending/20'}"
              >
                {n}
              </button>
            {/each}
          </div>
          <div class="rounded-lg bg-muted/60 border border-border px-3 py-2.5">
            <p class="text-xs text-muted-foreground leading-relaxed">
              {violationDescriptions[violationLevel]?.()}
            </p>
          </div>
        </div>
      </div>

      <!-- Step 4: Reason / Incident -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-dark text-white text-[10px] font-bold leading-none"
          >4</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.penalti_form_incident()}
          </span>
        </div>
        <div class="p-4">
          <textarea
            class="flex min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-penalti/40 focus-visible:border-penalti/50 transition-colors resize-none"
            placeholder={m.penalti_form_incident_placeholder()}
            bind:value={reason}
            maxlength={1000}
          ></textarea>
          <div class="flex justify-end mt-1">
            <span class="text-[10px] text-muted-foreground">{reason.length}/1000</span>
          </div>
        </div>
      </div>

      <!-- Step 5: Related staff (optional) -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-dark text-white text-[10px] font-bold leading-none"
          >5</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.form_related_staff()}
          </span>
        </div>
        <div class="p-4">
          <input
            type="text"
            class="flex h-10 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-penalti/40 focus-visible:border-penalti/50 transition-colors"
            placeholder={m.form_related_staff_placeholder()}
            bind:value={relatedStaff}
            maxlength={500}
          />
        </div>
      </div>

      <!-- Step 6: Screenshot (required) -->
      <div class="rounded-xl border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-4 py-3 border-b border-border bg-muted/40">
          <span
            class="flex-shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-primary-dark text-white text-[10px] font-bold leading-none"
          >6</span>
          <span class="text-xs font-bold tracking-[0.06em] text-muted-foreground uppercase">
            {m.form_screenshot_required()}
          </span>
        </div>
        <div class="p-4 space-y-2">
          <label
            class="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl cursor-pointer hover:bg-muted/30 transition-colors"
          >
            <span class="text-sm text-muted-foreground">
              {screenshotFile ? screenshotFile.name : 'Click to upload screenshot'}
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
        class="w-full btn-gradient-red text-white font-semibold h-11 rounded-xl shadow-md"
      >
        {isSubmitting ? m.common_submitting() : m.penalti_form_submit()}
      </Button>

      <p class="text-center text-[11px] text-muted-foreground pb-2">
        Data penalti akan tercatat dan menjadi bagian dari rekam jejak anggota
      </p>
    </form>
  </div>
</div>
