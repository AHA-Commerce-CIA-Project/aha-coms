import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'AHA COMSS - Company Support Systems',
        short_name: 'AHA COMSS',
        description: 'Company Support Systems for the AHA team — task tracking, routine management, and team collaboration.',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0F0E7F',
        icons: [
            // Two entries per icon — one for `any` (default home-screen badge)
            // and one for `maskable` (adaptive icon on Android). The W3C spec
            // allows the space-separated form but Next.js's MetadataRoute types
            // reject it, so we split them out explicitly.
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['business', 'productivity'],
    };
}
