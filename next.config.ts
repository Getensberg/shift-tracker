import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg", "exceljs"],
  // Prisma в режиме engineType = "client" читает query_compiler_bg.wasm с диска.
  // Трассировщик Next.js этот файл не видит, поэтому без явного включения он
  // не попадает в serverless-функцию на Vercel (ENOENT ... query_compiler_bg.wasm).
  outputFileTracingIncludes: {
    "/**": ["./node_modules/.prisma/client/*.wasm", "./node_modules/.prisma/client/query_compiler_bg.js"],
  },
};

export default nextConfig;
