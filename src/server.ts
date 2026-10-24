import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './mcp.js';

async function main() {
  const server = createMcpServer();
  await server.connect(new StdioServerTransport());
}

main().catch(error => {
  console.error('Domain Scout failed to start:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
