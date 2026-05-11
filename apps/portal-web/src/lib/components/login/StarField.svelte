<script lang="ts">
  let canvas = $state<HTMLCanvasElement | undefined>()

  $effect(() => {
    if (!canvas) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    function resize() {
      if (!canvas) return
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()

    const getCx = () => canvas!.width * 0.35
    const getCy = () => canvas!.height * 0.5

    const TRAIL_COUNT = 200
    const trails = Array.from({ length: TRAIL_COUNT }, () => {
      const angle = Math.random() * Math.PI * 2
      const dist = 40 + Math.random() * Math.max(canvas!.width, canvas!.height) * 0.6
      return {
        angle,
        dist,
        speed: (0.0002 + Math.random() * 0.0006) * (Math.random() > 0.5 ? 1 : -1),
        size: 0.3 + Math.random() * 1.2,
        opacity: 0.15 + Math.random() * 0.5,
        trailLen: 0.08 + Math.random() * 0.25,
        hue: 200 + Math.random() * 40,
      }
    })

    const BRIGHT_COUNT = 60
    const brightStars = Array.from({ length: BRIGHT_COUNT }, () => ({
      x: Math.random() * canvas!.width,
      y: Math.random() * canvas!.height,
      size: 0.8 + Math.random() * 2.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.5 + Math.random() * 2,
      maxOpacity: 0.4 + Math.random() * 0.6,
    }))

    const DUST_COUNT = 8
    const dustClouds = Array.from({ length: DUST_COUNT }, () => ({
      x: Math.random() * canvas!.width,
      y: Math.random() * canvas!.height,
      radius: 60 + Math.random() * 180,
      opacity: 0.01 + Math.random() * 0.025,
      hue: 210 + Math.random() * 30,
      drift: (Math.random() - 0.5) * 0.15,
    }))

    let time = 0
    let animId: number

    function draw() {
      const c = canvas!
      const w = c.width
      const h = c.height
      const cx = getCx()
      const cy = getCy()

      ctx!.fillStyle = 'rgba(10, 14, 42, 0.15)'
      ctx!.fillRect(0, 0, w, h)

      time += 0.016

      for (const dust of dustClouds) {
        dust.x += dust.drift
        if (dust.x > w + dust.radius) dust.x = -dust.radius
        if (dust.x < -dust.radius) dust.x = w + dust.radius

        const grad = ctx!.createRadialGradient(dust.x, dust.y, 0, dust.x, dust.y, dust.radius)
        grad.addColorStop(0, `hsla(${dust.hue}, 60%, 60%, ${dust.opacity})`)
        grad.addColorStop(0.5, `hsla(${dust.hue}, 50%, 40%, ${dust.opacity * 0.5})`)
        grad.addColorStop(1, 'transparent')
        ctx!.fillStyle = grad
        ctx!.fillRect(dust.x - dust.radius, dust.y - dust.radius, dust.radius * 2, dust.radius * 2)
      }

      const burstPulse = 0.85 + Math.sin(time * 0.5) * 0.15
      const burstRadius = Math.min(w, h) * 0.4 * burstPulse
      const burst = ctx!.createRadialGradient(cx, cy, 0, cx, cy, burstRadius)
      burst.addColorStop(0, 'rgba(180, 210, 255, 0.12)')
      burst.addColorStop(0.2, 'rgba(120, 170, 255, 0.06)')
      burst.addColorStop(0.5, 'rgba(80, 130, 255, 0.02)')
      burst.addColorStop(1, 'transparent')
      ctx!.fillStyle = burst
      ctx!.beginPath()
      ctx!.arc(cx, cy, burstRadius, 0, Math.PI * 2)
      ctx!.fill()

      const core = ctx!.createRadialGradient(cx, cy, 0, cx, cy, 30)
      core.addColorStop(0, 'rgba(220, 235, 255, 0.25)')
      core.addColorStop(0.5, 'rgba(180, 210, 255, 0.08)')
      core.addColorStop(1, 'transparent')
      ctx!.fillStyle = core
      ctx!.beginPath()
      ctx!.arc(cx, cy, 30, 0, Math.PI * 2)
      ctx!.fill()

      for (const t of trails) {
        t.angle += t.speed

        const x = cx + Math.cos(t.angle) * t.dist
        const y = cy + Math.sin(t.angle) * t.dist

        const tx = cx + Math.cos(t.angle - t.trailLen * Math.sign(t.speed)) * t.dist
        const ty = cy + Math.sin(t.angle - t.trailLen * Math.sign(t.speed)) * t.dist

        const trailGrad = ctx!.createLinearGradient(tx, ty, x, y)
        trailGrad.addColorStop(0, 'transparent')
        trailGrad.addColorStop(1, `hsla(${t.hue}, 70%, 80%, ${t.opacity})`)

        ctx!.beginPath()
        ctx!.moveTo(tx, ty)
        ctx!.lineTo(x, y)
        ctx!.strokeStyle = trailGrad
        ctx!.lineWidth = t.size
        ctx!.stroke()

        ctx!.beginPath()
        ctx!.arc(x, y, t.size * 0.6, 0, Math.PI * 2)
        ctx!.fillStyle = `hsla(${t.hue}, 60%, 90%, ${t.opacity})`
        ctx!.fill()
      }

      for (const s of brightStars) {
        const pulse = (Math.sin(time * s.speed + s.phase) + 1) / 2
        const opacity = s.maxOpacity * (0.3 + pulse * 0.7)
        const glowSize = s.size * (1.5 + pulse * 2)

        const glow = ctx!.createRadialGradient(s.x, s.y, 0, s.x, s.y, glowSize)
        glow.addColorStop(0, `rgba(200, 220, 255, ${opacity * 0.6})`)
        glow.addColorStop(0.5, `rgba(150, 190, 255, ${opacity * 0.15})`)
        glow.addColorStop(1, 'transparent')
        ctx!.fillStyle = glow
        ctx!.beginPath()
        ctx!.arc(s.x, s.y, glowSize, 0, Math.PI * 2)
        ctx!.fill()

        ctx!.beginPath()
        ctx!.arc(s.x, s.y, s.size * 0.5, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(240, 245, 255, ${opacity})`
        ctx!.fill()
      }

      ctx!.save()
      ctx!.globalAlpha = 0.04 + Math.sin(time * 0.3) * 0.02
      ctx!.strokeStyle = 'rgba(180, 210, 255, 0.5)'
      ctx!.lineWidth = 1
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i + time * 0.02
        const len = Math.min(w, h) * 0.35
        ctx!.beginPath()
        ctx!.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10)
        ctx!.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
        ctx!.stroke()
      }
      ctx!.restore()

      animId = requestAnimationFrame(draw)
    }

    ctx.fillStyle = '#0a0e2a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    animId = requestAnimationFrame(draw)

    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  })
</script>

<canvas
  bind:this={canvas}
  class="pointer-events-none absolute inset-0 h-full w-full"
  aria-hidden="true"
></canvas>
