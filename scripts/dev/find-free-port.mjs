#!/usr/bin/env node

import net from 'node:net';

const server = net.createServer();

server.once('error', (error) => {
  console.error(`Unable to allocate a local port: ${error.message}`);
  process.exit(1);
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (!address || typeof address === 'string') {
    console.error('Unable to determine the allocated local port');
    process.exit(1);
  }
  console.log(address.port);
  server.close();
});
