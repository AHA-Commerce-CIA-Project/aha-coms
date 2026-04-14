import { defineConfig } from '@tanstack/react-start/config'

export default defineConfig({
  server: {
    // Portal serves at root — no base path for the portal itself.
    // Individual apps (heroes, fast) each set their own baseURL in their own app.config.ts.
    preset: 'bun',
  },
  tsr: {
    appDirectory: 'src',
    routesDirectory: 'src/routes',
    generatedRouteTree: 'src/routeTree.gen.ts',
  },
})
