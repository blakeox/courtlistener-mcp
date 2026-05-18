#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import { resolveZoneId } from './lib/cloudflare-api.mjs';

async function main() {
  const zoneName = process.env.CLOUDFLARE_ZONE_NAME?.trim() || 'blakeoxford.com';
  const zoneId = await resolveZoneId({ zoneName });
  console.log(JSON.stringify({ zoneName, zoneId }, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
