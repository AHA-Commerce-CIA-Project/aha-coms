<script lang="ts">
  interface EnumField { type: 'enum'; values: string[]; default: string }
  interface BooleanField { type: 'boolean'; default: boolean }
  interface IntegerField { type: 'integer'; default: number }
  interface StringField { type: 'string'; default: string }

  type ConfigField = EnumField | BooleanField | IntegerField | StringField
  type ConfigSchema = Record<string, ConfigField>

  interface Props {
    configSchema: ConfigSchema
    value: Record<string, unknown>
    onchange?: (newValue: Record<string, unknown>) => void
  }

  let { configSchema, value, onchange }: Props = $props()

  function update(key: string, fieldValue: unknown) {
    onchange?.({ ...value, [key]: fieldValue })
  }

  function fieldValue(key: string, field: ConfigField): unknown {
    return key in value ? value[key] : field.default
  }
</script>

<div class="space-y-4">
  {#each Object.entries(configSchema) as [key, field]}
    <div class="flex items-start gap-4">
      <label class="w-40 shrink-0 pt-2 text-sm font-medium text-muted-foreground" for="field-{key}">
        {key}
      </label>
      <div class="flex-1">
        {#if field.type === 'enum'}
          <select
            id="field-{key}"
            value={String(fieldValue(key, field) ?? '')}
            onchange={(e) => update(key, (e.target as HTMLSelectElement).value)}
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          >
            <option value="" disabled>— select —</option>
            {#each (field as EnumField).values as opt}
              <option value={opt}>{opt}</option>
            {/each}
          </select>
        {:else if field.type === 'boolean'}
          <label class="flex items-center gap-2 cursor-pointer">
            <input
              id="field-{key}"
              type="checkbox"
              checked={Boolean(fieldValue(key, field))}
              onchange={(e) => update(key, (e.target as HTMLInputElement).checked)}
              class="rounded border-border"
            />
            <span class="text-sm text-foreground">{fieldValue(key, field) ? 'Yes' : 'No'}</span>
          </label>
        {:else if field.type === 'integer'}
          <input
            id="field-{key}"
            type="number"
            step="1"
            value={Number(fieldValue(key, field) ?? (field as IntegerField).default)}
            onchange={(e) => update(key, parseInt((e.target as HTMLInputElement).value, 10))}
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        {:else}
          <input
            id="field-{key}"
            type="text"
            value={String(fieldValue(key, field) ?? '')}
            oninput={(e) => update(key, (e.target as HTMLInputElement).value)}
            class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-ring focus:outline-none"
          />
        {/if}
      </div>
    </div>
  {/each}
</div>
