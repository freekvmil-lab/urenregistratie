/* import type { NextConfig } from "next";

const nextConfig: NextConfig = {
   config options here 
};

export default nextConfig;
*/

const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development'
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // 👇 DIT IS DE FIX
  experimental: {
    turbo: false,
  },
}

module.exports = withPWA(nextConfig)
