export function renderSpaShellHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://challenges.cloudflare.com; img-src 'self' data:; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self';" />
    <title>CourtListener MCP Portal</title>
    <link rel="stylesheet" href="/app/assets/spa.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app/assets/spa.js"></script>
  </body>
</html>`;
}
