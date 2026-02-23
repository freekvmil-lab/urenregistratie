/* import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   config options here 
};

export default nextConfig;
*/

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  importScripts: ['/push-sw.js'],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Next.js 16 uses Turbopack by default. next-pwa adds a webpack config, and
  // Next requires an explicit turbopack config in that case.
  turbopack: {},
}

module.exports = withPWA(nextConfig)
