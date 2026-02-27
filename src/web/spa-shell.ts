export function renderSpaShellHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CourtListener MCP Portal</title>
    <link rel="stylesheet" href="/app/assets/spa.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/app/assets/spa.js"></script>
  </body>
</html>`;
}
